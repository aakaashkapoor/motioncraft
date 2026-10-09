import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, type TestContext } from "vitest";
import {
  checkContrast,
  checkOverflow,
  checkReadability,
  checkSafeArea,
  countWords,
  effectiveBackground,
  formatProblem,
  judge,
  minReadMs,
  parseCssColor,
  contentOpacity,
  runChecks,
  sampleVisibleFrames,
  textContrast,
  type CheckResult,
  type FrameMeasurement,
  type MeasuredText,
} from "../src/checks";
import { contains, describeExcess, excess, union } from "../src/checks/geometry";
import { sceneWords } from "../src/checks/readability";
import { buildTimeline, neutralTheme, safeArea, validateStoryboard, type Storyboard, type Theme } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { resolveTheme } from "../src/render/themes";

const FRAME_9x16 = { width: 1080, height: 1920 };

function text(overrides: Partial<MeasuredText> = {}): MeasuredText {
  return {
    text: "Hello there",
    rect: { x: 200, y: 400, width: 400, height: 100 },
    clips: [],
    opacity: 1,
    color: "rgb(245, 246, 248)",
    backgrounds: ["rgb(11, 13, 16)"],
    caption: false,
    ...overrides,
  };
}

function frame(...texts: MeasuredText[]): FrameMeasurement {
  return { texts, keys: [] };
}

describe("geometry", () => {
  const outer = { x: 0, y: 0, width: 100, height: 100 };

  it("measures how far a rect sticks out on each side", () => {
    expect(excess(outer, { x: -5, y: 10, width: 120, height: 95 })).toEqual({ top: 0, right: 15, bottom: 5, left: 5 });
    expect(describeExcess(outer, { x: -5, y: 10, width: 120, height: 95 })).toBe("right by 15px, bottom by 5px, left by 5px");
  });

  it("allows a pixel of slack", () => {
    expect(contains(outer, { x: -1, y: 0, width: 101, height: 100 })).toBe(true);
    expect(contains(outer, { x: -2, y: 0, width: 50, height: 50 })).toBe(false);
  });

  it("unions rects", () => {
    expect(union([])).toBeUndefined();
    expect(union([{ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 5, width: 10, height: 20 }])).toEqual({ x: 0, y: 0, width: 30, height: 25 });
  });
});

describe("checkOverflow", () => {
  it("passes text that fits its box and the frame", () => {
    expect(checkOverflow(frame(text({ clips: [{ x: 0, y: 0, width: 1080, height: 1920 }] })), FRAME_9x16)).toEqual([]);
  });

  it("flags text clipped by its own or an ancestor's box", () => {
    const clipped = text({ clips: [{ x: 200, y: 400, width: 400, height: 60 }] });
    expect(checkOverflow(frame(clipped), FRAME_9x16)).toEqual([
      'text "Hello there" overflows its box and is clipped (bottom by 40px)',
    ]);
  });

  it("flags text running past the frame", () => {
    const wide = text({ rect: { x: 900, y: 400, width: 400, height: 100 } });
    expect(checkOverflow(frame(wide), FRAME_9x16)).toEqual(['text "Hello there" runs past the frame (right by 220px)']);
  });

  it("ignores text that is not visible on the frame", () => {
    const hidden = text({ opacity: 0, rect: { x: -500, y: 0, width: 100, height: 100 } });
    expect(checkOverflow(frame(hidden), FRAME_9x16)).toEqual([]);
  });
});

