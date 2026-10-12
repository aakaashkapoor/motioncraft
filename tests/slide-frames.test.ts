// Slides land on each scene's settled hold: after everything has entered and
// before the components' exits and any outgoing transition begin. Issue #159,
// finding 1: the last scene's slide used to be its final frame, after the
// exits, so it came out as empty ground.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, type TestContext } from "vitest";
import { VISIBLE_OPACITY } from "../src/checks/types";
import { buildTimeline, soloFrames, validateStoryboard, type Storyboard, type StoryboardInput } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { slideFrames } from "../src/render/frames";
import { showFrame, withRenderPage } from "../src/render/session";
import { slideInput } from "../src/render/stills";
import { resolveTheme } from "../src/render/themes";

function storyboard(input: Partial<StoryboardInput>): Storyboard {
  const result = validateStoryboard({ title: "Test", aspect: "9:16", scenes: [], ...input });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

describe("slideFrames with the theme", () => {
  const sb = storyboard({
    scenes: [
      { id: "a", component: "TitleCard", props: { title: "A" }, durationMs: 3000, transition: { type: "fade", durationMs: 600 } },
      { id: "b", component: "TitleCard", props: { title: "B" }, durationMs: 3000, transition: { type: "cut" } },
      { id: "c", component: "TitleCard", props: { title: "C" }, durationMs: 3000 },
    ],
  });
  const theme = resolveTheme(sb);
  const timeline = buildTimeline(sb, {}, theme);
  const ms = (frames: number) => (frames * 1000) / timeline.fps;

  it("lands every slide after the entrances and before the exit and the transition out", () => {
    const slides = slideFrames(timeline, undefined, theme);
    expect(slides.map((s) => s.sceneId)).toEqual(["a", "b", "c"]);
    timeline.scenes.forEach((scene, index) => {
      const { frame } = slides[index]!;
      const local = frame - scene.startFrame;
      const lastLocal = scene.frames - 1;
      // Entrances (cascades included) have landed.
      expect(ms(local), `${scene.id}: after the entrances`).toBeGreaterThanOrEqual(theme.motion.cascadeMs);
      // The exit has not begun: at least the longest exit is still left on the scene clock.
      expect(ms(lastLocal - local), `${scene.id}: before the exit`).toBeGreaterThanOrEqual(theme.motion.exit.maxMs);
      // On screen alone: past the incoming transition, before the outgoing one.
      const solo = soloFrames(timeline, index);
      expect(frame, `${scene.id}: after the transition in`).toBeGreaterThanOrEqual(solo.first);
      expect(frame, `${scene.id}: before the transition out`).toBeLessThanOrEqual(solo.last);
      // The last such frame: one later and the exit would have begun (or the transition out).
      expect(frame + 1 > solo.last || ms(lastLocal - local - 1) < theme.motion.exit.maxMs, `${scene.id}: the last held frame`).toBe(true);
    });
  });

  it("never picks a frame outside the scene's solo frames, even in a very short scene", () => {
    const short = storyboard({
      scenes: [
        { id: "a", component: "TitleCard", props: { title: "A" }, durationMs: 300, transition: { type: "cut" } },
        { id: "b", component: "TitleCard", props: { title: "B" }, durationMs: 300 },
      ],
    });
    const t = buildTimeline(short, {}, theme);
    slideFrames(t, undefined, theme).forEach((slide, index) => {
      const solo = soloFrames(t, index);
      expect(slide.frame).toBeGreaterThanOrEqual(solo.first);
      expect(slide.frame).toBeLessThanOrEqual(solo.last);
    });
  });

  it("lands a scene too short for a hold just after its entrances, not mid-entrance", () => {
    // 1400 ms: the exit would begin before the cascade (1200 ms) has landed, so there is no hold.
    const short = storyboard({
      scenes: [
        { id: "a", component: "TitleCard", props: { title: "A" }, durationMs: 1400, transition: { type: "cut" } },
        { id: "b", component: "TitleCard", props: { title: "B" }, durationMs: 1400 },
      ],
    });
    const t = buildTimeline(short, {}, theme);
    const sms = (frames: number) => (frames * 1000) / t.fps;
    slideFrames(t, undefined, theme).forEach((slide, index) => {
      const scene = t.scenes[index]!;
      const solo = soloFrames(t, index);
      const local = slide.frame - scene.startFrame;
      expect(sms(scene.frames - 1) - theme.motion.exit.maxMs, `${scene.id}: no hold`).toBeLessThan(theme.motion.cascadeMs);
      // The first frame the entrances have landed on.
      expect(sms(local), `${scene.id}: after the entrances`).toBeGreaterThanOrEqual(theme.motion.cascadeMs);
      expect(sms(local - 1), `${scene.id}: the first such frame`).toBeLessThan(theme.motion.cascadeMs);
      expect(slide.frame).toBeGreaterThanOrEqual(solo.first);
      expect(slide.frame).toBeLessThanOrEqual(solo.last);
    });
  });

  it("lands a scene shorter than its entrances on its last solo frame, the closest to them landing", () => {
    const short = storyboard({
      scenes: [
        { id: "a", component: "TitleCard", props: { title: "A" }, durationMs: 800, transition: { type: "cut" } },
        { id: "b", component: "TitleCard", props: { title: "B" }, durationMs: 800 },
      ],
    });
    const t = buildTimeline(short, {}, theme);
    slideFrames(t, undefined, theme).forEach((slide, index) => expect(slide.frame).toBe(soloFrames(t, index).last));
  });
});

function skipWithoutBrowser(ctx: TestContext) {
  return (error: unknown) => {
    if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed, skipping browser checks: ${error.message}`);
    throw error;
  };
}

describe("slides, rendered in the browser", { timeout: 120_000 }, () => {
  it("draws every scene's content on its slide, the last scene's too", async (ctx) => {
    const json = JSON.parse(await readFile(join(import.meta.dirname, "fixtures", "brand-font.json"), "utf8"));
    const sb = storyboard(json);
    const theme = resolveTheme(sb);
    const durations = estimateDurations(sb);
    const input = { storyboard: sb, theme, durations, mediaDir: join(import.meta.dirname, "fixtures") };
    const slides = slideFrames(buildTimeline(sb, durations, theme), undefined, theme);
    expect(slides.length).toBe(3);

    const visible = await withRenderPage(slideInput(input), async (page) => {
      const out: Array<{ id: string; texts: string[] }> = [];
      for (const slide of slides) {
        await showFrame(page, slide.frame);
        const measurement = await page.evaluate(() => window.motioncraft!.measureFrame());
        const texts = measurement.texts.filter((t) => !t.caption && t.opacity >= VISIBLE_OPACITY && t.text.trim() !== "").map((t) => t.text);
        out.push({ id: slide.sceneId, texts });
      }
      return out;
    }).catch(skipWithoutBrowser(ctx));

    for (const { id, texts } of visible) expect(texts.length, `${id}: visible text`).toBeGreaterThan(0);
  });
});
