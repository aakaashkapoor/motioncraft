// Shared enter/exit motion for kit components. Pure, so it is easy to test.

import { easeInOutCubic, easeOutBack, easeSpring, interpolate, linear, type Easing } from "../engine/easing";
import type { Theme } from "../theme/types";

/** Exponential ease-out: fast start, long soft landing. The v2 house curve. */
const expoOut: Easing = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

const EASINGS: Record<string, Easing> = { linear, easeInOutCubic, easeOutBack, easeSpring, expoOut };

/** The theme's named easing curve. Unknown names fall back to easeInOutCubic. */
export function themeEasing(theme: Theme): Easing {
  return EASINGS[theme.motion.easing] ?? easeInOutCubic;
}

/**
 * How far a component has entered, 0..1: rises over the first `enter` of the
 * scene, holds at 1, and falls over the last `exit`. Fractions of progress.
 */
export function presence(progress: number, enter: number, exit: number, easing: Easing): number {
  const fadeIn = interpolate(progress, [0, enter], [0, 1], { easing });
  const fadeOut = interpolate(progress, [1 - exit, 1], [1, 0], { easing });
  return Math.min(fadeIn, fadeOut);
}
