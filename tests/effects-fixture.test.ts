// tests/fixtures/effects: a ring on a StepList's second step at a word, a
// BigNumber pulse and a Card shake in `negative`. In the browser: the ring is
// absent before its word and encloses the step's row after it, the shaken
// card is back at rest once the shake ends, and every layer-1 check passes.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkStoryboard, formatProblem, runChecks } from "../src/checks";
import { ASPECTS, buildTimeline, resolveCue, sceneWords, validateStoryboard, type Aspect, type Storyboard } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { showFrame, withRenderPage } from "../src/render/session";
import { resolveTheme } from "../src/render/themes";

const FIXTURES: Record<Aspect, string> = { "9:16": "effects.json", "16:9": "effects-wide.json", "4:5": "effects-45.json" };

async function load(aspect: Aspect): Promise<Storyboard> {
  const result = validateStoryboard(JSON.parse(await readFile(join(import.meta.dirname, "fixtures", FIXTURES[aspect]), "utf8")));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

function rectOf(selector: string) {
  const el = document.querySelector(selector);
  if (el === null) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** The computed `translate` of the first element matching `selector`. */
function translateOf(selector: string): string | null {
  const el = document.querySelector(selector);
  return el === null ? null : getComputedStyle(el).translate;
}

/** The frame (in the whole film) `ms` after the cue of effect `effectIndex` in scene `sceneIndex`. */
function cueFrame(sb: Storyboard, sceneIndex: number, effectIndex: number, ms: number) {
  const theme = resolveTheme(sb);
  const timeline = buildTimeline(sb, estimateDurations(sb), theme);
  const scene = timeline.scenes[sceneIndex]!;
  const words = sceneWords(theme, sb.scenes[sceneIndex]!.narration!, ((scene.frames - 1) * 1000) / timeline.fps);
  const cue = resolveCue(sb.scenes[sceneIndex]!.effects![effectIndex]!.at, words);
  return scene.startFrame + Math.round(((cue + ms) * timeline.fps) / 1000);
}

describe("tests/fixtures/effects", () => {
  for (const aspect of ASPECTS) {
    it(`${aspect}: is valid: a ring on step 2 at a word, a BigNumber pulse, a Card shake in negative`, async () => {
      const sb = await load(aspect);
      expect(sb.aspect).toBe(aspect);
      expect(sb.scenes.map((scene) => [scene.component, scene.effects?.[0]?.kind])).toEqual([
        ["StepList", "ring"],
        ["BigNumber", "pulse"],
        ["Card", "shake"],
      ]);
      expect(sb.scenes[0]!.effects![0]!.at).toEqual({ word: "split" });
      expect(sb.scenes[2]!.effects![0]!.color).toBe("negative");
      const issues = await checkStoryboard(sb, { theme: resolveTheme(sb) });
      expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it(`${aspect}: the ring draws on at its word around the step's row, and the shake ends at rest`, { timeout: 120_000 }, async (ctx) => {
      const sb = await load(aspect);
      const theme = resolveTheme(sb);
      const durations = estimateDurations(sb);
      try {
        await withRenderPage({ storyboard: sb, theme, durations }, async (page) => {
          await showFrame(page, cueFrame(sb, 0, 0, -100), 20_000);
          expect(await page.evaluate(rectOf, '[data-effect="ring"]')).toBeNull();
          await showFrame(page, cueFrame(sb, 0, 0, 600), 20_000);
          const ring = await page.evaluate(rectOf, '[data-effect="ring"]');
          const row = await page.evaluate(rectOf, '[data-camera] [data-share-id="split"]');
          expect(ring && row).toBeTruthy();
          expect(ring!.x).toBeLessThan(row!.x);
          expect(ring!.y).toBeLessThan(row!.y);
          expect(ring!.x + ring!.width).toBeGreaterThan(row!.x + row!.width);
          expect(ring!.y + ring!.height).toBeGreaterThan(row!.y + row!.height);

          await showFrame(page, cueFrame(sb, 2, 0, 90), 20_000);
          expect(await page.evaluate(translateOf, '[data-camera] [data-share-id="owed"]')).toMatch(/px/);
          await showFrame(page, cueFrame(sb, 2, 0, 500), 20_000);
          expect(await page.evaluate(translateOf, '[data-camera] [data-share-id="owed"]')).toBe("none");
        });
      } catch (error) {
        if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
        throw error;
      }
    });

    it(`${aspect}: passes every layer-1 check`, { timeout: 180_000 }, async (ctx) => {
      const sb = await load(aspect);
      const theme = resolveTheme(sb);
      const checked = await runChecks({ storyboard: sb, theme, durations: estimateDurations(sb) }).catch((error: unknown) => {
        if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
        throw error;
      });
      expect(checked.problems.map(formatProblem)).toEqual([]);
    });
  }
});
