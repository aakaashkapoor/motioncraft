// pathLength measures SVG path data in code (no DOM): lines exactly, curves
// and arcs by sampling, within 1% of their true length.

import { describe, expect, it } from "vitest";
import { pathLength } from "../src/index";
import { pathPointAt, shapePath } from "../src/kit/pathLength";

const near = (actual: number, expected: number) => expect(Math.abs(actual - expected) / expected).toBeLessThan(0.01);

describe("pathLength", () => {
  it("measures a line", () => {
    near(pathLength("M 0 0 L 3 4"), 5);
    near(pathLength("M0 0l3 4"), 5);
  });

  it("measures a closed square, the close included", () => {
    near(pathLength("M 2 2 H 12 V 12 H 2 Z"), 40);
    near(pathLength("m2 2h10v10h-10z"), 40);
    near(pathLength("M2 2 12 2 12 12 2 12Z"), 40);
  });

  it("measures a quarter-circle arc", () => {
    near(pathLength("M 10 0 A 10 10 0 0 1 0 10"), (Math.PI * 10) / 2);
    near(pathLength("M10 0a10 10 0 0 1-10 10"), (Math.PI * 10) / 2);
  });

  it("measures a cubic", () => {
    // The reference is a 10^6-step numerical integral of the curve's speed.
    near(pathLength("M 0 0 C 5 10 15 -5 20 10"), 25.30877);
    near(pathLength("M0 0c5 10 15-5 20 10"), 25.30877);
  });

  it("follows smooth and quadratic curves", () => {
    // A quadratic with its control on the chord is the chord.
    near(pathLength("M 0 0 Q 5 0 10 0 T 20 0"), 20);
    // S reflects the previous control point: two mirrored halves of one curve.
    near(pathLength("M 0 0 C 0 10 10 10 10 0 S 20 -10 20 0"), 2 * pathLength("M 0 0 C 0 10 10 10 10 0"));
  });

  it("reads compact numbers and arc flags", () => {
    near(pathLength("M10 0a10 10 0 0110-10"), pathLength("M10 0 a 10 10 0 0 1 10 -10"));
    near(pathLength("M.5.5L3.5 4.5"), 5);
  });

  it("measures a full icon circle drawn as two arcs", () => {
    near(pathLength(shapePath("circle", { cx: 12, cy: 12, r: 10 })), 2 * Math.PI * 10);
  });

  it("throws on path data it cannot read", () => {
    expect(() => pathLength("M 0 0 X 3 4")).toThrow();
    expect(() => pathLength("L 3 4")).toThrow();
  });

  it("finds the point a distance along the path", () => {
    const p = pathPointAt("M 0 0 H 10 V 10", 15);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(5);
  });
});
