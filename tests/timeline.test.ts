import { describe, expect, it } from "vitest";
import { buildTimeline, frameAt, type Storyboard } from "../src/index";

function board(fps: number, ids: string[] = ["intro", "body", "outro"]): Storyboard {
  return {
    title: "Demo",
    aspect: "9:16",
    fps,
    theme: "neutral",
    scenes: ids.map((id) => ({ id, component: "Title", props: {} })),
  };
}

describe("buildTimeline: 3 scenes", () => {
  const durations = { intro: 1000, body: 2500, outro: 1500 };

  it("converts durations to frames at 30 fps", () => {
    const tl = buildTimeline(board(30), durations);
    expect(tl.fps).toBe(30);
    expect(tl.totalFrames).toBe(150);
    expect(tl.scenes).toEqual([
      { id: "intro", startFrame: 0, frames: 30 },
      { id: "body", startFrame: 30, frames: 75 },
      { id: "outro", startFrame: 105, frames: 45 },
    ]);
  });

  it("converts durations to frames at 60 fps", () => {
    const tl = buildTimeline(board(60), durations);
    expect(tl.totalFrames).toBe(300);
    expect(tl.scenes.map((s) => s.frames)).toEqual([60, 150, 90]);
    expect(tl.scenes.map((s) => s.startFrame)).toEqual([0, 60, 210]);
  });

  it.each([30, 60])("locates frames at scene boundaries at %i fps", (fps) => {
    const tl = buildTimeline(board(fps), durations);
    expect(frameAt(tl, 0)).toEqual({ sceneIndex: 0, sceneId: "intro", localFrame: 0, sceneFrames: fps, progress: 0 });
    expect(frameAt(tl, fps - 1)).toMatchObject({ sceneIndex: 0, localFrame: fps - 1, progress: 1 });
    expect(frameAt(tl, fps)).toMatchObject({ sceneIndex: 1, sceneId: "body", localFrame: 0, progress: 0 });
    const last = frameAt(tl, tl.totalFrames - 1);
    expect(last).toMatchObject({ sceneIndex: 2, sceneId: "outro", localFrame: last.sceneFrames - 1, progress: 1 });
  });

  it("reports progress within the scene", () => {
    const tl = buildTimeline(board(30), durations);
    const mid = frameAt(tl, 30 + 37); // body has 75 frames: local 37 of 0..74
    expect(mid.localFrame).toBe(37);
    expect(mid.progress).toBeCloseTo(0.5);
  });

  it("maps every frame to exactly one scene, in order", () => {
    const tl = buildTimeline(board(60), durations);
    const counts = [0, 0, 0];
    let prev = 0;
    for (let n = 0; n < tl.totalFrames; n++) {
      const f = frameAt(tl, n);
      expect(f.sceneIndex).toBeGreaterThanOrEqual(prev);
      expect(f.progress).toBeGreaterThanOrEqual(0);
      expect(f.progress).toBeLessThanOrEqual(1);
      counts[f.sceneIndex] = (counts[f.sceneIndex] ?? 0) + 1;
      prev = f.sceneIndex;
    }
    expect(counts).toEqual(tl.scenes.map((s) => s.frames));
  });
});

describe("buildTimeline: no drift", () => {
  it.each([24, 25, 30, 60])("scene frames sum to round(totalMs * fps / 1000) at %i fps", (fps) => {
    const tl = buildTimeline(board(fps, ["a", "b", "c"]), { a: 1033, b: 1033, c: 1033 });
    const expected = Math.round((3099 * fps) / 1000);
    expect(tl.totalFrames).toBe(expected);
    expect(tl.scenes.reduce((sum, s) => sum + s.frames, 0)).toBe(expected);
  });

  it("puts the rounding remainder on the last scene", () => {
    // 3 x 1050ms at 30 fps: 31.5 frames each, 94.5 total -> 95.
    const tl = buildTimeline(board(30, ["a", "b", "c"]), { a: 1050, b: 1050, c: 1050 });
    expect(tl.totalFrames).toBe(95);
    expect(tl.scenes.map((s) => s.frames)).toEqual([32, 32, 31]);

    // 3 x 1010ms at 30 fps: 30.3 frames each, 90.9 total -> 91.
    const tl2 = buildTimeline(board(30, ["a", "b", "c"]), { a: 1010, b: 1010, c: 1010 });
    expect(tl2.totalFrames).toBe(91);
    expect(tl2.scenes.map((s) => s.frames)).toEqual([30, 30, 31]);
  });

  it("handles many scenes without drift", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `s${i}`);
    const durations = Object.fromEntries(ids.map((id) => [id, 1234.567]));
    const tl = buildTimeline(board(30, ids), durations);
    expect(tl.totalFrames).toBe(Math.round((50 * 1234.567 * 30) / 1000));
    expect(tl.scenes.reduce((sum, s) => sum + s.frames, 0)).toBe(tl.totalFrames);
  });
});

describe("buildTimeline: durations", () => {
  it("falls back to the scene's durationMs when the map has no entry", () => {
    const sb = board(30, ["a", "b"]);
    sb.scenes[1] = { ...sb.scenes[1]!, durationMs: 500 };
    const tl = buildTimeline(sb, { a: 1000 });
    expect(tl.scenes.map((s) => s.frames)).toEqual([30, 15]);
  });

  it("prefers the map over the scene's durationMs", () => {
    const sb = board(30, ["a"]);
    sb.scenes[0] = { ...sb.scenes[0]!, durationMs: 500 };
    expect(buildTimeline(sb, { a: 2000 }).totalFrames).toBe(60);
  });

  it("accepts a Map", () => {
    const tl = buildTimeline(board(30, ["a"]), new Map([["a", 1000]]));
    expect(tl.totalFrames).toBe(30);
  });

  it("throws when a scene has no duration", () => {
    expect(() => buildTimeline(board(30, ["a", "b"]), { a: 1000 })).toThrow(/scene "b".*no duration/);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])("throws on invalid duration %s", (ms) => {
    expect(() => buildTimeline(board(30, ["a"]), { a: ms })).toThrow(/scene "a"/);
  });

  it("throws when a scene is shorter than one frame", () => {
    expect(() => buildTimeline(board(30, ["a", "b"]), { a: 10, b: 1000 })).toThrow(/scene "a".*one frame/);
    expect(() => buildTimeline(board(30, ["a", "b"]), { a: 1000, b: 10 })).toThrow(/scene "b".*one frame/);
  });

  it("throws on an empty storyboard", () => {
    expect(() => buildTimeline(board(30, []), {})).toThrow(/no scenes/);
  });

  it("throws on an invalid fps", () => {
    expect(() => buildTimeline(board(0, ["a"]), { a: 1000 })).toThrow(/fps/);
  });
});

describe("frameAt: out of range", () => {
  const tl = buildTimeline(board(30), { intro: 1000, body: 1000, outro: 1000 });

  it.each([-1, 90, 1000])("throws for frame %i", (n) => {
    expect(() => frameAt(tl, n)).toThrow(/out of range: valid frames are 0\.\.89/);
  });

  it.each([1.5, Number.NaN])("throws for non-integer frame %s", (n) => {
    expect(() => frameAt(tl, n)).toThrow(/integer/);
  });
});
