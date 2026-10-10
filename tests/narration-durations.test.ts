import { describe, expect, it } from "vitest";
import { buildTimeline } from "../src/engine/timeline";
import { validateStoryboard, type Storyboard } from "../src/index";
import { NARRATION_TAIL_MS, estimateDurations, narrationDurations, narrationTailMs, sceneDurations } from "../src/render/durations";
import { prepareMedia } from "../src/render/media";
import { resolveTheme } from "../src/render/themes";

function board(fps: number, scenes: Record<string, unknown>[]): Storyboard {
  const result = validateStoryboard({ title: "T", aspect: "9:16", fps, scenes });
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.storyboard;
}

const cut = { type: "cut" };
const scene = (id: string, extra: Record<string, unknown> = {}) => ({ id, component: "Title", props: {}, transition: cut, ...extra });

describe("narrationTailMs", () => {
  const sb = board(30, [
    scene("a", { narration: "One.", transition: { type: "slide", durationMs: 900 } }),
    scene("b", { narration: "Two.", transition: { type: "slide", durationMs: 100 } }),
    scene("c", { narration: "Three.", transition: cut }),
    scene("d", { narration: "Four." }),
  ]);
  const theme = resolveTheme(sb);

  it("is the transition plus 250 ms when that is longer than 500 ms", () => {
    expect(narrationTailMs(sb, 0, theme)).toBe(1150);
  });

  it("is 500 ms for a short transition, a cut, and the last scene", () => {
    expect(narrationTailMs(sb, 1, theme)).toBe(NARRATION_TAIL_MS);
    expect(narrationTailMs(sb, 2, theme)).toBe(NARRATION_TAIL_MS);
    expect(narrationTailMs(sb, 3, theme)).toBe(NARRATION_TAIL_MS);
  });

  it("follows the theme default transition when a scene sets none", () => {
    const plain = board(30, [
      { id: "a", component: "Title", props: {}, narration: "One." },
      { id: "b", component: "Title", props: {}, narration: "Two." },
    ]);
    const t = resolveTheme(plain);
    const expected = t.motion.transition === "cut" ? NARRATION_TAIL_MS : Math.max(NARRATION_TAIL_MS, t.motion.transitionMs + 250);
    expect(narrationTailMs(plain, 0, t)).toBe(expected);
  });
});

describe("narrationDurations", () => {
  const storyboard = board(30, [
    scene("a", { narration: "Hello there." }),
    scene("b", { narration: "Explicit.", durationMs: 9000 }),
    scene("c", { narration: "No audio yet." }),
    scene("d", { durationMs: 1000 }),
  ]);
  const theme = resolveTheme(storyboard);
  const audio = { a: { audioMs: 2000 }, b: { audioMs: 2000 } };

  it("is the scene lead plus the audio plus the tail", () => {
    // 25 fps is 40 ms a frame; pick the audio so the sum lands exactly on a frame.
    const audioMs = 2000 + ((40 - ((theme.motion.leadMs + 2500) % 40)) % 40);
    const sb = board(25, [scene("a", { narration: "Hi." }), scene("b", { durationMs: 1000 })]);
    expect(narrationDurations(sb, { a: { audioMs } }, theme).a).toBe(theme.motion.leadMs + audioMs + 500);
  });

  it("rounds up to a whole frame, exactly", () => {
    const sb = board(30, [scene("a", { narration: "Hi." })]);
    const lead150 = { ...theme, motion: { ...theme.motion, leadMs: 150 } };
    // 150 + 2001 + 500 = 2651 ms -> 79.53 frames -> 80 frames
    expect(narrationDurations(sb, { a: { audioMs: 2001 } }, lead150).a).toBe((80 * 1000) / 30);
  });

  it("includes a long outgoing transition in the tail", () => {
    const sb = board(30, [
      scene("a", { narration: "Hi.", transition: { type: "slide", durationMs: 900 } }),
      scene("b", { narration: "Yo." }),
    ]);
    const ms = narrationDurations(sb, { a: { audioMs: 2000 } }, theme).a!;
    expect(ms).toBeGreaterThanOrEqual(theme.motion.leadMs + 2000 + 1150);
    expect(ms).toBeLessThan(theme.motion.leadMs + 2000 + 1150 + 1000 / 30);
  });

  it("leaves scenes with an explicit durationMs, no audio, or no narration out", () => {
    expect(Object.keys(narrationDurations(storyboard, audio, theme))).toEqual(["a"]);
  });

  it("sceneDurations keeps the estimate for narrated scenes without audio", () => {
    const durations = sceneDurations(storyboard, audio, theme);
    expect(durations.a).toBe(narrationDurations(storyboard, audio, theme).a);
    expect(durations.c).toBe(estimateDurations(storyboard).c);
    expect(Object.keys(durations).sort()).toEqual(["a", "c"]);
  });

  it("an explicit durationMs wins in the built timeline", () => {
    const timeline = buildTimeline(storyboard, sceneDurations(storyboard, audio, theme), theme);
    expect(timeline.scenes.find((s) => s.id === "b")!.frames).toBe(270); // 9000 ms at 30 fps
    expect(timeline.scenes.find((s) => s.id === "a")!.frames).toBe(Math.round((narrationDurations(storyboard, audio, theme).a! * 30) / 1000));
  });

  it("the next voice starts at least 250 ms after this one ends, whatever the transition", () => {
    for (const durationMs of [100, 600, 1200]) {
      const sb = board(30, [
        scene("a", { narration: "One.", transition: { type: "slide", durationMs } }),
        scene("b", { narration: "Two." }),
      ]);
      const clips = { a: { audioMs: 3000 }, b: { audioMs: 1000 } };
      const timeline = buildTimeline(sb, sceneDurations(sb, clips, theme), theme);
      const frameMs = (n: number) => (n * 1000) / 30;
      const aEnd = frameMs(timeline.scenes[0]!.startFrame) + theme.motion.leadMs + 3000;
      const bVoice = frameMs(timeline.scenes[1]!.startFrame) + theme.motion.leadMs;
      // Within a frame of rounding.
      expect(bVoice - aEnd).toBeGreaterThanOrEqual(250 - 1000 / 30);
    }
  });
});

describe("prepareMedia and narration", () => {
  it("hands the page only the words of each scene", async () => {
    const sb = board(30, [scene("a", { narration: "Hi." })]);
    const words = [{ text: "Hi.", startMs: 0, endMs: 400 }];
    const full = { a: { sceneId: "a", wavPath: "C:\secret\a.wav", audioMs: 400, words } };
    const { input } = await prepareMedia({ storyboard: sb, theme: resolveTheme(sb), durations: {}, narration: full });
    expect(input.narration).toEqual({ a: { words } });
    expect(JSON.stringify(input)).not.toContain("secret");
  });
});
