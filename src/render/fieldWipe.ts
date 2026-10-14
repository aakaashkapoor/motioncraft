// A wipe between two colour fields: the presentation's soft edge (a band a
// fifth of the frame wide) would blend the two swatches into a muddy band, so
// between fields the edge is hard, sweeping on the same curve. Every other
// transition, and any wipe on one shared ground, keeps its own style.

import type { CSSProperties } from "react";
import { easeInOutCubic } from "../engine/easing";
import type { SceneTransitionState } from "../engine/timeline";
import type { Size } from "../layout/frame";
import type { SlideDirection } from "../storyboard/types";
import { transitionStyle } from "../transitions";

const GRADIENT_TOWARD: Record<SlideDirection, string> = { left: "left", right: "right", up: "top", down: "bottom" };

/** Where the hard edge stands at `progress`, in % of the frame along the wipe. */
export function hardWipeEdge(progress: number): number {
  return Math.round(easeInOutCubic(Math.min(1, Math.max(0, progress))) * 10000) / 100;
}

/** The wrapper style for one side of a transition; `field` when the two scenes stand on different grounds. */
export function fieldTransitionStyle(state: SceneTransitionState, size: Size, field: boolean): CSSProperties {
  if (!field || state.type !== "wipe") return transitionStyle(state, size);
  const edge = hardWipeEdge(state.transitionProgress);
  const toward = `to ${GRADIENT_TOWARD[state.slideDirection]}`;
  const mask =
    state.direction === "in"
      ? `linear-gradient(${toward}, #000 ${edge}%, transparent ${edge}%)`
      : `linear-gradient(${toward}, transparent ${edge}%, #000 ${edge}%)`;
  return { maskImage: mask, WebkitMaskImage: mask };
}
