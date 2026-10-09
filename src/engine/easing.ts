// Easing curves. Every easing maps 0 -> 0 and 1 -> 1.
// Interpolation is re-exported from interpolate.ts.

import { bezier } from "./bezier";

/** Maps progress in 0..1 to eased progress. May overshoot in between. */
export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;

export const easeInOutCubic: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Ease out with a small overshoot past the target before settling. */
export const easeOutBack: Easing = (t) => {
  // 1 + (c + 1)u^3 + c u^2 with u = t - 1, arranged so both ends are exact.
  const c = 1.70158;
  const u = t - 1;
  return 1 + u * u * (c * (u + 1) + u);
};

export interface SpringOptions {
  /** How fast the bounce dies away. Higher settles sooner. Default 6. */
  damping?: number;
  /** Number of oscillations across the curve. Default 1.5. */
  frequency?: number;
}

/**
 * A spring-like ease: a damped oscillation around the target. The envelope is
 * scaled by (1 - t) so it lands exactly on 1 at t = 1.
 */
export function spring({ damping = 6, frequency = 1.5 }: SpringOptions = {}): Easing {
  if (!Number.isFinite(damping) || damping < 0) {
    throw new Error(`spring: damping must be a finite number >= 0, got ${damping}`);
  }
  if (!Number.isFinite(frequency) || frequency <= 0) {
    throw new Error(`spring: frequency must be a finite number > 0, got ${frequency}`);
  }
  const w = 2 * Math.PI * frequency;
  return (t) => (t === 1 ? 1 : 1 - Math.exp(-damping * t) * Math.cos(w * t) * (1 - t));
}

export const easeSpring: Easing = spring();

/** Exponential ease out, `1 - 2^(-10t)`: fast start, long soft landing. */
export const expoOut: Easing = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** Exponential ease in, the mirror of `expoOut`. */
export const expoIn: Easing = (t) => (t <= 0 ? 0 : 2 ** (-10 * (1 - t)));

/** Easing curves by name, plus `Easing.bezier(x1, y1, x2, y2)`. */
export const Easing = { linear, easeInOutCubic, easeOutBack, easeSpring, expoOut, expoIn, bezier } as const;

// Interpolation lives in interpolate.ts; re-exported here for v1 imports.
export { interpolate, type InterpolateOptions } from "./interpolate";
