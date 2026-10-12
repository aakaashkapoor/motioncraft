// Fill the frame (design v3, section C) for BeforeAfter and the charts: in
// 9:16 each one's primary visual spans the primary width, centered on the
// frame's center line, with labels from the ramp's 9:16 steps. 16:9 keeps the
// layouts the visual review found fine.

import { describe, expect, it } from "vitest";
import {
  AVG_CHAR_EM,
  barChartLayout,
  beforeAfterLayout,
  donutChartLayout,
  frameSize,
  lightTheme,
  lineChartLayout,
  lineChartPoints,
  lineChartValues,
  safeZones,
  textColumn,
  type BarChartProps,
  type DonutChartProps,
  type LineChartProps,
} from "../src/index";
// Not on the package's public surface: where the axis labels go.
import { lineChartLabels } from "../src/kit/LineChart";

const TALL = "9:16";
const PRIMARY = safeZones(TALL, lightTheme.safe).primaryWidth;
const MID = frameSize(TALL).width / 2;
const LABEL = lightTheme.type.label[TALL].size;
const COLUMN = textColumn(lightTheme, TALL);

/** Spans at least 85% of the primary width and is centered on the frame's center line (within 5% of the primary width). */
function expectFills(left: number, right: number) {
  expect(right - left).toBeGreaterThanOrEqual(0.85 * PRIMARY);
  expect(Math.abs((left + right) / 2 - MID)).toBeLessThanOrEqual(0.05 * PRIMARY);
}

const rounded = (rect: { x: number; y: number; width: number; height: number }) => ({
  x: Math.round(rect.x * 10) / 10,
  y: Math.round(rect.y * 10) / 10,
  width: Math.round(rect.width * 10) / 10,
  height: Math.round(rect.height * 10) / 10,
});

// The fixtures' data (tests/fixtures/bar-chart.json, line-chart.json, donut-chart.json).
type BarInput = Omit<BarChartProps, "progress" | "theme" | "aspect">;
const REVENUE: BarInput = {
  title: "Revenue by month, 2026",
  data: [
    { label: "Jan", value: 480 },
    { label: "Feb", value: 720 },
    { label: "Mar", value: 1250, emphasis: true },
    { label: "Apr", value: 960 },
    { label: "May", value: 610 },
  ],
  prefix: "$",
};
const READINESS: BarInput = {
  title: "Launch readiness",
  variant: "progress",
  data: [
    { label: "Tests", value: 37.5 },
    { label: "Docs", value: 82.5, emphasis: true },
    { label: "Rollout", value: 60 },
  ],
  suffix: "%",
  decimals: 1,
};
type LineInput = Omit<LineChartProps, "progress" | "theme" | "aspect">;
const SIGNUPS: LineInput = {
  title: "Monthly signups, 2026",
  data: [
    { label: "Jan", value: 1200 },
    { label: "Feb", value: 1850 },
    { label: "Mar", value: 1540 },
    { label: "Apr", value: 3120, emphasis: true },
    { label: "May", value: 2680 },
    { label: "Jun", value: 3460 },
  ],
};
const REVENUE_LINE: LineInput = {
  title: "Monthly revenue",
  data: [
    { label: "Jan", value: 42.5 },
    { label: "Feb", value: 38.2 },
    { label: "Mar", value: 51.8 },
    { label: "Apr", value: 47.1 },
    { label: "May", value: 63.4, emphasis: true },
    { label: "Jun", value: 58.9 },
  ],
  areaFill: false,
  prefix: "$",
  suffix: "K",
  decimals: 1,
};
type DonutInput = Omit<DonutChartProps, "progress" | "theme" | "aspect">;
const SHARE: DonutInput = {
  title: "Market share, 2026",
  data: [
    { label: "Acme", value: 42, emphasis: true },
    { label: "Globex", value: 27 },
    { label: "Initech", value: 19 },
    { label: "Other", value: 12 },
  ],
  suffix: "%",
};
const BUDGET: DonutInput = {
  title: "Where the budget goes",
  data: [
    { label: "Compute", value: 1840 },
    { label: "Storage", value: 620, emphasis: true },
    { label: "Network", value: 410 },
    { label: "Support", value: 230 },
    { label: "Other", value: 150 },
  ],
  center: { value: "$3.25M", label: "per year" },
  prefix: "$",
  suffix: "K",
};

describe("BeforeAfter in 9:16", () => {
  const layout = beforeAfterLayout(lightTheme, TALL, "vertical", 0.5);

  it("takes the primary width, centered", () => {
    expectFills(layout.card.x, layout.card.x + layout.card.width);
  });

  it("gives each nested component nearly the whole card width", () => {
    for (const half of [layout.halves.before, layout.halves.after]) {
      expect(half.width).toBeGreaterThanOrEqual(0.9 * PRIMARY);
      expect(Math.abs(half.x + half.width / 2 - MID)).toBeLessThanOrEqual(1);
    }
  });

  it("gives the nested components most of the card's height", () => {
    const { before, after } = layout.halves;
    expect(before.height + after.height).toBeGreaterThanOrEqual(0.62 * layout.card.height);
    // Clear of the divider's handle and of each other.
    expect(after.y + after.height).toBeLessThanOrEqual(layout.card.y + layout.card.height / 2 - layout.handle / 2);
    expect(before.y).toBeGreaterThanOrEqual(layout.card.y + layout.card.height / 2 + layout.handle / 2);
  });
});

