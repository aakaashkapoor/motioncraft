// Field-to-field boundaries: two flat colour fields must not blend. A
// transition that mixes both scenes' pixels (fade, zoomBlur, slide) between
// scenes on different grounds becomes a hard cut at its midpoint; the frames
// keep their length. Wipe, iris and whipPan reveal one field over the other
// cleanly and stay as they are.

import { outgoingTransition, type TransitionDefaults } from "../engine/timeline";
import type { SceneGround, Storyboard, StoryboardScene, TransitionType } from "../storyboard/types";

/** Transitions that blend two scenes' pixels: muddy between two saturated fields. */
export const CROSSFADE_TRANSITIONS = ["fade", "zoomBlur", "slide"] as const satisfies readonly TransitionType[];

/** A scene's ground, `"ground"` when it sets none. */
export function sceneGround(scene: Pick<StoryboardScene, "ground">): SceneGround {
  return scene.ground ?? "ground";
}

/**
 * Whether the boundary from scene `boundaryIndex` into the next cuts at its
 * midpoint: the two scenes stand on different grounds and the boundary's
 * transition (the scene's, else the theme's default) is a crossfade.
 */
export function cutsAtMidpoint(storyboard: Pick<Storyboard, "scenes">, boundaryIndex: number, theme: TransitionDefaults): boolean {
  const from = storyboard.scenes[boundaryIndex];
  const to = storyboard.scenes[boundaryIndex + 1];
  if (from === undefined || to === undefined || sceneGround(from) === sceneGround(to)) return false;
  return (CROSSFADE_TRANSITIONS as readonly TransitionType[]).includes(outgoingTransition(from, theme).type);
}
