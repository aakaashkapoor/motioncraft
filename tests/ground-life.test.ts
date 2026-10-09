// Design v3, life #5, in the browser: the living ground draws the same pixels
// for the same frame every time and different pixels a second later, and text
// on it passes the layer-1 checks, which judge it on the ground at its most
// tinted (see `groundTint`).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, type TestContext } from "vitest";
import { checkStoryboard, formatIssue, formatProblem, runChecks, type FrameMeasurement } from "../src/checks";
import { ASPECTS, groundTint, validateStoryboard, type Aspect, type Storyboard, type StoryboardInput } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { sceneMiddleFrame } from "../src/render/frames";
import { showFrame, withRenderPage } from "../src/render/session";
import { resolveTheme } from "../src/render/themes";
import { buildTimeline } from "../src/engine/timeline";

function skipWithoutBrowser(ctx: TestContext) {
  return (error: unknown): never => {
    if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed, skipping browser render: ${error.message}`);
    throw error;
  };
}

function board(theme: string, themeOverrides?: StoryboardInput["themeOverrides"]): Storyboard {
  const result = validateStoryboard({
    title: "Ground",
    aspect: "9:16",
    fps: 30,
    theme,
    ...(themeOverrides === undefined ? {} : { themeOverrides }),
    scenes: [{ id: "hold", component: "TitleCard", props: { kicker: "Life", title: "A living ground" }, durationMs: 4000 }],
  });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

/** A screenshot of each of `frames`, in order; a frame may repeat. */
async function screenshots(storyboard: Storyboard, frames: readonly number[]): Promise<Buffer[]> {
  return withRenderPage({ storyboard, theme: resolveTheme(storyboard), durations: {} }, async (page) => {
    const shots: Buffer[] = [];
    for (const frame of frames) {
      await showFrame(page, frame);
      shots.push(await page.screenshot({ animations: "disabled", caret: "hide" }));
    }
    return shots;
  });
}

// 1.5 s and 2.5 s in: the title has landed and nothing has started to leave.
const SETTLED = 45;
const SECOND_LATER = 75;

describe("the living ground, rendered", { timeout: 120_000 }, () => {
  const cases: Array<[string, string, StoryboardInput["themeOverrides"]]> = [
    ["the mesh, opted into on light", "light", { ground: { style: "mesh" } }],
    ["the mesh, dark's default", "dark", undefined],
    ["the breathing grid", "light", { ground: { style: "grid" } }],
    ["grain over the flat ground", "light", { ground: { grain: 0.18 } }],
  ];
  it.for(cases)("%s: the same frame twice gives identical pixels; a second later they differ", async ([, theme, overrides], ctx) => {
    const [first, later, again] = await screenshots(board(theme, overrides), [SETTLED, SECOND_LATER, SETTLED]).catch(skipWithoutBrowser(ctx));
    expect(first!.equals(again!)).toBe(true);
    expect(first!.equals(later!)).toBe(false);
  });

  it("the flat ground under the same settled title does not change: the difference is the ground", async (ctx) => {
    const [first, later] = await screenshots(board("light"), [SETTLED, SECOND_LATER]).catch(skipWithoutBrowser(ctx));
    expect(first!.equals(later!)).toBe(true);
  });
});

const FIXTURES: Record<Aspect, string> = { "9:16": "ground.json", "16:9": "ground-wide.json" };

async function fixture(aspect: Aspect): Promise<Storyboard> {
  const result = validateStoryboard(JSON.parse(await readFile(join(import.meta.dirname, "fixtures", FIXTURES[aspect]), "utf8")));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  expect(result.storyboard.aspect).toBe(aspect);
  return result.storyboard;
}

describe.each(ASPECTS)("tests/fixtures/ground (%s, integration)", { timeout: 180_000 }, (aspect) => {
  it("judges text on the ground against the most tinted ground the mesh can show", async (ctx) => {
    const storyboard = await fixture(aspect);
    const theme = resolveTheme(storyboard);
    const tint = groundTint(theme, aspect);
    expect(tint).toBeDefined();
    const durations = estimateDurations(storyboard);
    const title = buildTimeline(storyboard, durations, theme).scenes[0]!;
    const measurement = await withRenderPage({ storyboard, theme, durations }, async (page) => {
      await showFrame(page, sceneMiddleFrame(title));
      return page.evaluate(() => window.motioncraft!.measureFrame());
    }).catch(skipWithoutBrowser(ctx));
    const onGround = (measurement as FrameMeasurement).texts.filter((text) => text.backgrounds[0] === tint);
    expect(onGround.map((text) => text.text)).toContain("A living ground");
  });

  it("passes every layer-1 check with no warning over the moving ground", async (ctx) => {
    const storyboard = await fixture(aspect);
    const theme = resolveTheme(storyboard);
    expect((await checkStoryboard(storyboard, { theme })).map(formatIssue)).toEqual([]);
    const result = await runChecks({ storyboard, theme, durations: estimateDurations(storyboard) }).catch(skipWithoutBrowser(ctx));
    expect(result.problems.map(formatProblem)).toEqual([]);
    expect(result.warnings.map(formatProblem)).toEqual([]);
  });
});