describe("BarChart in 9:16", () => {
  it("spreads the bars, their labels and the longest value across the primary width, centered", () => {
    const layout = barChartLayout(lightTheme, TALL, REVENUE);
    const { spacing } = lightTheme;
    const left = layout.box.x + layout.plot.x - spacing.md - layout.labelColumn;
    const longest = Math.max(...layout.bars.map((b) => b.length));
    const right = layout.box.x + layout.plot.x + longest + spacing.sm + layout.valueColumn;
    expectFills(left, right);
    // Nothing reaches past the text column (the 9:16 button rail).
    expect(left).toBeGreaterThanOrEqual(COLUMN.x);
    expect(right).toBeLessThanOrEqual(COLUMN.x + COLUMN.width);
    expect(layout.box.x + layout.plot.x + layout.length).toBeLessThanOrEqual(COLUMN.x + COLUMN.width);
  });

  it("keeps bar lengths in proportion to value/max", () => {
    const layout = barChartLayout(lightTheme, TALL, REVENUE);
    REVENUE.data.forEach((d, i) => expect(layout.bars[i]!.length / layout.length).toBeCloseTo(d.value / layout.max, 2));
  });

  it("spreads progress tracks across the primary width, centered", () => {
    const layout = barChartLayout(lightTheme, TALL, READINESS);
    const left = layout.box.x + layout.plot.x - lightTheme.spacing.md - layout.labelColumn;
    const right = layout.box.x + layout.plot.x + layout.length + lightTheme.spacing.sm + layout.valueColumn;
    expectFills(left, right);
  });

  it("sets labels and values at least at the label step", () => {
    for (const input of [REVENUE, READINESS]) {
      const layout = barChartLayout(lightTheme, TALL, input);
      expect(layout.labelSpec.size).toBeGreaterThanOrEqual(LABEL);
      expect(layout.valueSpec.size).toBeGreaterThanOrEqual(LABEL);
    }
  });
});

describe("LineChart in 9:16", () => {
  it.each([SIGNUPS, REVENUE_LINE])("spans the primary width with its plot, centered (%#)", (input) => {
    const layout = lineChartLayout(lightTheme, TALL, input);
    expectFills(layout.box.x + layout.plot.x, layout.box.x + layout.plot.x + layout.plot.width);
  });

  it.each([SIGNUPS, REVENUE_LINE])("sets the axis labels at least at the label step, under their points and off the rail (%#)", (input) => {
    const layout = lineChartLayout(lightTheme, TALL, input);
    expect(layout.labelSpec.size).toBeGreaterThanOrEqual(LABEL);
    expect(layout.labelFitted).toBe(false);
    const points = lineChartPoints(layout, input.data);
    const labels = lineChartLabels(layout, points, input.data);
    labels.forEach((label, i) => {
      const left = layout.box.x + label.x;
      expect(left).toBeGreaterThanOrEqual(COLUMN.x);
      expect(left + label.width).toBeLessThanOrEqual(COLUMN.x + COLUMN.width);
      // Centered on its point, or a little inward at the ends.
      expect(Math.abs(label.x + label.width / 2 - points[i]!.x)).toBeLessThanOrEqual(0.15 * label.width + 0.5);
      // Wide enough for its text.
      expect(label.width).toBeGreaterThanOrEqual(input.data[i]!.label.length * AVG_CHAR_EM * layout.labelSpec.size);
    });
  });

  it.each([SIGNUPS, REVENUE_LINE])("keeps the values off the rail (%#)", (input) => {
    const layout = lineChartLayout(lightTheme, TALL, input);
    const format = { prefix: input.prefix, suffix: input.suffix, decimals: input.decimals };
    const { callout, lastValue } = lineChartValues(layout, lineChartPoints(layout, input.data), input.data, format);
    for (const box of [callout, lastValue]) {
      if (box === undefined) continue;
      expect(layout.box.x + box.x).toBeGreaterThanOrEqual(COLUMN.x);
      expect(layout.box.x + box.x + box.width).toBeLessThanOrEqual(COLUMN.x + COLUMN.width);
    }
  });
});

