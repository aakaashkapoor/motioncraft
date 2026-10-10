// examples/showcase: the v3 introduction to motioncraft, in 9:16 and 16:9, to
// the owner's reference's bar (design v3). Scene frames with headers and
// footers, a prompt typing into its card and an arrow drawing into a window,
// step cards with the accent walking along them, list rows building one by
// one, the chat moment (a cursor click, then a lift-out carried into the next
// scene), a typing terminal, an odometer and a calm end card with the prompt
// card carried in. Every boundary has a transition, at least two shared
// elements cross one, it passes the layer-1 checks and it renders.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, type TestContext } from "vitest";
import { checkStoryboard, formatIssue, formatProblem, runChecks } from "../src/checks";
import { buildTimeline, chatWindowLayout, contentArea, validateStoryboard, type Aspect, type ChatWindowProps, type Storyboard, type StoryboardScene } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { renderStills } from "../src/render/stills";
import { resolveTheme } from "../src/render/themes";
import { sceneComponents, type ComponentUse } from "../src/storyboard/components";

const DIR = join(import.meta.dirname, "..", "examples", "showcase");
const FILES: Record<Aspect, string> = { "9:16": "storyboard.json", "16:9": "storyboard-wide.json" };
const SIZE: Record<Aspect, [number, number]> = { "9:16": [1080, 1920], "16:9": [1920, 1080] };

async function load(aspect: Aspect): Promise<Storyboard> {
  const result = validateStoryboard(JSON.parse(await readFile(join(DIR, FILES[aspect]), "utf8")));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

/** Every `shareId` anywhere in a scene's props. */
function shareIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(shareIds);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, v]) => (key === "shareId" && typeof v === "string" ? [v] : shareIds(v)));
}

const uses = (sb: Storyboard, component: string): ComponentUse[] => sb.scenes.flatMap(sceneComponents).filter((use) => use.component === component);
const sceneOf = (sb: Storyboard, component: string): StoryboardScene => sb.scenes.find((scene) => sceneComponents(scene).some((use) => use.component === component))!;

