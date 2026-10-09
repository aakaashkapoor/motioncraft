import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, type TestContext } from "vitest";
import {
  checkCentering,
  checkContrast,
  checkOverflow,
  checkReadability,
  checkSafeArea,
  checkTypeScale,
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
  type MeasuredBlock,
  type MeasuredText,
} from "../src/checks";
import { contains, describeExcess, excess, union } from "../src/checks/geometry";
import { sceneWords } from "../src/checks/readability";
import { buildTimeline, lightTheme, neutralTheme, rampSteps, safeArea, validateStoryboard, type Storyboard, type Theme } from "../src/index";
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
    fontSize: 48,
    fitted: false,
    ...overrides,
  };
}

function frame(...texts: MeasuredText[]): FrameMeasurement {
  return { texts, keys: [], blocks: [] };
}

function block(overrides: Partial<MeasuredBlock> = {}): MeasuredBlock {
  return { label: "Card", rect: { x: 240, y: 700, width: 600, height: 300 }, opacity: 1, caption: false, ...overrides };
}

const withBlocks = (...blocks: MeasuredBlock[]): FrameMeasurement => ({ texts: [], keys: [], blocks });

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

  it("passes text inside the safe area, clear of the rail", () => {
    // In shorts the rail cuts into the column's lower rows; crosspost's rail is outside its column.
    expect(checkSafeArea(frame(text({ rect: { ...safe, height: 960 - safe.y } })), "9:16")).toEqual([]);
    expect(checkSafeArea(frame(text({ rect: safeArea("9:16", "crosspost") })), "9:16", "crosspost")).toEqual([]);
  });

  it("flags text under the vertical platform UI", () => {
    // The shorts text column ends at x = 960.
    const right = text({ rect: { x: 600, y: 800, width: 400, height: 100 } });
    expect(checkSafeArea(frame(right), "9:16")).toEqual([
      `text "Hello there" is outside the 9:16 "shorts" safe area (right by ${600 + 400 - (safe.x + safe.width)}px)`,
    ]);
    // The same box is fine in 16:9, which has no overlaid UI.
    expect(checkSafeArea(frame(right), "16:9")).toEqual([]);
  });

  it("keeps text off the right rail only in the rail's rows (shorts: x > 900 for y 960-1600)", () => {
    const high = text({ text: "High", rect: { x: 500, y: 800, width: 440, height: 100 } });
    expect(checkSafeArea(frame(high), "9:16")).toEqual([]);
    const low = text({ text: "Low", rect: { x: 500, y: 1100, width: 440, height: 100 } });
    expect(checkSafeArea(frame(low), "9:16")).toEqual([`text "Low" is under the platform's button rail (x > 900 for y 960-1600) by 40px`]);
    // The rail is a keep-out for text, not for shapes: key elements may cross it.
    const measurement: FrameMeasurement = { texts: [], keys: [{ label: "arrow", rect: { x: 500, y: 1100, width: 440, height: 100 }, opacity: 1 }], blocks: [] };
    expect(checkSafeArea(measurement, "9:16")).toEqual([]);
  });

  it("checks the crosspost profile: centered text within x 200-880, nothing below 1240", () => {
    const left = text({ text: "Left", rect: { x: 150, y: 800, width: 400, height: 100 } });
    expect(checkSafeArea(frame(left), "9:16")).toEqual([]);
    expect(checkSafeArea(frame(left), "9:16", "crosspost")).toEqual(['text "Left" is outside the 9:16 "crosspost" safe area (left by 50px)']);
    const low = text({ text: "Low", rect: { x: 300, y: 1250, width: 400, height: 100 } });
    expect(checkSafeArea(frame(low), "9:16", "crosspost")).toEqual(['text "Low" is outside the 9:16 "crosspost" safe area (bottom by 110px)']);
  });

  it("flags key elements and ignores invisible ones", () => {
    const measurement: FrameMeasurement = {
      texts: [text({ opacity: 0, rect: { x: 0, y: 0, width: 10, height: 10 } })],
      keys: [
        { label: "logo", rect: { x: 0, y: 0, width: 100, height: 100 }, opacity: 1 },
        { label: "ghost", rect: { x: 0, y: 0, width: 100, height: 100 }, opacity: 0 },
      ],
      blocks: [],
    };
    const messages = checkSafeArea(measurement, "9:16");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^logo is outside the 9:16 "shorts" safe area \(top by \d+px, left by \d+px\)$/);
  });
});