describe("checkSafeArea", () => {
  const safe = safeArea("9:16");

  it("passes text inside the safe area", () => {
    expect(checkSafeArea(frame(text({ rect: { ...safe } })), "9:16")).toEqual([]);
  });

  it("flags text under the vertical platform UI", () => {
    // The right-hand button column starts at 950px in 9:16.
    const right = text({ rect: { x: 600, y: 800, width: 400, height: 100 } });
    expect(checkSafeArea(frame(right), "9:16")).toEqual([
      `text "Hello there" is outside the 9:16 safe area (right by ${600 + 400 - (safe.x + safe.width)}px)`,
    ]);
    // The same box is fine in 16:9, which has no overlaid UI.
    expect(checkSafeArea(frame(right), "16:9")).toEqual([]);
  });

  it("flags key elements and ignores invisible ones", () => {
    const measurement: FrameMeasurement = {
      texts: [text({ opacity: 0, rect: { x: 0, y: 0, width: 10, height: 10 } })],
      keys: [
        { label: "logo", rect: { x: 0, y: 0, width: 100, height: 100 }, opacity: 1 },
        { label: "ghost", rect: { x: 0, y: 0, width: 100, height: 100 }, opacity: 0 },
      ],
    };
    const messages = checkSafeArea(measurement, "9:16");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^logo is outside the 9:16 safe area \(top by \d+px, left by \d+px\)$/);
  });
});

