// BarChart: bars that grow from the baseline in reading order, their exact
// values counting up and landing at the bar ends, the emphasized bar in the
// accent; or, as `progress`, one labeled track per item filling left to right.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, BarChart, SceneClockContext, barChartErrors, barChartLayout, lightTheme, type Aspect, type BarChartProps } from "../src/index";

const FPS = 30;
const FRAMES = 150;
/** Well after the build (about 1.6 s with the pop), before the exit. */
const HOLD = 100;

type Props = Omit<BarChartProps, "progress" | "theme" | "aspect">;

function draw(props: Props, frame: number, aspect: Aspect = "9:16", frames = FRAMES): string {
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames }}>
      <BarChart {...props} progress={frame / (frames - 1)} theme={lightTheme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
}

const REVENUE: Props = {
  title: "Revenue by quarter",
  data: [
    { label: "Q1", value: 480 },
    { label: "Q2", value: 720 },
    { label: "Q3", value: 1250, emphasis: true },
    { label: "Q4", value: 960 },
    { label: "Q5", value: 610 },
  ],
  prefix: "$",
};

const PROGRESS: Props = {
  variant: "progress",
  data: [
    { label: "Coverage", value: 37.5 },
    { label: "Uptime", value: 99.9, emphasis: true },
    { label: "Adoption", value: 62 },
  ],
  suffix: "%",
  decimals: 1,
};

interface Bar {
  index: number;
  length: number;
  visible: number;
  background: string;
}

const bars = (html: string): Bar[] =>
  [...html.matchAll(/<div data-bar="(\d+)"([^>]*)>/g)].map(([, index, attrs]) => {
    const style = /style="([^"]*)"/.exec(attrs!)![1]!;
    const num = (key: string) => Number(new RegExp(`(?:^|;)${key}:(-?[\\d.]+)(?:px)?(?:;|$)`).exec(style)?.[1] ?? NaN);
    const orientation = /data-bar-axis="(\w+)"/.exec(attrs!)![1];
    return {
      index: Number(index),
      length: Number(/data-bar-length="([\d.]+)"/.exec(attrs!)![1]),
      visible: orientation === "y" ? num("height") : num("width"),
      background: /background:([^;]+)/.exec(style)![1]!,
    };
  });

const plotLength = (html: string) => Number(/data-bar-plot="([\d.]+)"/.exec(html)![1]);
const values = (html: string) => [...html.matchAll(/data-bar-value="(\d+)"[^>]*>([^<]*)</g)].map(([, , text]) => text);
const orientation = (html: string) => /data-bar-orientation="(\w+)"/.exec(html)![1];

