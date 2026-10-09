// Tokens the built-in themes share: type ramp, fitting scale, spacing, radii
// and motion. Each theme spreads these and sets its own colors and ground.

import type { ThemeMotion, ThemeRadius, ThemeSpacing, ThemeTypeScale, TypeRamp, TypeSpec } from "./types";

export const SYSTEM_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
export const SYSTEM_MONO =
  'ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

const spec = (size: number, weight: number, tracking: number, lineHeight: number): TypeSpec => ({ size, weight, tracking, lineHeight });

/**
 * Sized for 1080px-wide 9:16 frames watched on a phone, and for 1080px-tall
 * 16:9 frames (about 0.8x). Headlines are heavy with tight tracking; eyebrows
 * are small and spaced out.
 */
export const baseTypeRamp: TypeRamp = {
  eyebrow: { "9:16": spec(36, 600, 0.12, 1.3), "16:9": spec(28, 600, 0.12, 1.3) },
  headline: { "9:16": spec(128, 800, -0.02, 1.02), "16:9": spec(104, 800, -0.02, 1.02) },
  title: { "9:16": spec(88, 700, -0.015, 1.08), "16:9": spec(68, 700, -0.015, 1.08) },
  body: { "9:16": spec(52, 450, 0, 1.35), "16:9": spec(40, 450, 0, 1.35) },
  caption: { "9:16": spec(40, 500, 0, 1.3), "16:9": spec(32, 500, 0, 1.3) },
  mono: { "9:16": spec(40, 450, 0, 1.45), "16:9": spec(32, 450, 0, 1.45) },
};

export const baseTypeScale: ThemeTypeScale = {
  caption: 40,
  body: 52,
  subtitle: 64,
  title: 88,
  display: 128,
};

export const baseSpacing: ThemeSpacing = {
  xs: 8,
  sm: 16,
  md: 32,
  lg: 56,
  xl: 96,
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
  transitionMs: 600,
  staggerMs: 80,
  springs: { enter: "smooth", exit: "snappy", emphasis: "bouncy" },
};
