// DonutChart: a ring of arcs that sweeps clockwise from 12 o'clock, segment
// by segment, the emphasized one in the accent and lifted out a little, the
// center number counting up and a legend cascading in beside (16:9) or below
// (9:16) the ring.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DonutChart, SceneClockContext, donutChartErrors, donutChartLayout, lightTheme, type Aspect, type DonutChartProps } from "../src/index";

const FPS = 30;
const FRAMES = 150;
/** Well after the entrance (about 1.9 s), before the exit. */
const HOLD = 100;

type Props = Omit<DonutChartProps, "progress" | "theme" | "aspect">;

function draw(props: Props, frame: number, aspect: Aspect = "9:16", frames = FRAMES): string {
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames }}>
      <DonutChart {...props} progress={frame / (frames - 1)} theme={lightTheme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
}

const SHARE: Props = {
  title: "Market share",
  data: [
    { label: "Acme", value: 42, emphasis: true },
    { label: "Globex", value: 27 },
    { label: "Initech", value: 19 },
    { label: "Other", value: 12 },
  ],
  suffix: "%",
};

interface Arc {
  index: number;
  stroke: string;
  r: number;
  length: number;
  visible: number;
  transform: string;
}

const arcs = (html: string): Arc[] =>
  [...html.matchAll(/<circle data-donut-arc="(\d+)"([^>]*)>/g)].map(([, index, attrs]) => {
    const attr = (name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs!)?.[1] ?? "";
    return {
      index: Number(index),
      stroke: attr("stroke"),
      r: Number(attr("r")),
      length: Number(attr("data-donut-length")),
      visible: Number(attr("stroke-dasharray").split(" ")[0]),
      transform: attr("transform"),
    };
  });

/** A positioned part's box from its inline style. */
function box(html: string, part: string) {
  const style = new RegExp(`data-donut-${part}=""[^>]*?style="([^"]*)"`).exec(html)![1]!;
  const num = (key: string) => Number(new RegExp(`(?:^|;)${key}:(-?[\\d.]+)(?:px)?(?:;|$)`).exec(style)![1]);
  return { x: num("left"), y: num("top"), width: num("width"), height: num("height") };
}

const centerText = (html: string, part: "value" | "label") => new RegExp(`data-donut-${part}=""[^>]*>([^<]*)<`).exec(html)?.[1];