describe("LineChart axis labels in tall aspects", () => {
  // The outer labels shift inward (up to 15% of the widest label) to stay in
  // the text column; the fit test must leave room for that, or they touch
  // their neighbours.
  const cases = (["9:16", "4:5"] as const).flatMap((aspect) =>
    [2, 3, 4, 5, 6, 7, 8].flatMap((n) => [3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 18, 20].map((length) => ({ aspect, n, length }))),
  );
  it.each(cases)("keeps at least spacing.xs between neighbouring labels ($aspect, $n points, $length chars)", ({ aspect, n, length }) => {
    const data = Array.from({ length: n }, (_, i) => ({ label: "W".repeat(length), value: 10 + i }));
    const layout = lineChartLayout(lightTheme, aspect, { data });
    const labels = lineChartLabels(layout, lineChartPoints(layout, data), data);
    for (let i = 1; i < n; i++) {
      const gap = labels[i]!.x - (labels[i - 1]!.x + labels[i - 1]!.width);
      // Half a px either way for the estimate's rounding.
      expect(gap, `labels ${i - 1} and ${i}`).toBeGreaterThanOrEqual(lightTheme.spacing.xs - 0.5);
    }
  });
});

describe("DonutChart in 9:16", () => {
  it.each([SHARE, BUDGET])("spans the primary width with the ring and legend, centered (%#)", (input) => {
    const layout = donutChartLayout(lightTheme, TALL, input);
    const left = layout.box.x + Math.min(layout.ring.x, layout.legend.x);
    const right = layout.box.x + Math.max(layout.ring.x + layout.ring.width, layout.legend.x + layout.legend.width);
    expectFills(left, right);
    expect(Math.abs(layout.box.x + layout.ring.x + layout.ring.width / 2 - MID)).toBeLessThanOrEqual(1);
    expect(layout.legendSpec.size).toBeGreaterThanOrEqual(LABEL);
  });

  it("gives the ring the height a one-line title and the legend leave", () => {
    const layout = donutChartLayout(lightTheme, TALL, SHARE);
    const title = lightTheme.type.title[TALL];
    // "Market share, 2026" sets on one line in the column.
    expect(layout.title.height).toBeLessThan(2 * title.size * title.lineHeight);
    expect(layout.ring.width).toBeGreaterThanOrEqual(0.75 * PRIMARY);
    expect(layout.legendSpec.size).toBe(lightTheme.type.body[TALL].size);
  });
});

describe("DonutChart in a 9:16 Section slot narrower than the primary width", () => {
  it("keeps a margin either side of the ring instead of taking the slot's full width", () => {
    const slot = { x: 120, y: 300, width: 600, height: 1300 };
    expect(slot.width).toBeLessThan(PRIMARY);
    const layout = donutChartLayout(lightTheme, TALL, SHARE, slot);
    expect(layout.ring.width).toBeLessThanOrEqual(slot.width - 2 * lightTheme.spacing.md);
    expect(layout.ring.width).toBeGreaterThan(0.6 * slot.width);
    expect(layout.box.x + layout.ring.x).toBeGreaterThanOrEqual(slot.x + lightTheme.spacing.md);
    expect(layout.box.x + layout.ring.x + layout.ring.width).toBeLessThanOrEqual(slot.x + slot.width - lightTheme.spacing.md);
  });
});

describe("16:9 keeps its layouts", () => {
  const WIDE = "16:9";

  it("BeforeAfter", () => {
    const layout = beforeAfterLayout(lightTheme, WIDE, "horizontal", 0.5);
    expect(rounded(layout.card)).toEqual({ x: 96, y: 64, width: 1728, height: 735 });
    expect(rounded(layout.halves.after)).toEqual({ x: 146, y: 205, width: 766, height: 544 });
    expect(rounded(layout.halves.before)).toEqual({ x: 1008, y: 205, width: 766, height: 544 });
  });

  it("BarChart", () => {
    const bars = barChartLayout(lightTheme, WIDE, REVENUE);
    expect(rounded(bars.box)).toEqual({ x: 320, y: 64.6, width: 1280, height: 734.4 });
    expect(rounded(bars.plot)).toEqual({ x: 0, y: 308.4, width: 1280, height: 338 });
    expect(bars.max).toBe(2000);
    const tracks = barChartLayout(lightTheme, WIDE, READINESS);
    expect(rounded(tracks.plot)).toEqual({ x: 217, y: 228.4, width: 907, height: 288 });
  });

  it("LineChart", () => {
    const layout = lineChartLayout(lightTheme, WIDE, SIGNUPS);
    expect(rounded(layout.box)).toEqual({ x: 96, y: 64.6, width: 1728, height: 734.4 });
    expect(rounded(layout.plot)).toEqual({ x: 54, y: 317.4, width: 1620, height: 346 });
    expect(layout.labelSpec.size).toBe(lightTheme.type.label[WIDE].size);
  });

  it("DonutChart", () => {
    const layout = donutChartLayout(lightTheme, WIDE, SHARE);
    expect(rounded(layout.box)).toEqual({ x: 533.5, y: 142.6, width: 853, height: 656.4 });
    expect(rounded(layout.ring)).toEqual({ x: 0, y: 212.4, width: 444, height: 444 });
    expect(rounded(layout.legend)).toEqual({ x: 508, y: 294.4, width: 345, height: 280 });
  });
});
