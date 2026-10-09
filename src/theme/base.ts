// Tokens the built-in themes share: the type ramp, named weights, spacing,
// radii and motion. Each theme spreads these and sets its own colors and ground.

import type { ThemeMotion, ThemeRadius, ThemeSpacing, ThemeWeights, TypeRamp, TypeSpec } from "./types";

export const SYSTEM_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
export const SYSTEM_MONO =
  'ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

export const baseWeights: ThemeWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  heavy: 800,
};

const { medium, semibold, bold, heavy } = baseWeights;
/** Code reads best a touch heavier than regular on a video frame. */
const MONO_WEIGHT = 450;

const spec = (size: number, weight: number, tracking: number, lineHeight: number): TypeSpec => ({ size, weight, tracking, lineHeight });

/** One step in both aspects: the same weight, tracking and line height, a size for each. */
const step = (tall: number, wide: number, weight: number, tracking: number, lineHeight: number) => ({
  "9:16": spec(tall, weight, tracking, lineHeight),
  "16:9": spec(wide, weight, tracking, lineHeight),
});

/**
 * Design v3, table B: a modular scale (ratio 1.25, base 48 px on 9:16 and 44
 * px on 16:9). A 16:9 video is shown smaller on a phone, so its text is about
 * 0.92x of 9:16, never less. Tracking tightens and line height closes up as
 * size grows; the uppercase eyebrow is spaced out.
 */
export const baseTypeRamp: TypeRamp = {
  numeral: step(240, 220, bold, -0.04, 0.9),
  hero: step(152, 140, heavy, -0.035, 0.95),
  display: step(120, 112, heavy, -0.03, 1.0),
  headline: step(96, 88, bold, -0.025, 1.05),
  title: step(76, 72, bold, -0.02, 1.1),
  subtitle: step(60, 56, semibold, -0.01, 1.15),
  body: step(48, 44, medium, 0, 1.3),
  label: step(40, 36, medium, 0, 1.3),
  eyebrow: step(32, 28, semibold, 0.08, 1.2),
  mono: step(40, 36, MONO_WEIGHT, 0, 1.45),
};

/** Design v3, section C: an 8 px base. */
export const baseSpacing: ThemeSpacing = {
  xxs: 8,
  xs: 16,
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
  xxl: 96,
  xxxl: 128,
};

export const baseRadius: ThemeRadius = {
  sm: 12,
  md: 24,
  lg: 40,
  pill: 999,
};

export const baseMotion: ThemeMotion = {
  easing: "expoOut",
  enterMs: 500,
  exitMs: 300,
  transition: "slide",
  transitionMs: 600,
  staggerMs: 80,
  springs: { enter: "smooth", exit: "snappy", emphasis: "bouncy" },
};
