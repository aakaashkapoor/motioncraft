// Design v3 acceptance, measured in the browser: in 9:16, TitleCard, Card,
// CardRow, BigNumber, every window and the caption are centered on x = 540
// (+-2 px), in both safe profiles, and the layer-1 centering check stays quiet.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, type TestContext } from "vitest";
import { checkCentering, formatProblem, runChecks, type FrameMeasurement, type MeasuredBlock } from "../src/checks";
import { union } from "../src/checks/geometry";
import { buildTimeline, SAFE_PROFILES, validateStoryboard, type SafeProfile, type Storyboard } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { sceneMiddleFrame } from "../src/render/frames";
import { showFrame, withRenderPage } from "../src/render/session";
import { resolveTheme } from "../src/render/themes";

const TOLERANCE = 2;

async function fixture(safe: SafeProfile): Promise<Storyboard> {
  const json = JSON.parse(await readFile(join(import.meta.dirname, "fixtures", "centering.json"), "utf8"));
  const result = validateStoryboard({ ...json, safe });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

const centerX = (blocks: readonly MeasuredBlock[]) => {
  const box = union(blocks.map((b) => b.rect))!;
  return box.x + box.width / 2;
};

function skipWithoutBrowser(ctx: TestContext) {
  return (error: unknown) => {
    if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed, skipping browser checks: ${error.message}`);
    throw error;
  };
}

describe.each(SAFE_PROFILES)("9:16 %s, measured in the browser", { timeout: 120_000 }, (safe) => {
  it("every scene's main block and its caption are centered on x = 540 (+-2 px)", async (ctx) => {
    const storyboard = await fixture(safe);
    const theme = resolveTheme(storyboard);
    const durations = estimateDurations(storyboard);
    const timeline = buildTimeline(storyboard, durations, theme);
    const measured = await withRenderPage({ storyboard, theme, durations }, async (page) => {
      const out: Array<{ id: string; measurement: FrameMeasurement }> = [];
      for (const scene of timeline.scenes) {
        // Late in the scene: everything has landed and nothing has started to leave.
        await showFrame(page, Math.round(sceneMiddleFrame(scene) + scene.frames * 0.3));
        out.push({ id: scene.id, measurement: await page.evaluate(() => window.motioncraft!.measureFrame()) });
      }
      return out;
    }).catch(skipWithoutBrowser(ctx));

    for (const { id, measurement } of measured) {
      const visible = measurement.blocks.filter((b) => b.opacity > 0.5);
      const main = visible.filter((b) => !b.caption);
      const caption = visible.filter((b) => b.caption);
      expect(main.length, `${id}: blocks`).toBeGreaterThan(0);
      expect(caption.length, `${id}: caption`).toBe(1);
      expect(Math.abs(centerX(main) - 540), `${id}: main block (${main.map((b) => b.label).join(", ")})`).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(centerX(caption) - 540), `${id}: caption`).toBeLessThanOrEqual(TOLERANCE);
      expect(checkCentering(measurement, "9:16")).toEqual([]);
    }
  });

  it("passes the layer-1 checks with no warnings", async (ctx) => {
    const storyboard = await fixture(safe);
    const result = await runChecks({ storyboard, theme: resolveTheme(storyboard), durations: estimateDurations(storyboard) }).catch(skipWithoutBrowser(ctx));
    expect(result.problems.map(formatProblem)).toEqual([]);
    expect(result.warnings.map(formatProblem)).toEqual([]);
  });
});
