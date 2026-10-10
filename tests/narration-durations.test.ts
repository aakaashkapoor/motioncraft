import { describe, expect, it } from "vitest";
import { validateStoryboard, type Storyboard } from "../src/index";
import { estimateDurations, narrationDurations, sceneDurations } from "../src/render/durations";
import { resolveTheme } from "../src/render/themes";

function board(fps: number | undefined, scenes: Record<string, unknown>[]): Storyboard {
  const result = validateStoryboard({ title: "T", aspect: "9:16", ...(fps === undefined ? {} : { fps }), scenes });
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.storyboard;
}

const scene = (id: string, extra: Record<string, unknown> = {}) => ({ id, component: "Title", props: {}, ...extra });

describe("narrationDurations", () => {
  const storyboard = board(30, [
    scene("a", { narration: "Hello there." }),
    scene("b", { narration: "Explicit.", durationMs: 9000 }),
    scene("c", { narration: "No audio yet." }),
    scene("d", { durationMs: 1000 }),
  ]);
  const theme = resolveTheme(storyboard);
  const audio = { a: { audioMs: 2000 }, b: { audioMs: 2000 } };

  it("is the scene lead plus the audio plus a 500 ms tail", () => {
    // 25 fps is 40 ms a frame; pick the audio so the sum lands exactly on a frame.
    const audioMs = 2000 + ((40 - ((theme.motion.leadMs + 2500) % 40)) % 40);
    const { a } = narrationDurations(board(25, [scene("a", { narration: "Hi." })]), { a: { audioMs } }, theme);
    expect(a).toBe(theme.motion.leadMs + audioMs + 500);
  });

  it("rounds up to a whole frame", () => {
    const sb = board(30, [scene("a", { narration: "Hi." })]);
    const ms = narrationDurations(sb, { a: { audioMs: 2001 } }, theme).a!;
    const frames = (ms * 30) / 1000;
    expect(Number.isInteger(Math.round(frames * 1e6) / 1e6)).toBe(true);
    expect(ms).toBeGreaterThanOrEqual(theme.motion.leadMs + 2001 + 500);
    expect(ms - (theme.motion.leadMs + 2001 + 500)).toBeLessThan(1000 / 30);
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
});
