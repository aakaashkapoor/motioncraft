// Cubic bezier easing, as in CSS `cubic-bezier(x1, y1, x2, y2)`.

import type { Easing } from "./easing";

const EPSILON = 1e-7;

/**
 * An easing through the control points (0,0), (x1,y1), (x2,y2), (1,1). For a
 * given t, solves x(s) = t for the curve parameter s (Newton, then bisection
 * as a fallback) and returns y(s). The y values may leave 0..1 to overshoot.
 */
export function bezier(x1: number, y1: number, x2: number, y2: number): Easing {
  for (const [name, value] of [["x1", x1], ["y1", y1], ["x2", x2], ["y2", y2]] as const) {
    if (!Number.isFinite(value)) throw new Error(`bezier: ${name} must be finite, got ${value}`);
  }
  if (x1 < 0 || x1 > 1) throw new Error(`bezier: x1 must be in 0..1, got ${x1}`);
  if (x2 < 0 || x2 > 1) throw new Error(`bezier: x2 must be in 0..1, got ${x2}`);

  // Polynomial coefficients: B(s) = ((a s + b) s + c) s.
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const curveX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const curveY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  const solve = (t: number) => {
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = curveX(s) - t;
      if (Math.abs(err) < EPSILON) return s;
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= err / slope;
    }
    // x(s) is monotonic on 0..1 because x1, x2 are in 0..1, so bisection works.
    let lo = 0;
    let hi = 1;
    s = t;
    while (hi - lo > EPSILON) {
      if (curveX(s) < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  };

  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return curveY(solve(t));
  };
}
