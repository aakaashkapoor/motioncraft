// LineChart: a line that draws left to right over its points, the area under
// it following the front, each point popping as the line reaches it, and the
// emphasized point in the accent with a value callout.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LineChart, SceneClockContext, lightTheme, lineChartErrors, lineChartLayout, lineChartPoints, lineChartValues, type Aspect, type LineChartProps } from "../src/index";

const FPS = 30;
const FRAMES = 150;
/** Well after the entrance (about 2 s), before the exit. */
const HOLD = 100;

type Props = Omit<LineChartProps, "progress" | "theme" | "aspect">;

function draw(props: Props, frame: number, aspect: Aspect = "9:16", frames = FRAMES): string {
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames }}>
      <LineChart {...props} progress={frame / (frames - 1)} theme={lightTheme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
}

const MONTHS: Props = {
  title: "Monthly signups",
  data: [
    { label: "Jan", value: 120 },
    { label: "Feb", value: 180 },
    { label: "Mar", value: 150 },
    { label: "Apr", value: 310, emphasis: true },
    { label: "May", value: 260 },
    { label: "Jun", value: 340 },
  ],
};

const attrOf = (attrs: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1] ?? "";

interface Point {
  index: number;
  cx: number;
  cy: number;
  fill: string;
  transform: string;
}

const points = (html: string): Point[] =>
  [...html.matchAll(/<circle data-line-point="(\d+)"([^>]*)>/g)].map(([, index, attrs]) => ({
    index: Number(index),
    cx: Number(attrOf(attrs!, "cx")),
    cy: Number(attrOf(attrs!, "cy")),
    fill: attrOf(attrs!, "fill"),
    transform: attrOf(attrs!, "transform"),
  }));

function line(html: string) {
  const attrs = /<path data-line-stroke=""([^>]*)>/.exec(html)![1]!;
  return {
    length: Number(attrOf(attrs, "data-line-length")),
    dasharray: Number(attrOf(attrs, "stroke-dasharray")),
    dashoffset: Number(attrOf(attrs, "stroke-dashoffset")),
  };
}

const callout = (html: string) => /data-line-callout-value=""[^>]*>([^<]*)</.exec(html)?.[1];
const scaleOf = (transform: string) => Number(/scale\(([-\d.]+)\)/.exec(transform)?.[1] ?? 1);

