// StrokeTrace: an icon or custom paths draw themselves stroke by stroke from
// their measured length, a nib riding the ink front, then fill (if asked) and
// the label fades in.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SceneClockContext, StrokeTrace, contentArea, lightTheme, pathLength, strokeTraceTiming, type Aspect, type StrokeTraceProps } from "../src/index";

const FPS = 30;
const FRAMES = 150;
const msOf = (frame: number) => (frame * 1000) / FPS;

type Props = Omit<StrokeTraceProps, "progress" | "theme" | "aspect">;

function draw(props: Props, frame: number, aspect: Aspect = "9:16"): string {
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames: FRAMES }}>
      <StrokeTrace {...props} progress={frame / (FRAMES - 1)} theme={lightTheme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
}

interface Stroke {
  index: number;
  length: number;
  offset: number;
  hidden: boolean;
}

function strokes(html: string): Stroke[] {
  return [...html.matchAll(/<path data-stroke-trace-path="(\d+)"[^>]*>/g)].map(([tag, index]) => ({
    index: Number(index),
    length: Number(/stroke-dasharray="([\d.]+)/.exec(tag)![1]),
    offset: Number(/stroke-dashoffset="([-\d.]+)"/.exec(tag)![1]),
    hidden: /visibility="hidden"/.test(tag),
  }));
}

const SQUARE = "M 4 4 H 20 V 20 H 4 Z";
const WAVE = "M 2 12 C 6 4 10 4 12 12 S 18 20 22 12";
const TICK = "m6 12 4 4 8-8";
const CUSTOM: Props = { paths: [SQUARE, WAVE, TICK], fill: true, label: "Drawn by hand" };
/** A hold frame: everything has landed and the exit has not begun. */
const HOLD = 90;

describe("StrokeTrace", () => {
  it("dashes each path by its measured length", () => {
    const drawn = strokes(draw(CUSTOM, 0));
    expect(drawn.map((s) => s.length)).toEqual([SQUARE, WAVE, TICK].map((d) => expect.closeTo(pathLength(d), 2)));
  });

  it("hides every stroke near the start", () => {
    for (const frame of [0, 3]) {
      for (const stroke of strokes(draw(CUSTOM, frame))) {
        expect(stroke.offset).toBeCloseTo(stroke.length, 2);
        expect(stroke.hidden).toBe(true);
      }
    }
  });

  it("has every path fully drawn on the hold frame", () => {
    for (const props of [CUSTOM, { icon: "users", label: "Your team" }] as Props[]) {
      const drawn = strokes(draw(props, HOLD));
      expect(drawn.length).toBeGreaterThan(0);
      for (const stroke of drawn) {
        expect(stroke.offset).toBe(0);
        expect(stroke.hidden).toBe(false);
      }
    }
  });

  it("draws the paths one after another, in order", () => {
    const frames = Array.from({ length: HOLD }, (_, f) => strokes(draw(CUSTOM, f)));
    const began = [0, 1, 2].map((i) => frames.findIndex((s) => s[i]!.offset < s[i]!.length - 1e-6));
    const done = [0, 1, 2].map((i) => frames.findIndex((s) => s[i]!.offset === 0));
    for (const i of [1, 2]) {
      expect(began[i]).toBeGreaterThanOrEqual(done[i - 1]!);
      expect(done[i]).toBeGreaterThan(done[i - 1]!);
    }
    expect(msOf(began[0]!)).toBeGreaterThanOrEqual(100);
    expect(msOf(began[0]!)).toBeLessThanOrEqual(250);
  });

  it("takes about 1.4 s to draw, each path in time proportional to its length", () => {
    const lengths = [10, 30, 60];
    const timing = strokeTraceTiming(lightTheme, lengths);
    const total = timing.drawnMs - timing.paths[0]!.startMs;
    expect(total).toBeGreaterThan(1200);
    expect(total).toBeLessThan(1600);
    const spans = timing.paths.map((p) => p.endMs - p.startMs);
    expect(spans[0]).toBeLessThan(spans[1]!);
    expect(spans[1]).toBeLessThan(spans[2]!);
    // Twelve short paths still fit the same window, in order.
    const many = strokeTraceTiming(lightTheme, Array(12).fill(1));
    expect(many.drawnMs - many.paths[0]!.startMs).toBeLessThan(1600);
    many.paths.slice(1).forEach((p, i) => expect(p.startMs).toBeGreaterThanOrEqual(many.paths[i]!.endMs));
  });

  it("fills closed paths only with fill on, after drawing", () => {
    const fills = (html: string) => [...html.matchAll(/data-stroke-trace-fill="(\d+)"[^>]*fill-opacity="([\d.]+)"/g)].map(([, i, o]) => [Number(i), Number(o)]);
    // The square is closed; the wave and tick are open.
    expect(fills(draw(CUSTOM, HOLD)).map(([i]) => i)).toEqual([0]);
    expect(fills(draw(CUSTOM, HOLD))[0]![1]).toBeGreaterThan(0);
    expect(fills(draw(CUSTOM, 20))[0]![1]).toBe(0);
    expect(fills(draw({ ...CUSTOM, fill: false }, HOLD))).toEqual([]);
  });

  it("rides a nib on the ink front, and lifts it once drawn", () => {
    expect(draw(CUSTOM, 20)).toContain("data-stroke-trace-nib");
    expect(draw(CUSTOM, HOLD)).not.toContain("data-stroke-trace-nib");
    expect(draw({ ...CUSTOM, nib: false }, 20)).not.toContain("data-stroke-trace-nib");
  });

  it("fades the label in after the drawing", () => {
    const opacity = (html: string) => Number(/data-stroke-trace-label=""[^>]*opacity:([\d.]+)/.exec(html)![1]);
    expect(opacity(draw(CUSTOM, 20))).toBe(0);
    expect(opacity(draw(CUSTOM, HOLD))).toBe(1);
  });

  it("draws an icon's circles and rects as paths", () => {
    // lucide users: two paths and a circle.
    expect(strokes(draw({ icon: "users" }, HOLD))).toHaveLength(4);
    expect(strokes(draw({ icon: "lock" }, HOLD)).length).toBeGreaterThan(1);
  });

  it.each(["9:16", "16:9"] as const)("draws large and centered in the content area (%s)", (aspect) => {
    const html = draw({ icon: "zap", label: "Fast" }, HOLD, aspect);
    const size = Number(/<svg[^>]*width="([\d.]+)"/.exec(html)![1]);
    const area = contentArea(lightTheme, aspect);
    expect(Math.abs(size - 0.4 * Math.min(area.width, area.height))).toBeLessThanOrEqual(1);
    const left = Number(/^<div style="position:absolute;left:([\d.]+)px/.exec(html)![1]);
    const width = Number(/^<div[^>]*?width:([\d.]+)px/.exec(html)![1]);
    expect(left + width / 2).toBeCloseTo(area.x + area.width / 2, 0);
  });

  it("throws on bad props", () => {
    expect(() => draw({ icon: "check", paths: [SQUARE] }, 0)).toThrow(/StrokeTrace/);
    expect(() => draw({} as Props, 0)).toThrow(/StrokeTrace/);
    expect(() => draw({ icon: "no-such-icon" }, 0)).toThrow(/no-such-icon/);
    expect(() => draw({ paths: [] }, 0)).toThrow(/StrokeTrace/);
    expect(() => draw({ paths: Array(13).fill(SQUARE) }, 0)).toThrow(/StrokeTrace/);
    expect(() => draw({ paths: ["M 0 0 X 3"] }, 0)).toThrow(/StrokeTrace/);
  });
});
