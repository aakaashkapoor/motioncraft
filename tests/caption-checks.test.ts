// Word-highlight captions, measured in the browser: both styles in both
// aspects pass every layer-1 check. The punch style's white letters sit on
// their own dark outline (`paint-order: stroke`), so their contrast is judged
// against the outline, not the ground behind it. A page entering rises from
// below its place; even then its text stays in the safe area.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, type TestContext } from "vitest";
import { checkOverflow, checkSafeArea, formatProblem, runChecks, type FrameMeasurement } from "../src/checks";
import { buildTimeline, captionTrack, frameSize, validateStoryboard, type SafeProfile, type Storyboard } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { showFrame, withRenderPage } from "../src/render/session";
import { resolveTheme } from "../src/render/themes";

const FIXTURES = ["captions.json", "captions-wide.json", "captions-punch.json", "captions-punch-wide.json"];

async function load(file: string, safe?: SafeProfile): Promise<Storyboard> {
  const json = JSON.parse(await readFile(join(import.meta.dirname, "fixtures", file), "utf8"));
  const result = validateStoryboard(safe === undefined ? json : { ...json, safe });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

function skipWithoutBrowser(ctx: TestContext) {
  return (error: unknown) => {
    if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed, skipping browser checks: ${error.message}`);
    throw error;
  };
}

describe("caption fixtures pass the layer-1 checks", { timeout: 120_000 }, () => {
  it.for(FIXTURES)("%s", async (file, ctx) => {
    const storyboard = await load(file);
    const theme = resolveTheme(storyboard);
    const checked = await runChecks({ storyboard, theme, durations: estimateDurations(storyboard) }).catch(skipWithoutBrowser(ctx));
    expect(checked.problems.map(formatProblem)).toEqual([]);
    expect(checked.warnings.filter((w) => w.check === "type-scale").map(formatProblem)).toEqual([]);
    expect(checked.passed).toBe(true);
  });
});

const ENTERING = FIXTURES.flatMap((file) => (file.includes("wide") ? [[file, "shorts"] as const] : [[file, "shorts"] as const, [file, "crosspost"] as const]));

describe("caption pages stay in the safe area while they enter", { timeout: 120_000 }, () => {
  it.for(ENTERING)("%s (%s)", async ([file, safe], ctx) => {
    const storyboard = await load(file, safe);
    const theme = resolveTheme(storyboard);
    const durations = estimateDurations(storyboard);
    const timeline = buildTimeline(storyboard, durations, theme);
    const style = storyboard.captionStyle === "punch" ? "punch" : "standard";
    // The first frame of every page: the page is still low and small.
    const frames = timeline.scenes.flatMap((scene, i) => {
      const endMs = ((scene.frames - 1) * 1000) / timeline.fps;
      const { pages } = captionTrack(theme, storyboard.aspect, storyboard.scenes[i]!.narration!, style, endMs);
      return pages.slice(1).map((page) => scene.startFrame + Math.ceil((page.startMs * timeline.fps) / 1000));
    });
    expect(frames.length).toBeGreaterThan(3);
    const measured = await withRenderPage({ storyboard, theme, durations }, async (page) => {
      const out: Array<{ frame: number; measurement: FrameMeasurement }> = [];
      for (const frame of frames) {
        await showFrame(page, frame);
        out.push({ frame, measurement: await page.evaluate(() => window.motioncraft!.measureFrame()) });
      }
      return out;
    }).catch(skipWithoutBrowser(ctx));
    for (const { frame, measurement } of measured) {
      const captions = { ...measurement, texts: measurement.texts.filter((t) => t.caption) };
      expect(captions.texts.length, `frame ${frame}`).toBeGreaterThan(0);
      expect([...checkSafeArea(captions, storyboard.aspect, safe), ...checkOverflow(captions, frameSize(storyboard.aspect))], `frame ${frame}`).toEqual([]);
    }
  });
});