describe("LineChart", () => {
  it("draws the same frame identically twice", () => {
    for (const frame of [0, 10, 25, 40, HOLD]) expect(draw(MONTHS, frame)).toBe(draw(MONTHS, frame));
  });

  it.each(["9:16", "16:9"] as const)("places points evenly in x and in proportion to value/max in y (%s)", (aspect) => {
    const drawn = points(draw(MONTHS, HOLD, aspect));
    expect(drawn.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5]);
    const layout = lineChartLayout(lightTheme, aspect, MONTHS);
    const base = layout.plot.y + layout.plot.height;
    const steps = drawn.slice(1).map((p, i) => p.cx - drawn[i]!.cx);
    for (const step of steps) expect(step).toBeCloseTo(steps[0]!, 1);
    expect(layout.max).toBe(500);
    MONTHS.data.forEach((d, i) => {
      expect((base - drawn[i]!.cy) / layout.plot.height).toBeCloseTo(d.value / layout.max, 2);
    });
    // An explicit max sets the scale.
    const scaled = lineChartLayout(lightTheme, aspect, { ...MONTHS, max: 400 });
    expect(scaled.max).toBe(400);
  });

  it("hides most of the line early in the draw and shows all of it on the hold", () => {
    const early = line(draw(MONTHS, 8));
    expect(early.length).toBeGreaterThan(0);
    expect(early.dasharray).toBeCloseTo(early.length, 1);
    expect(early.dashoffset).toBeGreaterThan(early.length * 0.6);
    const hold = line(draw(MONTHS, HOLD));
    expect(hold.dashoffset).toBe(0);
  });

  it("pops each point as the line reaches it", () => {
    const mid = points(draw(MONTHS, 20));
    expect(scaleOf(mid[0]!.transform)).toBeGreaterThan(0);
    expect(scaleOf(mid[5]!.transform)).toBe(0);
    expect(points(draw(MONTHS, HOLD)).every((p) => scaleOf(p.transform) === 1)).toBe(true);
  });

  it("cuts the area at the line's front, and draws none with areaFill: false", () => {
    const areaPath = (html: string) => /<path data-line-area=""[^>]*\sd="([^"]*)"/.exec(html)?.[1];
    const xs = (d: string) => [...d.matchAll(/[ML]\s*([-\d.]+)/g)].map((m) => Number(m[1]));
    const mid = Math.max(...xs(areaPath(draw(MONTHS, 20))!));
    const hold = Math.max(...xs(areaPath(draw(MONTHS, HOLD))!));
    expect(mid).toBeLessThan(hold);
    expect(areaPath(draw({ ...MONTHS, areaFill: false }, HOLD))).toBeUndefined();
  });

  it("puts only the emphasized point in the accent", () => {
    const accent = lightTheme.colors.accent;
    const hold = points(draw(MONTHS, HOLD));
    expect(hold.filter((p) => p.fill === accent).map((p) => p.index)).toEqual([3]);
    expect(draw(MONTHS, HOLD).match(new RegExp(`stroke="${accent}"`, "g"))).toBeNull();
    // Without a marked item the largest value takes the accent.
    const unmarked = points(draw({ data: [{ label: "A", value: 1 }, { label: "B", value: 3 }, { label: "C", value: 2 }] }, HOLD));
    expect(unmarked.filter((p) => p.fill === accent).map((p) => p.index)).toEqual([1]);
  });

  it("shows the emphasized value, exactly formatted, in a callout after the line passes it", () => {
    const format = { prefix: "$", suffix: "K", decimals: 1 };
    const hold = draw({ ...MONTHS, ...format }, HOLD);
    expect(callout(hold)).toBe("$310.0K");
    // The last point shows its value too; the others show none.
    expect(hold).toContain("$340.0K");
    expect(hold).not.toContain("$120.0K");
    const calloutOpacity = (html: string) => Number(/data-line-callout=""[^>]*?opacity:([\d.]+)/.exec(html)?.[1] ?? 1);
    expect(calloutOpacity(draw(MONTHS, 10))).toBe(0);
    expect(calloutOpacity(draw(MONTHS, HOLD))).toBe(1);
  });

  it.each(["9:16", "16:9"] as const)("keeps the last value clear of a neighboring callout (%s)", (aspect) => {
    const data = MONTHS.data.map((d, i) => ({ label: d.label, value: [42.5, 38.2, 51.8, 47.1, 63.4, 58.9][i]!, emphasis: i === 4 }));
    const format = { prefix: "$", suffix: "K", decimals: 1 };
    const layout = lineChartLayout(lightTheme, aspect, { data, ...format });
    const { callout, lastValue } = lineChartValues(layout, lineChartPoints(layout, data), data, format);
    expect(callout.text).toBe("$63.4K");
    expect(lastValue?.text).toBe("$58.9K");
    const a = callout;
    const b = lastValue!;
    expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height).toBe(false);
  });

  it("labels every category along the x axis", () => {
    const hold = draw(MONTHS, HOLD, "16:9");
    for (const d of MONTHS.data) expect(hold).toContain(`>${d.label}<`);
  });

  it("rejects fewer than 2 points and a max below the data", () => {
    expect(() => draw({ data: [{ label: "A", value: 1 }] }, 0)).toThrow(/2/);
    expect(lineChartErrors({ data: [{ label: "A", value: 1 }] })).not.toEqual([]);
    expect(lineChartErrors({ data: [{ label: "A", value: 1 }, { label: "B", value: 5 }], max: 4 })).not.toEqual([]);
    expect(lineChartErrors({ data: [{ label: "A", value: 1 }, { label: "B", value: 5 }], areaFill: "yes" })).not.toEqual([]);
    expect(lineChartErrors({ data: [{ label: "A", value: 1 }, { label: "B", value: 5 }] })).toEqual([]);
  });
});
