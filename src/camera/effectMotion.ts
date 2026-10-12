// The motion of scene effects, from the scene clock: a ring drawing on, a
// highlight band sweeping, a shake decaying to rest, a pulse. Each takes the
// ms since the effect's cue and is "nothing" before it. Pure.

import type { Rect } from "../layout/frame";
import { tween } from "../kit/motion";
import type { EffectKind } from "../storyboard/types";
import type { Theme } from "../theme/types";

/** How far a ring or highlight reaches past the target's box, on every side. */
export const EFFECT_PADDING_PX = 12;
/** A ring's stroke width. */
export const RING_STROKE_PX = 4;
/** How long a ring takes to draw on, and a highlight to sweep across. */
export const RING_DRAW_MS = 400;
export const HIGHLIGHT_SWEEP_MS = 300;
/** A highlight band's opacity over the target. */
export const HIGHLIGHT_ALPHA = 0.22;
/** A shake: how far either way, how many cycles, and its default length. */
export const SHAKE_PX = 8;
export const SHAKE_CYCLES = 3;
export const DEFAULT_SHAKE_MS = 360;
/** A pulse: its peak scale and default length. */
export const PULSE_SCALE = 1.06;
export const DEFAULT_PULSE_MS = 320;

// `|| 0` turns -0 into 0.
const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places || 0;

/** The box a ring or highlight is drawn on: the target's, padded by `EFFECT_PADDING_PX`. */
export function effectBox(rect: Rect): Rect {
  const pad = EFFECT_PADDING_PX;
  return { x: rect.x - pad, y: rect.y - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad };
}

/** How much of the ring is drawn, 0..1, `elapsedMs` after its cue. */
export function ringDraw(theme: Theme, elapsedMs: number): number {
  return round(Math.min(1, Math.max(0, tween({ ms: RING_DRAW_MS, curve: theme.motion.mark.curve }, elapsedMs))), 4);
}

/** How far the highlight band has swept across, 0..1, `elapsedMs` after its cue. */
export function highlightSweep(theme: Theme, elapsedMs: number): number {
  return round(Math.min(1, Math.max(0, tween({ ms: HIGHLIGHT_SWEEP_MS, curve: theme.motion.mark.curve }, elapsedMs))), 4);
}

/** The shake's horizontal offset in px: `SHAKE_CYCLES` swings of up to `SHAKE_PX`, decaying to exactly 0 at `durationMs`. */
export function shakeOffset(elapsedMs: number, durationMs = DEFAULT_SHAKE_MS): number {
  if (elapsedMs <= 0 || elapsedMs >= durationMs) return 0;
  const t = elapsedMs / durationMs;
  return round(SHAKE_PX * (1 - t) * Math.sin(2 * Math.PI * SHAKE_CYCLES * t), 2);
}

/** The pulse's scale: 1 -> `PULSE_SCALE` at the midpoint -> 1 at `durationMs`. */
export function pulseScale(elapsedMs: number, durationMs = DEFAULT_PULSE_MS): number {
  if (elapsedMs <= 0 || elapsedMs >= durationMs) return 1;
  return round(1 + (PULSE_SCALE - 1) * Math.sin((Math.PI * elapsedMs) / durationMs), 4);
}

/** When a ring or highlight has finished drawing, after its cue: the frame its target is measured on. */
export function effectDrawMs(kind: EffectKind): number {
  return kind === "highlight" ? HIGHLIGHT_SWEEP_MS : RING_DRAW_MS;
}

/** Whether an effect is drawn over its target (and so needs its box measured), rather than moving it. */
export function drawsOverTarget(kind: EffectKind): boolean {
  return kind === "ring" || kind === "highlight";
}