function pngSize(png: Buffer): [number, number] {
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

function skipWithoutBrowser(ctx: TestContext): (error: unknown) => never {
  return (error) => {
    if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
    throw error;
  };
}

let outDir = "";
beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), "motioncraft-showcase-"));
});
afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe.each(["9:16", "16:9"] as const)("examples/showcase (%s)", (aspect) => {
  it("is a light-theme storyboard of 35-45 s in its aspect", async () => {
    const sb = await load(aspect);
    expect(sb.aspect).toBe(aspect);
    expect(sb.theme).toBe("light");
    const tl = buildTimeline(sb, estimateDurations(sb), resolveTheme(sb));
    const seconds = tl.totalFrames / sb.fps;
    expect(seconds).toBeGreaterThanOrEqual(35);
    expect(seconds).toBeLessThanOrEqual(45);
  });

  it("frames its content scenes with SceneFrame headers, footers on several", async () => {
    const frames = uses(await load(aspect), "SceneFrame");
    expect(frames.length).toBeGreaterThanOrEqual(5);
    expect(frames.filter((use) => typeof use.props.footer === "string").length).toBeGreaterThanOrEqual(3);
  });

  it("builds the reference's moments: a typed prompt, an arrow into a window, step cards and list rows with a moving highlight, a terminal and an odometer", async () => {
    const sb = await load(aspect);
    expect(uses(sb, "PromptCard").some((use) => use.props.typed !== false)).toBe(true);
    const handoff = uses(sb, "Handoff")[0]!;
    expect((handoff.props.from as ComponentUse).component).toBe("PromptCard");
    expect((handoff.props.to as ComponentUse).component).toMatch(/Window$/);
    const walks = (use: ComponentUse) => typeof use.props.highlight === "object" && use.props.highlight !== null;
    const steps = uses(sb, "CardRow");
    expect(steps.some((use) => walks(use) && (use.props.cards as { step?: number }[]).every((card) => typeof card.step === "number"))).toBe(true);
    expect(uses(sb, "FeatureList").some(walks)).toBe(true);
    expect(uses(sb, "TerminalWindow")[0]!.props.lines).toContainEqual(expect.objectContaining({ prompt: true }));
    expect(uses(sb, "BigNumber")).toHaveLength(1);
  });

  it("plays the chat moment: a cursor clicks an action and the message lifts out, carried into the next scene", async () => {
    const sb = await load(aspect);
    const chat = sceneOf(sb, "ChatWindow");
    const props = chat.props as unknown as ChatWindowProps;
    expect(props.cursor).toBeDefined();
    const lifted = props.messages.find((m) => m.lift !== undefined)!;
    expect(lifted.actions?.some((a) => a.id === props.cursor!.target)).toBe(true);
    const next = sb.scenes[sb.scenes.indexOf(chat) + 1]!;
    expect(shareIds(next.props)).toContain(lifted.shareId);
  });

  it("composes the chat as the reference does: a big window with the card beside it (16:9), or the card clear of the composer (9:16)", async () => {
    const sb = await load(aspect);
    const props = sceneOf(sb, "ChatWindow").props as unknown as ChatWindowProps;
    const layout = chatWindowLayout(resolveTheme(sb), aspect, props);
    const lift = layout.lifts.find((l) => l !== undefined)!;
    const card = { x: lift.to.x, y: lift.to.bottom - lift.height * lift.scale, width: lift.width * lift.scale };
    const w = layout.window;
    if (aspect === "16:9") {
      expect(w.width).toBeGreaterThanOrEqual(1040);
      expect(card.x).toBeGreaterThanOrEqual(w.x + w.width);
      const area = contentArea(resolveTheme(sb), aspect);
      // The pair fills the width: no half-empty frame.
      expect(card.x + card.width).toBeGreaterThan(area.x + area.width - 64);
    } else {
      expect(card.y).toBeGreaterThanOrEqual(w.y + w.height - layout.windowCollapse);
    }
  });

  it("ends calmly on the end card, the prompt card carried in again", async () => {
    const sb = await load(aspect);
    const end = sb.scenes.at(-1)!;
    expect(end.component).toBe("EndCard");
    expect((end.props.card as ComponentUse).component).toBe("PromptCard");
    expect((end.props.card as ComponentUse).props.text).toBe(uses(sb, "PromptCard")[0]!.props.text);
  });

  it("never scales a window's text down: no window draws a nested component in its content slot", async () => {
    const sb = await load(aspect);
    for (const name of ["AppWindow", "BrowserWindow"]) for (const use of uses(sb, name)) expect(use.props.content, name).toBeUndefined();
  });

  it("chooses a transition for every boundary and shares at least two elements across them, one of them the chat's", async () => {
    const { scenes } = await load(aspect);
    const shared = new Set<string>();
    scenes.slice(0, -1).forEach((scene, i) => {
      expect(scene.transition, scene.id).toBeDefined();
      expect(scene.transition!.type, scene.id).not.toBe("cut");
      const next = new Set(shareIds(scenes[i + 1]!.props));
      for (const id of new Set(shareIds(scene.props))) if (next.has(id)) shared.add(id);
    });
    expect(shared.size).toBeGreaterThanOrEqual(2);
    const chat = scenes.find((s) => s.component === "ChatWindow")!;
    expect([...shared].some((id) => shareIds(chat.props).includes(id))).toBe(true);
  });

  it("passes the storyboard checks with no warnings", async () => {
    const sb = await load(aspect);
    const issues = await checkStoryboard(sb, { theme: resolveTheme(sb), mediaDir: DIR });
    expect(issues.map(formatIssue)).toEqual([]);
  });

  it("passes the layer-1 frame checks, centering and type scale included, with no warnings", { timeout: 240_000 }, async (ctx) => {
    const sb = await load(aspect);
    const result = await runChecks({ storyboard: sb, theme: resolveTheme(sb), durations: estimateDurations(sb), mediaDir: DIR }).catch(skipWithoutBrowser(ctx));
    expect(result.problems.map(formatProblem)).toEqual([]);
    expect(result.warnings.map(formatProblem)).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it("renders frames at full size, including the two shared-element morphs", { timeout: 180_000 }, async (ctx) => {
    const sb = await load(aspect);
    const theme = resolveTheme(sb);
    const durations = estimateDurations(sb);
    const tl = buildTimeline(sb, durations, theme);
    const mid = (i: number) => tl.transitions[i]!.startFrame + Math.floor(tl.transitions[i]!.frames / 2);
    const chat = sb.scenes.findIndex((s) => s.component === "ChatWindow");
    const frames = [0, mid(0), mid(chat), tl.totalFrames - 1];
    const paths = await renderStills({ storyboard: sb, theme, durations, mediaDir: DIR, frames, outDir: join(outDir, aspect.replace(":", "x")) }).catch(
      skipWithoutBrowser(ctx),
    );
    expect(paths).toHaveLength(frames.length);
    for (const path of paths) expect(pngSize(await readFile(path))).toEqual(SIZE[aspect]);
  });
});