describe("DonutChart", () => {
  it("draws the same frame identically twice", () => {
    for (const frame of [0, 10, 25, 40, HOLD]) expect(draw(SHARE, frame)).toBe(draw(SHARE, frame));
  });

  it.each(["9:16", "16:9"] as const)("on the hold, arcs are proportional to value/total and fill the ring minus the gaps (%s)", (aspect) => {
    const drawn = arcs(draw(SHARE, HOLD, aspect));
    expect(drawn.map((a) => a.index)).toEqual([0, 1, 2, 3]);
    const total = SHARE.data.reduce((sum, d) => sum + d.value, 0);
    const sum = drawn.reduce((s, a) => s + a.length, 0);
    for (const arc of drawn) {
      expect(arc.visible).toBeCloseTo(arc.length, 1);
      expect(Math.abs(arc.length / sum - SHARE.data[arc.index]!.value / total)).toBeLessThan(0.005);
    }
    const circumference = 2 * Math.PI * drawn[0]!.r;
    const gaps = circumference - sum;
    expect(gaps).toBeGreaterThan(0);
    // A small gap between each pair of segments: one per segment, a sliver of the ring.
    expect(gaps / drawn.length).toBeLessThan(circumference * 0.02);
  });

  it("sweeps clockwise from 12 o'clock, segment by segment", () => {
    const early = arcs(draw(SHARE, 15));
    expect(early[0]!.visible).toBeGreaterThan(0);
    expect(early[0]!.visible).toBeLessThan(early[0]!.length);
    expect(early.slice(1).every((a) => a.visible === 0)).toBe(true);
    const later = arcs(draw(SHARE, 30));
    expect(later[0]!.visible).toBeCloseTo(later[0]!.length, 1);
    expect(later[1]!.visible).toBeGreaterThan(0);
    // Each segment starts at 12 o'clock (-90 degrees) and turns clockwise to its place.
    expect(early[0]!.transform).toMatch(/rotate\(-90/);
  });

  it("puts only the emphasized segment in the accent and lifts it out", () => {
    const hold = arcs(draw(SHARE, HOLD));
    const accent = lightTheme.colors.accent;
    expect(hold.filter((a) => a.stroke === accent).map((a) => a.index)).toEqual([0]);
    expect(new Set(hold.map((a) => a.stroke)).size).toBe(4);
    expect(hold[0]!.transform).toMatch(/translate\(/);
    expect(hold.slice(1).every((a) => !/translate\(/.test(a.transform))).toBe(true);
    // Without a marked item the largest value takes the accent.
    const unmarked = arcs(draw({ data: [{ label: "A", value: 1 }, { label: "B", value: 3 }] }, HOLD));
    expect(unmarked.filter((a) => a.stroke === accent).map((a) => a.index)).toEqual([1]);
  });

  it("shows the emphasized share as a whole percent in the center by default, counting up to it", () => {
    const data = [
      { label: "Acme", value: 3 },
      { label: "Globex", value: 5, emphasis: true },
      { label: "Other", value: 4 },
    ];
    const hold = draw({ data }, HOLD);
    expect(centerText(hold, "value")).toBe("42%");
    expect(centerText(hold, "label")).toBe("Globex");
    expect(centerText(draw({ data }, 20), "value")).not.toBe("42%");
  });

  it("shows a custom center on the hold", () => {
    const html = draw({ ...SHARE, center: { value: "$4.2B", label: "total market" } }, HOLD);
    expect(centerText(html, "value")).toBe("$4.2B");
    expect(centerText(html, "label")).toBe("total market");
  });

  it("formats legend values with prefix, suffix and decimals", () => {
    const html = draw({ data: [{ label: "A", value: 1250.5 }, { label: "B", value: 300 }], prefix: "$", decimals: 1 }, HOLD);
    expect(html).toContain("$1,250.5");
    expect(html).toContain("$300.0");
  });

  it("puts the legend beside the ring in 16:9 and below it in 9:16", () => {
    const wide = draw(SHARE, HOLD, "16:9");
    const ringW = box(wide, "ring");
    const legendW = box(wide, "legend");
    expect(legendW.x).toBeGreaterThanOrEqual(ringW.x + ringW.width);
    const tall = draw(SHARE, HOLD, "9:16");
    const ringT = box(tall, "ring");
    const legendT = box(tall, "legend");
    expect(legendT.y).toBeGreaterThanOrEqual(ringT.y + ringT.height);
    for (const aspect of ["9:16", "16:9"] as const) {
      const layout = donutChartLayout(lightTheme, aspect, SHARE);
      expect(layout.arrangement).toBe(aspect === "16:9" ? "beside" : "below");
    }
  });

  it("cascades the legend rows in", () => {
    const rowOpacity = (html: string, i: number) => Number(new RegExp(`data-donut-row="${i}"[^>]*?opacity:([\\d.]+)`).exec(html)?.[1] ?? 1);
    const mid = draw(SHARE, 20);
    expect(rowOpacity(mid, 0)).toBeGreaterThan(rowOpacity(mid, 3));
    expect(rowOpacity(draw(SHARE, HOLD), 3)).toBe(1);
  });

  it("rejects 9 items, an empty total and a bad center", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ label: `l${i}`, value: i + 1 }));
    expect(() => draw({ data: nine }, 0)).toThrow(/8/);
    expect(donutChartErrors({ data: [{ label: "A", value: 0 }] })).not.toEqual([]);
    expect(donutChartErrors({ data: [{ label: "A", value: 1 }], center: { value: 3 } })).not.toEqual([]);
    expect(donutChartErrors({ data: [{ label: "A", value: 1 }], center: { value: "1" } })).toEqual([]);
    expect(donutChartErrors({ data: [] })).not.toEqual([]);
  });
});
