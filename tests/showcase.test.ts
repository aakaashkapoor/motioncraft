// examples/showcase: the v2 introduction to motioncraft, in 9:16 and 16:9. It
// must use the v2 kit end to end, choose every transition, carry shared
// elements across at least two boundaries, pass the layer-1 checks and render.

import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, type TestContext } from "vitest";
import { checkStoryboard, formatIssue, formatProblem, runChecks } from "../src/checks";
import { buildTimeline, validateStoryboard, type Aspect, type Storyboard, type StoryboardScene } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { renderStills } from "../src/render/stills";
import { resolveTheme } from "../src/render/themes";
import { sceneComponents } from "../src/storyboard/components";

const DIR = join(import.meta.dirname, "..", "examples", "showcase");
const FILES: Record<Aspect, string> = { "9:16": "storyboard.json", "16:9": "storyboard-wide.json" };
const SIZE: Record<Aspect, [number, number]> = { "9:16": [1080, 1920], "16:9": [1920, 1080] };

const REQUIRED = ["Section", "ChatWindow", "CardRow", "Card", "Arrow", "Handoff", "TerminalWindow", "FeatureList", "BigNumber", "VideoClip", "AppWindow"];

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

/** Kit components a scene draws, including the arrow a Handoff draws. */
function components(scene: StoryboardScene): string[] {
  const names = sceneComponents(scene).map((use) => use.component);
  return names.includes("Handoff") ? [...names, "Arrow"] : names;
}

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
  it("is a light-theme storyboard of about 30 s in its aspect", async () => {
    const sb = await load(aspect);
    expect(sb.aspect).toBe(aspect);
    expect(sb.theme).toBe("light");
    const tl = buildTimeline(sb, estimateDurations(sb), resolveTheme(sb));
    const seconds = tl.totalFrames / sb.fps;
    expect(seconds).toBeGreaterThan(25);
    expect(seconds).toBeLessThan(40);
  });

  it("uses the v2 kit: sections, chat, cards, an arrow into a window, terminal, features, a number and a clip", async () => {
    const used = new Set((await load(aspect)).scenes.flatMap(components));
    for (const name of REQUIRED) expect(used, name).toContain(name);
    const highlighted = (await load(aspect)).scenes.flatMap(sceneComponents).filter((use) => use.component === "CardRow" && typeof use.props.highlight === "number");
    expect(highlighted.length).toBeGreaterThan(0);
  });

  it("chooses a transition for every boundary and shares elements across at least two, one of them the chat", async () => {
    const { scenes } = await load(aspect);
    const shared: string[] = [];
    scenes.slice(0, -1).forEach((scene, i) => {
      expect(scene.transition, scene.id).toBeDefined();
      const next = new Set(shareIds(scenes[i + 1]!.props));
      const both = [...new Set(shareIds(scene.props))].filter((id) => next.has(id));
      if (both.length > 0) {
        expect(scene.transition!.type, `${scene.id} shares ${both.join(", ")}`).not.toBe("cut");
        shared.push(...both);
      }
    });
    expect(shared.length).toBeGreaterThanOrEqual(2);
    const chatScene = scenes.find((s) => s.component === "ChatWindow" && shareIds(s.props).length > 0);
    expect(chatScene).toBeDefined();
    expect(shared).toContain(shareIds(chatScene!.props)[0]);
  });

  it("passes the storyboard checks with no warnings, and its sample clip is under 1 MB", async () => {
    const sb = await load(aspect);
    const issues = await checkStoryboard(sb, { theme: resolveTheme(sb), mediaDir: DIR });
    expect(issues.map(formatIssue)).toEqual([]);
    const clips = sb.scenes.flatMap(sceneComponents).filter((use) => use.component === "VideoClip");
    for (const clip of clips) expect((await stat(join(DIR, String(clip.props.src)))).size).toBeLessThan(1024 * 1024);
  });

  it("passes the layer-1 frame checks", { timeout: 180_000 }, async (ctx) => {
    const sb = await load(aspect);
    const result = await runChecks({ storyboard: sb, theme: resolveTheme(sb), durations: estimateDurations(sb), mediaDir: DIR }).catch(skipWithoutBrowser(ctx));
    expect(result.problems.map(formatProblem)).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it("renders a few frames, including mid-morph and the clip, at full size", { timeout: 120_000 }, async (ctx) => {
    const sb = await load(aspect);
    const theme = resolveTheme(sb);
    const durations = estimateDurations(sb);
    const tl = buildTimeline(sb, durations, theme);
    const mid = (i: number) => tl.transitions[i]!.startFrame + Math.floor(tl.transitions[i]!.frames / 2);
    const demo = tl.scenes.find((s) => s.id === "demo")!;
    const frames = [0, mid(1), mid(3), demo.startFrame + Math.floor(demo.frames / 2), tl.totalFrames - 1];
    const paths = await renderStills({ storyboard: sb, theme, durations, mediaDir: DIR, frames, outDir: join(outDir, aspect.replace(":", "x")) }).catch(
      skipWithoutBrowser(ctx),
    );
    expect(paths).toHaveLength(frames.length);
    for (const path of paths) expect(pngSize(await readFile(path))).toEqual(SIZE[aspect]);
  });
});