describe("checkCentering", () => {
  it("passes a main block centered on x = 540, give or take 8 px", () => {
    expect(checkCentering(withBlocks(block()), "9:16")).toEqual([]);
    expect(checkCentering(withBlocks(block({ rect: { x: 248, y: 700, width: 600, height: 300 } })), "9:16")).toEqual([]);
  });

  it("warns when the main block's center is more than 8 px from the frame center", () => {
    // v2's layout: the content column centered on x = 502.
    const off = withBlocks(block({ rect: { x: 54, y: 700, width: 896, height: 300 } }));
    expect(checkCentering(off, "9:16")).toEqual(["the main block (Card) is centered on x = 502, 38px left of the frame center (x = 540)"]);
    const right = withBlocks(block({ label: "terminal window", rect: { x: 300, y: 700, width: 600, height: 300 } }));
    expect(checkCentering(right, "9:16")).toEqual(["the main block (terminal window) is centered on x = 600, 60px right of the frame center (x = 540)"]);
  });

  it("takes the main block as the scene's blocks together, leaving out the caption and hidden blocks", () => {
    const pair = withBlocks(
      block({ label: "CardRow", rect: { x: 120, y: 700, width: 400, height: 300 } }),
      block({ label: "CardRow", rect: { x: 560, y: 700, width: 400, height: 300 } }),
      block({ label: "Caption", caption: true, rect: { x: 0, y: 1300, width: 300, height: 100 } }),
      block({ label: "ghost", opacity: 0, rect: { x: 0, y: 0, width: 100, height: 100 } }),
    );
    expect(checkCentering(pair, "9:16")).toEqual([]);
  });

  it("only applies to 9:16, and passes a frame without blocks", () => {
    expect(checkCentering(withBlocks(block({ rect: { x: 0, y: 0, width: 100, height: 100 } })), "16:9")).toEqual([]);
    expect(checkCentering(withBlocks(), "9:16")).toEqual([]);
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

describe("type-scale", () => {
  const steps = rampSteps(lightTheme, "9:16");

  it("passes text set at a step of the ramp, allowing sub-pixel rounding", () => {
    expect(checkTypeScale(frame(text({ fontSize: 48 }), text({ fontSize: 240 }), text({ fontSize: 32.4 })), steps)).toEqual([]);
  });

  it("warns on text whose computed size is off the ramp, naming the steps around it", () => {
    expect(checkTypeScale(frame(text({ fontSize: 42 })), steps)).toEqual([
      'text "Hello there" is 42px, which is not a step of the type ramp (between label 40px and body 48px)',
    ]);
    expect(checkTypeScale(frame(text({ text: "Tiny", fontSize: 20 })), steps)).toEqual([
      'text "Tiny" is 20px, which is not a step of the type ramp (below eyebrow 32px)',
    ]);
    expect(checkTypeScale(frame(text({ text: "Huge", fontSize: 300 })), steps)).toEqual([
      'text "Huge" is 300px, which is not a step of the type ramp (above numeral 240px)',
    ]);
  });

  it("allows fitted text that shrank on purpose, and ignores text that is not visible", () => {
    expect(checkTypeScale(frame(text({ fontSize: 31, fitted: true }), text({ fontSize: 42, opacity: 0 })), steps)).toEqual([]);
  });

  it("reads the ramp of the aspect, including mono", () => {
    expect(rampSteps(lightTheme, "16:9").map((s) => s.size)).toEqual([220, 140, 112, 88, 72, 56, 44, 36, 28, 36]);
    expect(checkTypeScale(frame(text({ fontSize: 36 })), rampSteps(lightTheme, "16:9"))).toEqual([]);
  });
});

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
    const result = judge(sb, timeline, [{ frame: 100, measurement: frame(text({ text: "Hi" })) }], lightTheme);
    expect(result).toEqual({ passed: true, problems: [], warnings: [] });
  });

  it("reports off-ramp text as a warning, once per scene, without failing the run", () => {
    const off = frame(text({ text: "Off", fontSize: 50 }));
    const result = judge(sb, timeline, [30, 100, 179].map((n) => ({ frame: n, measurement: off })), lightTheme);
    expect(result.passed).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.warnings).toEqual([
      { check: "type-scale", sceneId: "slow", frame: 30, message: 'text "Off" is 50px, which is not a step of the type ramp (between body 48px and subtitle 60px)' },
    ]);
    expect(formatProblem(result.warnings[0]!)).toMatch(/^warn \[type-scale\] scene "slow", frame 30: text "Off" is 50px/);
  });

  it("reports an off-center main block as a centering warning, once per scene", () => {
    const off = withBlocks(block({ rect: { x: 54, y: 700, width: 896, height: 300 } }));
    const result = judge(sb, timeline, [30, 100].map((n) => ({ frame: n, measurement: off })), lightTheme);
    expect(result.passed).toBe(true);
    expect(result.warnings.map(({ check, sceneId, frame: n }) => [check, sceneId, n])).toEqual([["centering", "slow", 30]]);
  });

  it("judges the safe area with the theme's profile", () => {
    const left = frame(text({ text: "Left", rect: { x: 150, y: 800, width: 400, height: 100 } }));
    expect(judge(sb, timeline, [{ frame: 100, measurement: left }], lightTheme).passed).toBe(true);
    const crosspost = judge(sb, timeline, [{ frame: 100, measurement: left }], { ...lightTheme, safe: "crosspost" });
    expect(crosspost.problems.map((p) => p.check)).toEqual(["safe-area"]);
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
    expect(contentOpacity({ texts: [text()], keys: [{ label: "logo", rect: { x: 0, y: 0, width: 1, height: 1 }, opacity: 0.5 }], blocks: [] })).toBe(0.5);
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
  it("passes examples/hello, with every text on the type ramp", async (ctx) => {
    const result = await check(ctx, await loadStoryboard("..", "examples", "hello", "storyboard.json"));
    expect(result.problems.map(formatProblem)).toEqual([]);
    expect(result.warnings.map(formatProblem)).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it("allows a long terminal: its text stays on the ramp and it scrolls without cutting a line off", async (ctx) => {
    const lines = Array.from({ length: 24 }, (_, i) => ({ prompt: i % 4 === 0, text: `step ${i + 1}: building the storyboard frames` }));
    const sb = storyboard({
      title: "Fit",
      aspect: "9:16",
      scenes: [{ id: "term", component: "TerminalWindow", props: { lines }, durationMs: 9000 }],
    });
    const result = await check(ctx, sb, lightTheme);
    expect(result.warnings.map(formatProblem)).toEqual([]);
    expect(result.problems.filter((p) => p.check === "overflow" || p.check === "type-scale").map(formatProblem)).toEqual([]);
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

  it("reads a headline rising character by character as its words, clear of its clip", async (ctx) => {
    const sb = storyboard({
      title: "Chars",
      aspect: "9:16",
      theme: "light",
      scenes: [{ id: "chars", component: "Headline", props: { text: "Made for agents", motion: "chars", mark: "agents" }, durationMs: 2400 }],
    });
    // Three words need 2.25 s; read as thirteen characters they would need 4.75 s.
    const result = await check(ctx, sb, lightTheme);
    expect(result.problems.map(formatProblem)).toEqual([]);
    expect(result.warnings.map(formatProblem)).toEqual([]);
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

describe("camera shots", () => {
  // While the camera holds a shot, what lies outside the shot is cropped scenery, not layout.
  const offFrame = { x: 200, y: 2100, width: 400, height: 100 };

  it("leave text out of shot to the camera: no safe-area or overflow problem", () => {
    expect(checkSafeArea(frame(text({ rect: offFrame })), "9:16")).toHaveLength(1);
    expect(checkSafeArea(frame(text({ rect: offFrame, outOfShot: true })), "9:16")).toEqual([]);
    expect(checkOverflow(frame(text({ rect: offFrame, outOfShot: true })), FRAME_9x16)).toEqual([]);
    expect(checkOverflow(frame(text({ rect: offFrame })), FRAME_9x16)).toHaveLength(1);
  });

  it("still judge text in shot", () => {
    expect(checkSafeArea(frame(text({ rect: offFrame, outOfShot: false })), "9:16")).toHaveLength(1);
  });

  it("leave key elements and blocks out of shot alone", () => {
    const key = { label: "logo", rect: offFrame, opacity: 1 };
    expect(checkSafeArea({ texts: [], keys: [key], blocks: [] }, "9:16")).toHaveLength(1);
    expect(checkSafeArea({ texts: [], keys: [{ ...key, outOfShot: true }], blocks: [] }, "9:16")).toEqual([]);
    const centered = block({ rect: { x: 240, y: 700, width: 600, height: 300 } });
    const pushedAside = block({ rect: { x: 900, y: 1700, width: 600, height: 300 } });
    expect(checkCentering(withBlocks(centered, pushedAside), "9:16")).toHaveLength(1);
    expect(checkCentering(withBlocks(centered, { ...pushedAside, outOfShot: true }), "9:16")).toEqual([]);
  });
});
