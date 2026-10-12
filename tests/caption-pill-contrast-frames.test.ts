// Pill captions measured in the browser on every frame the pill fades in under
// a page's first word, and on the frame it lands on each next word. The
// layer-1 contrast check samples only a few frames per scene, which missed the
// spoken word fading through a mid tone on a half-faded pill (issue #159,
// finding 4: "renders" at frame 345 of captions-pill.json measured 2.16:1).
// Frames mid-slide are left to tests/caption-pill-contrast.test.tsx: there the
// pill's edge crosses a word, so part of it is on the pill and part is not,
// and which side the check's one sample point lands on depends on glyph widths.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, type TestContext } from "vitest";
import { checkContrast, type FrameMeasurement } from "../src/checks";
import { buildTimeline, CAPTION_LEAD_MS, captionTrack, pageIndexAt, validateStoryboard, type Storyboard } from "../src/index";
import { PILL_SLIDE, pillAt } from "../src/kit/captionPill";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { showFrame, withRenderPage } from "../src/render/session";
import { resolveTheme } from "../src/render/themes";

const FIXTURES = ["captions-pill.json", "captions-pill-wide.json"];

async function load(file: string): Promise<Storyboard> {
  const result = validateStoryboard(JSON.parse(await readFile(join(import.meta.dirname, "fixtures", file), "utf8")));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

function skipWithoutBrowser(ctx: TestContext) {
  return (error: unknown) => {
    if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed, skipping browser checks: ${error.message}`);
    throw error;
  };
}

describe("pill caption words pass the contrast check on every frame the pill moves", { timeout: 300_000 }, () => {
  it.for(FIXTURES)("%s", async (file, ctx) => {
    const storyboard = await load(file);
    const theme = resolveTheme(storyboard);
    const durations = estimateDurations(storyboard);
    const timeline = buildTimeline(storyboard, durations, theme);
    const frames = new Set<number>();
    timeline.scenes.forEach((scene, i) => {
      const endMs = ((scene.frames - 1) * 1000) / timeline.fps;
      const { words, pages } = captionTrack(theme, storyboard.aspect, storyboard.scenes[i]!.narration!, "pill", endMs);
      for (const word of words) {
        // The frames from a word's start (on the spoken clock) until the pill has arrived on it, but not mid-slide.
        const first = Math.floor(((word.startMs - CAPTION_LEAD_MS) * timeline.fps) / 1000);
        const last = Math.ceil(((word.startMs - CAPTION_LEAD_MS + PILL_SLIDE.ms) * timeline.fps) / 1000);
        for (let f = Math.max(0, first); f <= Math.min(last, scene.frames - 1); f++) {
          const spokenMs = (f * 1000) / timeline.fps + CAPTION_LEAD_MS;
          const state = pillAt(words, pages[pageIndexAt(pages, spokenMs)]!, spokenMs);
          if (state === undefined || state.from === state.word || state.move >= 1) frames.add(scene.startFrame + f);
        }
      }
    });
    expect(frames.size).toBeGreaterThan(20);
    const measured = await withRenderPage({ storyboard, theme, durations }, async (page) => {
      const out: Array<{ frame: number; measurement: FrameMeasurement }> = [];
      for (const frame of [...frames].sort((a, b) => a - b)) {
        await showFrame(page, frame);
        out.push({ frame, measurement: await page.evaluate(() => window.motioncraft!.measureFrame()) });
      }
      return out;
    }).catch(skipWithoutBrowser(ctx));
    const problems = measured.flatMap(({ frame, measurement }) =>
      checkContrast({ ...measurement, texts: measurement.texts.filter((t) => t.caption) }).map((message) => `frame ${frame}: ${message}`),
    );
    expect(problems).toEqual([]);
  });
});
