import { describe, expect, it } from "vitest";
import { chartErrors, emphasisIndex, formatChartValue, gridShares, niceMax } from "../src/kit/chart";

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
  it("rounds up to 1, 1.2, 1.5, 1.6, 2, 2.5, 3, 3.5, 4, 5, 6, 6.5, 8 or 10 x 10^n", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(0.7)).toBe(0.8);
    expect(niceMax(87)).toBe(100);
    expect(niceMax(230)).toBe(250);
    expect(niceMax(1200)).toBe(1200);
    expect(niceMax(1250)).toBe(1500);
    expect(niceMax(100)).toBe(100);
    expect(niceMax(0.2)).toBe(0.2);
    expect(niceMax(31)).toBe(35);
    expect(niceMax(36)).toBe(40);
    expect(niceMax(5100)).toBe(6000);
    expect(niceMax(61)).toBe(65);
    // The steps the issue's ladder lacked: without them these would land at 75% of the track.
    expect(niceMax(1.51)).toBe(1.6);
    expect(niceMax(3.01)).toBe(3.5);
    expect(niceMax(6.01)).toBe(6.5);
  });

  it("puts the largest value at 80% of the track or more", () => {
    for (let exponent = -3; exponent <= 6; exponent++) {
      for (let k = 1; k < 1000; k++) {
        const max = (k / 100) * 10 ** exponent;
        const nice = niceMax(max);
        expect(nice, `niceMax(${max})`).toBeGreaterThanOrEqual(max);
        expect(max / nice, `niceMax(${max})`).toBeGreaterThanOrEqual(0.8);
      }
    }
  });
});

describe("gridShares", () => {
  it("splits the max into 4 or 5 round steps", () => {
    expect(gridShares(1500)).toEqual([0.2, 0.4, 0.6, 0.8, 1]); // 300s
    expect(gridShares(1200)).toEqual([0.25, 0.5, 0.75, 1]); // 300s
    expect(gridShares(100)).toEqual([0.2, 0.4, 0.6, 0.8, 1]); // 20s
    expect(gridShares(250)).toEqual([0.2, 0.4, 0.6, 0.8, 1]); // 50s
    expect(gridShares(2000)).toEqual([0.25, 0.5, 0.75, 1]); // 500s
    expect(gridShares(800)).toEqual([0.25, 0.5, 0.75, 1]); // 200s
    expect(gridShares(0.8)).toEqual([0.25, 0.5, 0.75, 1]); // 0.2s
    expect(gridShares(1600)).toEqual([0.25, 0.5, 0.75, 1]); // 400s
    expect(gridShares(3500)).toEqual([0.2, 0.4, 0.6, 0.8, 1]); // 700s
  });

  it("gives 4 or 5 evenly spaced lines ending at the max for every ladder value", () => {
    for (const step of [1, 1.2, 1.5, 1.6, 2, 2.5, 3, 3.5, 4, 5, 6, 6.5, 8, 10]) {
      const shares = gridShares(step * 1000);
      expect([4, 5]).toContain(shares.length);
      expect(shares.at(-1)).toBe(1);
      shares.forEach((s, i) => expect(s).toBeCloseTo((i + 1) / shares.length, 10));
    }
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
