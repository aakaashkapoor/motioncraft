// Tokens the built-in themes share: the type ramp, named weights, spacing,
// radii, motion and the caption look. Each theme spreads these and sets its own colors and ground.

import type { CubicBezier, MeshSpec, ThemeCaption, ThemeMotion, ThemeRadius, ThemeSpacing, ThemeWeights, TypeRamp, TypeSpec } from "./types";

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

/** Design v3, life #5: three soft blobs, 900-1200 px across, at 10-22% alpha. */
export const baseMesh: MeshSpec = {
  blobs: 3,
  minPx: 900,
  maxPx: 1200,
  minAlpha: 0.1,
  maxAlpha: 0.22,
};

/** Material 3's emphasized accelerate: the curve of everything leaving. */
const EXIT_CURVE: CubicBezier = [0.3, 0, 0.8, 0.15];
/** Material 3's effects default: fades and blur clearing. */
const FX_CURVE: CubicBezier = [0.34, 0.8, 0.34, 1];

/**
 * Design v3, table D. Springs land on their target at the token's duration;
 * `enter` overshoots about 5%, `enter.hero` barely, `pop` about 15%. `count`
 * and `shine` carry the odometer and the shine sweep (life #7 and #9).
 */
export const baseMotion: ThemeMotion = {
  easing: "expoOut",
  transition: "slide",
  transitionMs: 600,
  leadMs: 150,
  cascadeMs: 1200,
  "fx.fast": { ms: 150, curve: [0.31, 0.94, 0.34, 1] },
  fx: { ms: 250, curve: FX_CURVE },
  "text.in": { ms: 550, curve: "expoOut", staggerMs: 55, charStaggerMs: 30, lineStaggerMs: 70 },
  "text.char": { ms: 550, curve: "expoOut", staggerMs: 24 },
  "text.out": { ms: 300, curve: EXIT_CURVE, staggerMs: 20 },
  enter: { ms: 650, curve: { stiffness: 170, damping: 18 }, staggerMs: 90 },
  "enter.hero": { ms: 900, curve: { stiffness: 120, damping: 20 } },
  pop: { ms: 400, curve: { stiffness: 200, damping: 14 }, scale: 1.04 },
  exit: { share: 0.65, minMs: 300, maxMs: 450, curve: EXIT_CURVE },
  count: { ms: 1000, curve: "expoOut", staggerMs: 40, blurMinPx: 2, blurMaxPx: 6, unitDelayMs: 150 },
  mark: { ms: 450, curve: [0.33, 1, 0.68, 1], delayMs: 500, tiltDeg: 1.5, opacity: 0.55, underlinePx: 8 },
  shot: { ms: 750, curve: [0.65, 0, 0.35, 1], fill: 0.75 },
  // The owner's reference keeps the camera calm: subtle breathing, and only when a storyboard asks for it.
  breathe: { on: false, scale: 1.02, curve: "sineInOut", driftPx: 16 },
  drift: { px: 60, minMs: 4000, maxMs: 6000 },
  "grid.breathe": { ms: 8000, scale: 1.04, curve: "sineInOut" },
  grainFps: 12,
  beat: { ms: 400 },
  flow: { ms: 1400, curve: "expoInOut", dotPx: 14, glowPx: 6, glowOpacity: 0.25 },
  typing: { ms: 120, curve: FX_CURVE, cps: 38, jitter: 0.3, pauseMinMs: 200, pauseMaxMs: 400, blinkMs: 1060 },
  shine: { ms: 800, curve: [0.6, 0.6, 0, 1], widthShare: 0.3, skewDeg: 20, opacity: 0.35 },
  // Life #4: a page settles in over 5 frames without overshoot; the spoken word pops over 4.
  caption: { ms: 170, curve: [0.34, 0.8, 0.34, 1], fromScale: 0.9, risePx: 24, wordMs: 133, wordScale: 1.04 },
};

/** Design v3, life #4: the spoken word in the accent colour; a 16 px outline on punch captions. */
export const baseCaption: ThemeCaption = {
  highlight: "color",
  platePadY: 6,
  platePadX: 12,
  strokePx: 16,
};
