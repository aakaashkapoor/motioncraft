import type { Theme, TypeStep } from "../theme/types";
import type { Aspect } from "./frame";

/**
 * Multiplier applied to a theme's type scale for an aspect.
 *
 * Theme sizes are designed for 9:16, which is watched full-screen on a phone:
 * scale 1. A 16:9 frame has the same 1080px short side but only 1080px of
 * height for stacked lines (vs 1920) and is usually watched on a bigger
 * screen, so text is scaled down a little to keep layouts from overflowing
 * while staying readable (body text stays above ~3.5% of frame height).
 */
export function fontScale(aspect: Aspect): number {
  return aspect === "9:16" ? 1 : 0.8;
}

/** A theme's font size for a type step, in px, adjusted for the aspect. */
export function fontSize(theme: Theme, step: TypeStep, aspect: Aspect): number {
  return Math.round(theme.typeScale[step] * fontScale(aspect));
}
