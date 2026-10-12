// The type step a one-line kit component is set in: the largest of the hero,
// display and headline steps its line fits at. Shared by WordSwap and
// ScrambleText so the two pick their step the same way.

import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole } from "../theme/types";

/** The steps a one-line hero is tried at, largest first. */
export const HERO_STEPS: readonly TypeRole[] = ["hero", "display", "headline"];

/**
 * The largest of `HERO_STEPS` at which the line fits in `room` px:
 * `emsAt(role)` (the line's width in em at that step) times the step's size.
 * Undefined when it fits none (the caller shrinks from the last step).
 */
export function largestFittingStep(theme: Theme, aspect: Aspect, room: number, emsAt: (role: TypeRole) => number): TypeRole | undefined {
  return HERO_STEPS.find((role) => emsAt(role) * theme.type[role][aspect].size <= room);
}
