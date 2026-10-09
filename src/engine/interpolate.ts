// Keyframe interpolation: numbers across several keyframes, with an easing per
// segment and a choice of what happens outside the keyframes. Also colors.
// Imports only the Easing type so easing.ts can re-export this without a cycle.

import type { Easing } from "./easing";

/** What to do with input outside the keyframes. */
export type Extrapolate = "clamp" | "extend" | "identity";

export interface InterpolateOptions {
  /** One easing for every segment, or one per segment. Default linear. */
  easing?: Easing | readonly Easing[];
  /** v1 switch: true clamps both sides, false extends both. Default true. */
  clamp?: boolean;
  /** Below the first keyframe. Overrides `clamp`. */
  extrapolateLeft?: Extrapolate;
  /** Past the last keyframe. Overrides `clamp`. */
  extrapolateRight?: Extrapolate;
}

const identityEase: Easing = (t) => t;

function segmentEasing(easing: InterpolateOptions["easing"], segments: number): (i: number) => Easing {
  if (easing === undefined) return () => identityEase;
  if (typeof easing === "function") return () => easing;
  if (easing.length !== segments) {
    throw new Error(`interpolate: easing array has ${easing.length} entries but there are ${segments} segments`);
  }
  return (i) => easing[i]!;
}

/**
 * Maps `value` through keyframes: `input[i]` maps to `output[i]`, and values in
 * between are eased within their segment. `input` must be strictly increasing
 * or strictly decreasing. Clamps outside the keyframes by default.
 */
export function interpolate(
  value: number,
  input: readonly number[],
  output: readonly number[],
  { easing, clamp = true, extrapolateLeft, extrapolateRight }: InterpolateOptions = {},
): number {
  if (!Number.isFinite(value)) {
    throw new Error(`interpolate: value must be finite, got ${value}`);
  }
  if (input.length < 2) throw new Error("interpolate: need at least two keyframes");
  if (input.length !== output.length) {
    throw new Error(`interpolate: input (${input.length}) and output (${output.length}) must be the same length`);
  }
  if (input[0] === input[1]) {
    throw new Error(`interpolate: input range [${input[0]}, ${input[1]}] is empty`);
  }
  const dir = Math.sign(input[1]! - input[0]!);
  for (let i = 1; i < input.length; i++) {
    if (!(Math.sign(input[i]! - input[i - 1]!) === dir)) {
      throw new Error(`interpolate: input [${input.join(", ")}] must be strictly monotonic`);
    }
  }
  const ease = segmentEasing(easing, input.length - 1);
  const fallback: Extrapolate = clamp ? "clamp" : "extend";
  const left = extrapolateLeft ?? fallback;
  const right = extrapolateRight ?? fallback;

  // Pick the segment containing value (or the end segment outside the keys).
  const last = input.length - 2;
  let i = 0;
  while (i < last && dir * (value - input[i + 1]!) > 0) i++;

  let t = (value - input[i]!) / (input[i + 1]! - input[i]!);
  if (i === 0 && t < 0) {
    if (left === "identity") return value;
    if (left === "clamp") t = 0;
  }
  if (i === last && t > 1) {
    if (right === "identity") return value;
    if (right === "clamp") t = 1;
  }
  const from = output[i]!;
  const to = output[i + 1]!;
  return from + (to - from) * ease(i)(t);
}

/** Non-premultiplied RGBA: channels 0..255, alpha 0..1. */
type Rgba = [number, number, number, number];

function parseColor(color: string): Rgba {
  const text = color.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (hex) {
    let digits = hex[1]!;
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join("");
    const bytes = digits.match(/../g)!.map((pair) => parseInt(pair, 16));
    return [bytes[0]!, bytes[1]!, bytes[2]!, bytes.length === 4 ? bytes[3]! / 255 : 1];
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(text);
  if (fn) {
    const [r, g, b] = [fn[1], fn[2], fn[3]].map(Number) as [number, number, number];
    const a = fn[4] === undefined ? 1 : Number(fn[4]);
    if ([r, g, b].every((c) => c <= 255) && a <= 1) return [r, g, b, a];
  }
  throw new Error(`interpolateColors: cannot parse color "${color}" (use #hex, rgb() or rgba())`);
}

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const toSrgb = (l: number) => {
  const s = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
};

/**
 * Like `interpolate`, but the outputs are colors (#hex, rgb() or rgba()). The
 * RGB channels are mixed in linear light, so midpoints do not go muddy; alpha
 * mixes linearly. Returns `rgb(...)`, or `rgba(...)` when not fully opaque.
 */
export function interpolateColors(
  value: number,
  input: readonly number[],
  colors: readonly string[],
  options: Omit<InterpolateOptions, "extrapolateLeft" | "extrapolateRight"> & {
    extrapolateLeft?: Exclude<Extrapolate, "identity">;
    extrapolateRight?: Exclude<Extrapolate, "identity">;
  } = {},
): string {
  const parsed = colors.map(parseColor);
  const channel = (c: number, map: (v: number) => number) =>
    interpolate(value, input, parsed.map((rgba) => map(rgba[c]!)), options);
  const [r, g, b] = [0, 1, 2].map((c) => toSrgb(channel(c, toLinear)));
  const a = Math.round(Math.min(1, Math.max(0, channel(3, (v) => v))) * 1000) / 1000;
  return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
}
