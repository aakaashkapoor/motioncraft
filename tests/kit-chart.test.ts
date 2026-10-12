import { describe, expect, it } from "vitest";
import { chartErrors, emphasisIndex, formatChartValue, niceMax } from "../src/kit/chart";

const good = [
  { label: "A", value: 3 },
  { label: "B", value: 9, emphasis: true },
];

describe("formatChartValue", () => {
  it("adds prefix, separators and suffix", () => {
    expect(formatChartValue(1250, { prefix: "$" })).toBe("$1,250");
    expect(formatChartValue(37.5, { suffix: "%", decimals: 1 })).toBe("37.5%");
    expect(formatChartValue(2, { decimals: 2 })).toBe("2.00");
  });
});

describe("niceMax", () => {
  it("rounds up to 1, 2, 2.5 or 5 x 10^n", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(0.7)).toBe(1);
    expect(niceMax(87)).toBe(100);
    expect(niceMax(230)).toBe(250);
    expect(niceMax(1200)).toBe(2000);
    expect(niceMax(100)).toBe(100);
    expect(niceMax(0.2)).toBe(0.2);
  });
});

describe("chartErrors", () => {
  it("accepts good data", () => {
    expect(chartErrors(good)).toEqual([]);
  });
  it("reports bad data", () => {
    expect(chartErrors([])).not.toEqual([]);
    expect(chartErrors(Array.from({ length: 13 }, (_, i) => ({ label: `l${i}`, value: i })))).not.toEqual([]);
    expect(chartErrors([{ value: 1 }])).not.toEqual([]);
    expect(chartErrors([{ label: "", value: 1 }])).not.toEqual([]);
    expect(chartErrors([{ label: "a", value: -1 }])).not.toEqual([]);
    expect(chartErrors([{ label: "a", value: Infinity }])).not.toEqual([]);
    expect(chartErrors("x")).not.toEqual([]);
    expect(
      chartErrors([
        { label: "a", value: 1, emphasis: true },
        { label: "b", value: 2, emphasis: true },
      ]),
    ).not.toEqual([]);
  });
});

describe("emphasisIndex", () => {
  it("prefers the marked item, else the largest", () => {
    expect(emphasisIndex([{ label: "a", value: 9 }, { label: "b", value: 1, emphasis: true }])).toBe(1);
    expect(emphasisIndex([{ label: "a", value: 1 }, { label: "b", value: 9 }, { label: "c", value: 4 }])).toBe(1);
  });
});
