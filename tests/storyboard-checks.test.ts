import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkMediaFiles,
  checkStoryboard,
  checkThemeColors,
  checkTransitions,
  formatIssue,
  type StoryboardIssue,
} from "../src/checks";
import { validateStoryboard, type Storyboard } from "../src/index";

function storyboard(input: Record<string, unknown>): Storyboard {
  const result = validateStoryboard({ title: "Test", aspect: "9:16", ...input });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

const title = (id: string, extra: Record<string, unknown> = {}) => ({ id, component: "TitleCard", props: { title: id }, durationMs: 2000, ...extra });

describe("checkTransitions", () => {
  it("warns on every boundary without a transition, never on the last scene", () => {
    const issues = checkTransitions(
      storyboard({ scenes: [title("a"), title("b", { transition: { type: "fade" } }), title("c"), title("d")] }),
    );
    expect(issues.map((i) => [i.check, i.severity, i.sceneId])).toEqual([
      ["transition", "warn", "a"],
      ["transition", "warn", "c"],
    ]);
    expect(issues[0]!.message).toContain('"b"');
    expect(issues[0]!.message).toContain("slide");
  });

  it("accepts an explicit cut and a single-scene storyboard", () => {
    expect(checkTransitions(storyboard({ scenes: [title("a", { transition: { type: "cut" } }), title("b")] }))).toEqual([]);
    expect(checkTransitions(storyboard({ scenes: [title("a")] }))).toEqual([]);
  });
});

const chat = (avatarColor: string) => ({
  id: "chat",
  component: "ChatWindow",
  props: { channel: "#team", messages: [{ author: "Ana", time: "9:00", text: "Hi", avatar: { initials: "A", color: avatarColor } }] },
  durationMs: 3000,
});

describe("checkThemeColors", () => {
  it("warns on a color the theme does not have, naming where it is", () => {
    const issues = checkThemeColors(storyboard({ scenes: [chat("#ff0000")] }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ check: "theme-color", severity: "warn", sceneId: "chat" });
    expect(issues[0]!.message).toContain("messages[0].avatar.color");
    expect(issues[0]!.message).toContain("#ff0000");
  });

  it("accepts the theme's own colors in any case or length", () => {
    // light accent is #fb5a1f
    expect(checkThemeColors(storyboard({ scenes: [chat("#FB5A1F")] }))).toEqual([]);
  });

  it("accepts colors the storyboard overrides, through accent or themeOverrides", () => {
    expect(checkThemeColors(storyboard({ accent: "#f60", scenes: [chat("#ff6600")] }))).toEqual([]);
    expect(checkThemeColors(storyboard({ themeOverrides: { colors: { surfaceAlt: "#123456" } }, scenes: [chat("#123456")] }))).toEqual([]);
  });

  it("accepts role names, and warns on CSS color syntax that cannot be a token", () => {
    const arrow = { id: "arrow", component: "Arrow", props: { from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, color: "accent" }, durationMs: 2000 };
    expect(checkThemeColors(storyboard({ scenes: [arrow] }))).toEqual([]);
    const issues = checkThemeColors(storyboard({ scenes: [chat("rgb(255, 0, 0)"), { ...arrow, props: { ...arrow.props, color: "orange" } }] }));
    expect(issues.map((i) => i.sceneId)).toEqual(["chat", "arrow"]);
  });

  it("looks inside nested components and ignores hex-like text in other fields", () => {
    const nested = {
      id: "win",
      component: "AppWindow",
      props: { title: "#bad", content: { component: "ChatWindow", props: chat("#abcdef").props } },
      durationMs: 3000,
    };
    const issues = checkThemeColors(storyboard({ scenes: [nested] }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("content.props.messages[0].avatar.color");
  });
});

describe("checkMediaFiles", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "motioncraft-media-"));
    await writeFile(join(dir, "clip.mp4"), Buffer.from([0]));
    await writeFile(join(dir, "photo.png"), Buffer.from([0]));
    await mkdir(join(dir, "folder.png"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const media = (src: unknown, component = "VideoClip") => ({ id: `s-${String(src)}`, component, props: { src }, durationMs: 2000 });

  it("passes files that exist and can be read", async () => {
    const sb = storyboard({ scenes: [media("clip.mp4"), media("photo.png", "Image")] });
    expect(await checkMediaFiles(sb, dir)).toEqual([]);
  });

  it("errors on missing files, directories and a missing src, nested ones too", async () => {
    const sb = storyboard({
      scenes: [
        media("gone.mp4"),
        media("folder.png", "Image"),
        { id: "nosrc", component: "Image", props: {}, durationMs: 2000 },
        { id: "win", component: "AppWindow", props: { content: { component: "VideoClip", props: { src: "nested.mp4" } } }, durationMs: 2000 },
      ],
    });
    const issues = await checkMediaFiles(sb, dir);
    expect(issues.map((i) => [i.check, i.severity, i.sceneId])).toEqual([
      ["media", "error", "s-gone.mp4"],
      ["media", "error", "s-folder.png"],
      ["media", "error", "nosrc"],
      ["media", "error", "win"],
    ]);
    expect(issues[0]!.message).toContain("not found");
    expect(issues[0]!.message).toContain(join(dir, "gone.mp4"));
    expect(issues[1]!.message).toContain("not a file");
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("errors on a file that cannot be read", async () => {
    const locked = join(dir, "locked.mp4");
    await writeFile(locked, Buffer.from([0]));
    await chmod(locked, 0o000);
    const issues = await checkMediaFiles(storyboard({ scenes: [media("locked.mp4")] }), dir);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("cannot be read");
  });
});

describe("checkStoryboard", () => {
  it("runs every storyboard check, errors first", async () => {
    const sb = storyboard({ scenes: [chat("#ff0000"), { id: "img", component: "Image", props: { src: "nope.png" }, durationMs: 2000 }] });
    const issues = await checkStoryboard(sb, { mediaDir: tmpdir() });
    expect(issues.map((i) => [i.severity, i.check])).toEqual([
      ["error", "media"],
      ["warn", "transition"],
      ["warn", "theme-color"],
    ]);
  });

  it("formats an issue on one line", () => {
    const issue: StoryboardIssue = { check: "transition", severity: "warn", sceneId: "a", message: "no transition" };
    expect(formatIssue(issue)).toBe('warn [transition] scene "a": no transition');
  });
});
