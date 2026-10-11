// The settled opening: the first scene's entrances count as finished at frame
// 0, so the video's thumbnail is never blank; anything timed inside the scene
// still plays on its timeline. `opening: build` keeps the old behaviour.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, type TestContext } from "vitest";
import {
  OPENING_SETTLE_MS,
  PromptCard,
  SceneClockContext,
  SceneFrame,
  TitleCard,
  entering,
  lightTheme,
  opensSettled,
  promptCardTiming,
  validateStoryboard,
  type SceneTime,
} from "../src/index";
import { BLANK_OPENING_MESSAGE, checkOpening, judge, runChecks, WARNING_CHECKS, type FrameMeasurement } from "../src/checks";
import { buildTimeline } from "../src/engine/timeline";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { resolveTheme } from "../src/render/themes";

const theme = lightTheme;
const FPS = 30;
const FRAMES = 300;

/** A component drawn at `frame` of a 300-frame scene, with the opening settled or not. */
function at(frame: number, settled: boolean | undefined, element: (progress: number) => ReactElement): string {
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames: FRAMES, ...(settled === undefined ? {} : { settled }) }}>{element(frame / (FRAMES - 1))}</SceneClockContext.Provider>,
  );
}

const frame = (progress: number) => (
  <SceneFrame
    progress={progress}
    theme={theme}
    aspect="9:16"
    headline="Videos from a prompt"
    headlineMotion="words"
    mark="prompt"
    eyebrow="Launch"
    content={{ component: "PromptCard", props: { text: "A launch video for motioncraft" } }}
  />
);
const card = (progress: number) => <PromptCard progress={progress} theme={theme} aspect="9:16" text="A launch video for motioncraft" />;

const typedOf = (html: string) => /data-prompt-text="">([^<]*)</.exec(html)?.[1] ?? "";
/** The opacity of the first element carrying `attr`. */
const opacityOf = (html: string, attr: string) => Number(new RegExp(`${attr}[^>]*?opacity:\\s*([0-9.e-]+)`).exec(html)?.[1] ?? NaN);