describe("BarChart", () => {
  it("draws the same frame identically twice", () => {
    for (const frame of [0, 8, 20, 35, HOLD]) expect(draw(REVENUE, frame)).toBe(draw(REVENUE, frame));
  });

  it.each(ASPECTS)("shows every formatted value exactly on the hold (%s)", (aspect) => {
    expect(values(draw(REVENUE, HOLD, aspect))).toEqual(["$480", "$720", "$1,250", "$960", "$610"]);
    expect(values(draw(PROGRESS, HOLD, aspect))).toEqual(["37.5%", "99.9%", "62.0%"]);
  });

  it("counts the values up with the bars", () => {
    const early = values(draw(REVENUE, 10));
    expect(early).not.toEqual(values(draw(REVENUE, HOLD)));
    expect(early[0]).toMatch(/^\$[\d,]+$/);
  });

  it.each(ASPECTS)("makes bar lengths proportional to value/max on the hold (%s)", (aspect) => {
    for (const props of [REVENUE, { ...REVENUE, orientation: "vertical" as const }, { ...REVENUE, orientation: "horizontal" as const }, PROGRESS]) {
      const html = draw(props, HOLD, aspect);
      const plot = plotLength(html);
      const max = props.variant === "progress" ? 100 : 2000;
      for (const bar of bars(html)) {
        expect(bar.visible).toBeCloseTo(bar.length, 1);
        expect(Math.abs(bar.length / plot - props.data[bar.index]!.value / max)).toBeLessThan(0.005);
      }
    }
  });

  it("grows the bars from the baseline in reading order", () => {
    const early = bars(draw(REVENUE, 8));
    expect(early[0]!.visible).toBeGreaterThan(early[4]!.visible);
    expect(early[0]!.visible).toBeLessThan(early[0]!.length);
    expect(bars(draw(REVENUE, 0)).every((b) => b.visible === 0)).toBe(true);
  });

  it("puts only the emphasized bar in the accent", () => {
    const accent = lightTheme.colors.accent;
    for (const props of [REVENUE, PROGRESS]) {
      const hold = bars(draw(props, HOLD));
      expect(hold.filter((b) => b.background === accent).map((b) => b.index)).toEqual([props.data.findIndex((d) => d.emphasis)]);
      expect(new Set(hold.filter((b) => b.background !== accent).map((b) => b.background)).size).toBe(1);
    }
    // Without a marked item the largest value takes the accent.
    const unmarked = bars(draw({ data: [{ label: "A", value: 1 }, { label: "B", value: 3 }] }, HOLD));
    expect(unmarked.filter((b) => b.background === accent).map((b) => b.index)).toEqual([1]);
  });

  it("pops the emphasized value once as it lands", () => {
    const scaleOf = (html: string) => /data-bar-value="2"[^>]*?scale\(([\d.]+)\)/.exec(html)?.[1];
    const scales = Array.from({ length: 60 }, (_, f) => scaleOf(draw(REVENUE, f))).filter(Boolean);
    expect(scales.length).toBeGreaterThan(0);
    expect(scaleOf(draw(REVENUE, HOLD))).toBeUndefined();
    for (const i of [0, 1, 3, 4]) {
      const other = new RegExp(`data-bar-value="${i}"[^>]*?scale\\(`);
      expect(Array.from({ length: 60 }, (_, f) => other.test(draw(REVENUE, f))).some(Boolean)).toBe(false);
    }
  });

  it("is vertical in 16:9 and horizontal in 9:16 by default, and honors `orientation`", () => {
    expect(orientation(draw(REVENUE, HOLD, "16:9"))).toBe("vertical");
    expect(orientation(draw(REVENUE, HOLD, "9:16"))).toBe("horizontal");
    expect(orientation(draw({ ...REVENUE, orientation: "vertical" }, HOLD, "9:16"))).toBe("vertical");
    expect(orientation(draw({ ...REVENUE, orientation: "horizontal" }, HOLD, "16:9"))).toBe("horizontal");
  });

  it("defaults max to the nice max of the largest value, 100 for progress, and honors `max`", () => {
    expect(barChartLayout(lightTheme, "16:9", REVENUE).max).toBe(2000);
    expect(barChartLayout(lightTheme, "16:9", PROGRESS).max).toBe(100);
    expect(barChartLayout(lightTheme, "16:9", { ...REVENUE, max: 1500 }).max).toBe(1500);
    const html = draw({ ...PROGRESS, max: 200 }, HOLD);
    const [first] = bars(html);
    expect(first!.length / plotLength(html)).toBeCloseTo(37.5 / 200, 2);
  });

  it("stays inside its slot in both aspects", () => {
    for (const aspect of ASPECTS) {
      for (const props of [REVENUE, PROGRESS, { ...REVENUE, orientation: "vertical" as const }]) {
        const slot = { x: 100, y: 300, width: 800, height: 600 };
        const { box } = barChartLayout(lightTheme, aspect, props, slot);
        expect(box.x).toBeGreaterThanOrEqual(slot.x);
        expect(box.y).toBeGreaterThanOrEqual(slot.y);
        expect(box.x + box.width).toBeLessThanOrEqual(slot.x + slot.width + 0.5);
        expect(box.y + box.height).toBeLessThanOrEqual(slot.y + slot.height + 0.5);
      }
    }
  });

  it("throws naming the problem with bad data", () => {
    expect(() => draw({ data: [] }, 0)).toThrow(/BarChart: .*1-12 items/);
    expect(() => draw({ data: [{ label: "A", value: -1 }] }, 0)).toThrow(/data\[0\]\.value/);
    expect(() => draw({ data: [{ label: "", value: 1 }] }, 0)).toThrow(/data\[0\]\.label/);
    expect(barChartErrors({ data: [{ label: "A", value: 1 }], variant: "pie" })).not.toEqual([]);
    expect(barChartErrors({ data: [{ label: "A", value: 1 }], orientation: "diagonal" })).not.toEqual([]);
    expect(barChartErrors({ data: [{ label: "A", value: 1 }], max: 0 })).not.toEqual([]);
    expect(barChartErrors({ data: [{ label: "A", value: 1 }] })).toEqual([]);
  });
});