describe("contrast", () => {
  it("parses computed CSS colors", () => {
    expect(parseCssColor("rgb(11, 13, 16)")).toEqual({ r: 11, g: 13, b: 16, a: 1 });
    expect(parseCssColor("rgba(255, 0, 0, 0.5)")).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(parseCssColor("rgb(255 0 0 / 50%)")).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(parseCssColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor("#00000080")).toEqual({ r: 0, g: 0, b: 0, a: 128 / 255 });
    expect(parseCssColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseCssColor("oklch(0.5 0.1 200)")).toBeUndefined();
  });

  it("computes WCAG ratios", () => {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const white = { r: 255, g: 255, b: 255, a: 1 };
    expect(textContrast(black, white)).toBeCloseTo(21, 5);
    expect(textContrast(white, white)).toBeCloseTo(1, 5);
  });

  it("composites translucent layers over the white canvas", () => {
    expect(effectiveBackground([])).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    // 50% black over white is mid grey; an opaque layer hides everything below.
    expect(effectiveBackground([{ r: 0, g: 0, b: 0, a: 0.5 }])).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
    expect(effectiveBackground([{ r: 0, g: 0, b: 0, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 }])).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it("passes the neutral theme's text colors", () => {
    const { colors } = neutralTheme;
    const texts = [colors.text, colors.textMuted, colors.accent].map((color) =>
      text({ color, backgrounds: [colors.ground] }),
    );
    expect(checkContrast(frame(...texts))).toEqual([]);
  });

  it("flags low-contrast text, including faint translucent text", () => {
    expect(checkContrast(frame(text({ color: "#777777", backgrounds: ["#888888"] })))).toEqual([
      'text "Hello there" has contrast 1.26:1, below 4.5:1 (WCAG AA)',
    ]);
    expect(checkContrast(frame(text({ color: "rgba(245, 246, 248, 0.2)" })))).toHaveLength(1);
  });

  it("judges against what is underneath, not the element alone", () => {
    // A translucent dark plate over a white page is still too light for white text.
    expect(checkContrast(frame(text({ color: "#ffffff", backgrounds: ["rgba(0, 0, 0, 0.2)"] })))).toHaveLength(1);
    expect(checkContrast(frame(text({ color: "#ffffff", backgrounds: ["rgba(0, 0, 0, 0.2)", "#000000"] })))).toEqual([]);
  });

  it("ignores invisible text and reports colors it cannot read", () => {
    expect(checkContrast(frame(text({ color: "#777777", backgrounds: ["#888888"], opacity: 0 })))).toEqual([]);
    expect(checkContrast(frame(text({ color: "oklch(0.5 0.1 200)" })))).toEqual([
      'text "Hello there": cannot read color oklch(0.5 0.1 200) to measure contrast',
    ]);
  });
});

describe("readability", () => {
  it("needs 1.5 s plus 0.25 s per word", () => {
    expect(countWords("  one two\nthree ")).toBe(3);
    expect(minReadMs(0)).toBe(0);
    expect(minReadMs(4)).toBe(2500);
  });

  it("flags a scene shorter than its text needs", () => {
    expect(checkReadability(2500, 4)).toBeUndefined();
    expect(checkReadability(2400, 4)).toBe("scene is on screen for 2.40 s but its 4 words need at least 2.50 s to read");
    expect(checkReadability(100, 0)).toBeUndefined();
  });

  it("counts scene text but not the narration caption", () => {
    expect(sceneWords(frame(text({ text: "a b c" }), text({ text: "d e", caption: true }), text({ text: "f", opacity: 0 })))).toBe(4);
  });
});

function storyboard(input: unknown): Storyboard {
  const result = validateStoryboard(input);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

describe("judge", () => {
  const sb = storyboard({
    title: "T",
    aspect: "9:16",
    scenes: [
      { id: "quick", component: "TitleCard", props: {}, durationMs: 1000 },
      { id: "slow", component: "TitleCard", props: {}, durationMs: 5000 },
    ],
  });
  const timeline = buildTimeline(sb, {}); // quick: 0..29, slow: 30..179

  it("passes clean frames", () => {
    const result = judge(sb, timeline, [{ frame: 100, measurement: frame(text({ text: "Hi" })) }]);
    expect(result).toEqual({ passed: true, problems: [] });
  });

  it("tags each problem with its check, scene and frame", () => {
    const result = judge(sb, timeline, [
      { frame: 15, measurement: frame(text({ text: "far too many words for one second" })) },
      { frame: 100, measurement: frame(text({ text: "low", color: "#777", backgrounds: ["#888"] })) },
      { frame: 179, measurement: frame(text({ text: "edge", rect: { x: 0, y: 0, width: 50, height: 50 } })) },
    ]);
    expect(result.passed).toBe(false);
    expect(result.problems.map(({ check, sceneId, frame: n }) => [check, sceneId, n])).toEqual([
      ["readability", "quick", 0],
      ["contrast", "slow", 100],
      ["safe-area", "slow", 179],
    ]);
    expect(formatProblem(result.problems[0]!)).toBe(
      '[readability] scene "quick", frame 0: scene is on screen for 1.00 s but its 7 words need at least 3.25 s to read',
    );
  });

  it("uses the most words a scene shows on any measured frame", () => {
    const result = judge(sb, timeline, [
      { frame: 30, measurement: frame() },
      { frame: 100, measurement: frame(text({ text: Array.from({ length: 20 }, () => "word").join(" ") })) },
    ]);
    expect(result.problems).toEqual([
      { check: "readability", sceneId: "slow", frame: 30, message: "scene is on screen for 5.00 s but its 20 words need at least 6.50 s to read" },
    ]);
  });
});

describe("sampleVisibleFrames", () => {
  // 30 fps: "a" is frames 0..29, "b" is frames 30..89.
  const sb = storyboard({
    title: "T",
    aspect: "9:16",
    scenes: [
      { id: "a", component: "TitleCard", props: {}, durationMs: 1000 },
      { id: "b", component: "TitleCard", props: {}, durationMs: 2000 },
    ],
  });
  const timeline = buildTimeline(sb, {});

  /** Fades in over the first 5 frames and out over the last 5 of each scene. */
  function fadeOpacity(n: number): number {
    const scene = timeline.scenes.find((s) => n >= s.startFrame && n < s.startFrame + s.frames)!;
    const local = n - scene.startFrame;
    return Math.min(1, local / 5, (scene.frames - 1 - local) / 5);
  }

  it("reads content opacity as the faintest element on the frame", () => {
    expect(contentOpacity(frame())).toBe(0);
    expect(contentOpacity(frame(text({ opacity: 1 }), text({ opacity: 0.4 })))).toBe(0.4);
    expect(contentOpacity({ texts: [text()], keys: [{ label: "logo", rect: { x: 0, y: 0, width: 1, height: 1 }, opacity: 0.5 }] })).toBe(0.5);
  });

  it("picks the first and last fully visible frames and the middle of each scene", async () => {
    const measured: number[] = [];
    const result = await sampleVisibleFrames(timeline, async (n) => {
      measured.push(n);
      return frame(text({ opacity: fadeOpacity(n) }));
    });
    expect(result.map((m) => m.frame)).toEqual([5, 14, 24, 35, 59, 84]);
    // Each frame is measured at most once.
    expect(new Set(measured).size).toBe(measured.length);
  });

  it("falls back to the middle when a scene is never fully visible", async () => {
    const result = await sampleVisibleFrames(timeline, async () => frame(text({ opacity: 0.5 })));
    expect(result.map((m) => m.frame)).toEqual([14, 59]);
  });

  it("catches content that is out of bounds only during its entrance", async () => {
    // Scene "b" fades in over 5 frames but keeps sliding in from below the
    // frame until its 10th frame: out of bounds while fully visible.
    const result = await sampleVisibleFrames(timeline, async (n) => {
      const local = n - 30;
      const y = local >= 0 && local < 10 ? 1900 : 400;
      return frame(text({ text: "Sliding", opacity: fadeOpacity(n), rect: { x: 200, y, width: 400, height: 100 } }));
    });
    const problems = judge(sb, timeline, result).problems.filter((p) => p.check !== "readability");
    expect(problems.map(({ check, sceneId, frame: n }) => [check, sceneId, n])).toEqual([
      ["overflow", "b", 35],
      ["safe-area", "b", 35],
    ]);
  });
});

async function loadStoryboard(...path: string[]): Promise<Storyboard> {
  return storyboard(JSON.parse(await readFile(join(import.meta.dirname, ...path), "utf8")));
}

/** Runs the checks in the browser, skipping the test when no Chrome or Edge is installed. */
async function check(ctx: TestContext, sb: Storyboard, theme: Theme = resolveTheme(sb.theme)): Promise<CheckResult> {
  return runChecks({ storyboard: sb, theme, durations: estimateDurations(sb) }).catch((error: unknown) => {
    if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed, skipping browser checks: ${error.message}`);
    throw error;
  });
}

describe("runChecks (integration)", { timeout: 60_000 }, () => {
  it("passes examples/hello", async (ctx) => {
    const result = await check(ctx, await loadStoryboard("..", "examples", "hello", "storyboard.json"));
    expect(result.problems.map(formatProblem)).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it("fails a too-long title in 9:16 on overflow or safe area", async (ctx) => {
    const sb = await loadStoryboard("fixtures", "too-long-title.json");
    expect(sb.aspect).toBe("9:16");
    const result = await check(ctx, sb);
    expect(result.passed).toBe(false);
    const layout = result.problems.filter((p) => p.check === "overflow" || p.check === "safe-area");
    expect(layout.length).toBeGreaterThan(0);
    expect(result.problems.every((p) => p.sceneId === "too-long")).toBe(true);
    // Seen on the first and last fully visible frames and the middle, not only the middle.
    expect(new Set(layout.map((p) => p.frame)).size).toBe(3);
  });

  it("measures real colors and timing in the page", async (ctx) => {
    const sb = await loadStoryboard("..", "examples", "hello", "storyboard.json");
    const dim: Theme = { ...neutralTheme, colors: { ...neutralTheme.colors, textMuted: "#2a2d33" } };
    const rushed = { ...sb, scenes: sb.scenes.map((scene) => ({ ...scene, durationMs: 1000 })) };
    const result = await check(ctx, rushed, dim);
    const contrast = result.problems.filter((p) => p.check === "contrast");
    expect(contrast.length).toBeGreaterThan(0);
    expect(contrast.every((p) => /"Videos drawn in code"|"No cloud\. No accounts\."/.test(p.message))).toBe(true);
    expect(result.problems.filter((p) => p.check === "readability").map((p) => p.sceneId)).toEqual(["hello", "local"]);
  });
});