describe("opening: validation", () => {
  const board = (extra: Record<string, unknown> = {}) => ({ title: "T", aspect: "9:16", scenes: [{ id: "a", component: "TitleCard", props: { title: "Hi" }, durationMs: 2000 }], ...extra });

  it.each(["settled", "build"])("accepts %s", (opening) => {
    const result = validateStoryboard(board({ opening }));
    expect(result.ok && result.storyboard.opening).toBe(opening);
  });

  it("leaves it unset when absent (the default is settled)", () => {
    const result = validateStoryboard(board());
    expect(result.ok && result.storyboard.opening).toBeUndefined();
    expect(opensSettled({}, 0)).toBe(true);
  });

  it.each(["fast", "", 1, null])("rejects %j", (opening) => {
    const result = validateStoryboard(board({ opening }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join()).toMatch(/opening must be "settled" or "build"/);
  });
});

describe("opening: which scene settles", () => {
  it("only the first scene, and only unless the storyboard builds", () => {
    expect(opensSettled({ opening: "settled" }, 0)).toBe(true);
    expect(opensSettled({ opening: "settled" }, 1)).toBe(false);
    expect(opensSettled({ opening: "build" }, 0)).toBe(false);
  });
});

describe("opening: entering()", () => {
  const time: SceneTime = { ms: 0, endMs: 5000, leftMs: 5000 };
  it("is the time itself when not settled", () => {
    expect(entering(time)).toBe(time);
  });
  it("runs entrances ahead by the settle offset, leaving the exit alone", () => {
    expect(entering({ ...time, settleMs: OPENING_SETTLE_MS })).toEqual({ ms: OPENING_SETTLE_MS, endMs: 5000 + OPENING_SETTLE_MS, leftMs: 5000, settleMs: OPENING_SETTLE_MS });
  });
});

describe("opening: engine", () => {
  it("settled: scene 1's headline and content entrance are complete at frame 0", () => {
    const html = at(0, true, frame);
    const landed = at(200, undefined, frame);
    const headline = (h: string) => /<h1[\s\S]*?<\/h1>/.exec(h)![0];
    expect(headline(html)).toBe(headline(landed));
    expect(opacityOf(html, 'data-block="PromptCard"')).toBe(1);
    expect(opacityOf(html, 'data-frame-part="eyebrow"')).toBe(1);
  });

  it("build: frame 0 is empty, exactly as before", () => {
    const html = at(0, undefined, frame);
    expect(opacityOf(html, 'data-block="PromptCard"')).toBe(0);
    for (const f of [0, 10, 25, 60, 150]) expect(at(f, false, frame)).toBe(at(f, undefined, frame));
  });

  it("a scene that is not settled (scene 2) keeps its entrance timings", () => {
    expect(opacityOf(at(0, false, card), 'data-block="PromptCard"')).toBe(0);
    expect(opacityOf(at(5, false, card), 'data-block="PromptCard"')).toBeLessThan(1);
  });

  it("a TitleCard settles too", () => {
    const title = (progress: number) => <TitleCard progress={progress} theme={theme} aspect="9:16" title="Hello there" />;
    expect(at(0, true, title)).toBe(at(200, undefined, title));
  });
});

describe("opening: PromptCard", () => {
  it("shows the container at frame 0, while the text still types on its timeline", () => {
    const text = "A launch video for motioncraft";
    const timing = promptCardTiming(theme, text);
    const f = (ms: number) => Math.round((ms * FPS) / 1000);
    const start = at(0, true, card);
    expect(opacityOf(start, 'data-block="PromptCard"')).toBe(1);
    expect(typedOf(start)).toBe("");
    const mid = f((timing.typing.typeStart + timing.typing.end) / 2);
    expect(typedOf(at(mid, true, card))).toBe(typedOf(at(mid, undefined, card)));
    expect(typedOf(at(mid, true, card)).length).toBeGreaterThan(0);
    expect(typedOf(at(mid, true, card)).length).toBeLessThan(text.length);
    expect(typedOf(at(f(timing.typing.end) + 5, true, card))).toBe(text);
  });
});

describe("opening: the check", () => {
  const text = (extra: Record<string, unknown> = {}) => ({ text: "Hi", rect: { x: 0, y: 0, width: 10, height: 10 }, clips: [], opacity: 1, color: "#000", backgrounds: ["#fff"], caption: false, fontSize: 40, fitted: false, ...extra });
  const measurement = (texts: object[]): FrameMeasurement => ({ texts: texts as FrameMeasurement["texts"], keys: [], blocks: [] });

  it("is a warning", () => {
    expect(WARNING_CHECKS.has("opening")).toBe(true);
  });
  it("warns on a blank frame 0, with the advice", () => {
    expect(checkOpening(measurement([]))).toEqual([BLANK_OPENING_MESSAGE]);
    expect(BLANK_OPENING_MESSAGE).toBe("frame 0 is blank, which is what GitHub, Slack and social apps show before play; use `opening: settled` or put text on the first frame");
    expect(checkOpening(measurement([text({ opacity: 0 })]))).toHaveLength(1);
    expect(checkOpening(measurement([text({ caption: true })]))).toHaveLength(1);
  });
  it("is quiet when frame 0 has visible text", () => {
    expect(checkOpening(measurement([text()]))).toEqual([]);
  });

  it("judge reports it as a warning, only for frame 0", () => {
    const parsed = validateStoryboard({ title: "T", aspect: "9:16", scenes: [{ id: "a", component: "TitleCard", props: { title: "Hi" }, durationMs: 2000 }] });
    if (!parsed.ok) throw new Error(parsed.errors.join());
    const sb = parsed.storyboard;
    const timeline = buildTimeline(sb, { a: 2000 }, theme);
    const blank = judge(sb, timeline, [{ frame: 0, measurement: measurement([]) }], theme);
    expect(blank.warnings.map((w) => w.check)).toContain("opening");
    expect(blank.passed).toBe(true);
    const later = judge(sb, timeline, [{ frame: 30, measurement: measurement([]) }], theme);
    expect(later.warnings.map((w) => w.check)).not.toContain("opening");
    const settled = judge(sb, timeline, [{ frame: 0, measurement: measurement([text()]) }], theme);
    expect(settled.warnings.map((w) => w.check)).not.toContain("opening");
  });
});

describe("opening: measured in the browser", { timeout: 120_000 }, () => {
  const warningsFor = async (opening: "settled" | "build" | undefined, ctx: TestContext) => {
    const json = JSON.parse(await readFile(join(import.meta.dirname, "fixtures", "headline.json"), "utf8"));
    const parsed = validateStoryboard({ ...json, ...(opening === undefined ? {} : { opening }) });
    if (!parsed.ok) throw new Error(parsed.errors.join(", "));
    const { storyboard } = parsed;
    try {
      const result = await runChecks({ storyboard, theme: resolveTheme(storyboard), durations: estimateDurations(storyboard), frames: [0] });
      return result.warnings.filter((w) => w.check === "opening");
    } catch (error) {
      if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
      throw error;
    }
  };

  it("a settled opening (the default) does not warn", async (ctx) => {
    expect(await warningsFor(undefined, ctx)).toEqual([]);
  });

  it("a built opening on an empty first frame warns", async (ctx) => {
    const warnings = await warningsFor("build", ctx);
    expect(warnings.map((w) => w.message)).toEqual([BLANK_OPENING_MESSAGE]);
  });
});
