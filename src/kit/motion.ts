// Motion for kit components, in milliseconds from the scene clock (design v3,
// section D): the theme's motion tokens played as curves, plus the rules every
// component shares: arrivals split into movement and a fade, fast exits that
// land on the scene's last frame, and cascades that finish early. Pure.

import { bezier } from "../engine/bezier";
import { easeInOutCubic, easeOutBack, easeSpring, expoIn, expoOut, interpolate, linear, type Easing } from "../engine/easing";
import { spring } from "../engine/spring";
import type { CurveName, MotionCurve, Theme } from "../theme/types";
import type { SceneTime } from "./frameContext";

const EASINGS: Record<string, Easing> = { linear, easeInOutCubic, easeOutBack, easeSpring, expoOut };

/** The theme's v1 easing curve, by name. Unknown names fall back to easeInOutCubic. */
export function themeEasing(theme: Theme): Easing {
  return EASINGS[theme.motion.easing] ?? easeInOutCubic;
}

/**
 * v1: how far a component has entered, 0..1, rising over the first `enter`
 * of `progress` and falling over the last `exit`. The kit times motion in ms
 * (see `tween`); this stays for storyboards' own components.
 */
export function presence(progress: number, enter: number, exit: number, easing: Easing): number {
  const fadeIn = interpolate(progress, [0, enter], [0, 1], { easing });
  const fadeOut = interpolate(progress, [1 - exit, 1], [1, 0], { easing });
  return Math.min(fadeIn, fadeOut);
}

const NAMED: Record<CurveName, Easing> = {
  linear,
  expoOut,
  expoIn,
  sineInOut: (t) => (1 - Math.cos(Math.PI * t)) / 2,
  power4InOut: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
};

/** Resolution of a spring's settle curve when it is stretched to a duration; the result does not depend on it. */
const SPRING_STEPS = 120;
const SPRING_FPS = 30;

/** A curve as an easing, 0 -> 1 over 0..1. A spring's settle curve is stretched to land exactly at 1. */
export function curveEasing(curve: MotionCurve): Easing {
  if (typeof curve === "string") return NAMED[curve];
  if (!("stiffness" in curve)) return bezier(...curve);
  const config = { stiffness: curve.stiffness, damping: curve.damping };
  return (t) => (t >= 1 ? 1 : spring({ frame: t * SPRING_STEPS, fps: SPRING_FPS, config, durationInFrames: SPRING_STEPS }));
}

/** Anything with a duration and a curve: most motion tokens. */
export interface Timed {
  ms: number;
  curve: MotionCurve;
}

/**
 * How far a motion is, `elapsedMs` after it starts: 0 before, the token's
 * curve over its duration, exactly 1 after. For position and scale, which may
 * overshoot.
 */
export function tween(token: Timed, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= token.ms) return 1;
  return curveEasing(token.curve)(elapsedMs / token.ms);
}

/** `tween`, kept within 0..1: for opacity and colour, which never overshoot. */
export function fade(token: Timed, elapsedMs: number): number {
  return Math.min(1, Math.max(0, tween(token, elapsedMs)));
}

/**
 * An element arriving at `startMs` (scene ms; `ms` is now): `move` follows
 * `token` (default `enter`) for position and scale and may overshoot;
 * `opacity` fades in with `fx`.
 */
export function arrive(theme: Theme, ms: number, startMs: number, token: Timed = theme.motion.enter): { move: number; opacity: number } {
  return { move: tween(token, ms - startMs), opacity: fade(theme.motion.fx, ms - startMs) };
}

/** How long an exit lasts after an entry of `entryMs`: the exit token's share of it, within its bounds. */
export function exitMs(theme: Theme, entryMs: number): number {
  const { share, minMs, maxMs } = theme.motion.exit;
  return Math.min(maxMs, Math.max(minMs, entryMs * share));
}

/**
 * Opacity on the way out: 1 until the exit starts, 0 on the scene's last
 * frame. The exit is fast (see `exitMs`) and the same length in any scene.
 */
export function exitOpacity(theme: Theme, { leftMs }: SceneTime, entryMs: number): number {
  const duration = exitMs(theme, entryMs);
  return 1 - fade({ ms: duration, curve: theme.motion.exit.curve }, duration - leftMs);
}

/**
 * The gap between item starts in a cascade of `count` items that starts on
 * the scene's lead: the token's stagger (default `enter`), tighter when the
 * last item would not land within `cascadeMs`.
 */
export function cascadeStep(theme: Theme, count: number, token: Timed & { staggerMs: number } = theme.motion.enter): number {
  if (count <= 1) return 0;
  const room = Math.max(0, theme.motion.cascadeMs - theme.motion.leadMs - token.ms);
  return Math.min(token.staggerMs, room / (count - 1));
}

/**
 * The speed-up a sequence needs to play out before the exit: 1 when its
 * natural end (`naturalEndMs`) comes before the exit starts, less when it
 * would run into it. Only sequences that play out over time (typing, chat
 * messages) use it; entrances never stretch with the scene.
 */
export function fitSequence(theme: Theme, time: SceneTime, startMs: number, naturalEndMs: number, entryMs: number): number {
  const latest = time.endMs - exitMs(theme, entryMs) - theme.motion.beat.ms;
  const natural = naturalEndMs - startMs;
  if (natural <= 0 || latest - startMs >= natural) return 1;
  return Math.max(0, latest - startMs) / natural;
}
