// How each side of a scene transition looks: a style for the wrapper around
// one scene, from its transition state (design v2, section 3). Pure, so the
// page stays deterministic and the curves are easy to test.
//
// zoomBlur splits the transition: the outgoing scene moves over the first 60%
// with an ease-in, the incoming one over the last 60% with an ease-out, and the
// two crossfade in the middle, so the cut lands mid-motion.
//
// slide and fade never show two half-visible scenes (a muddy double exposure).
// slide cuts the curve: the outgoing scene accelerates away and is gone 28% in;
// the incoming one enters there at 0.35 opacity, already moving, and is solid
// by 60%. fade dips through the ground: out by 55%, in from 45%.

import type { CSSProperties } from "react";
import { easeInOutCubic, expoIn, expoOut } from "../engine/easing";
import { interpolate } from "../engine/interpolate";
import type { SceneTransitionState } from "../engine/timeline";
import type { Size } from "../layout/frame";
import type { SlideDirection } from "../storyboard/types";

/** How far a slide travels, as a fraction of the frame along its axis. */
export const SLIDE_DISTANCE = 0.12;
/** zoomBlur: the outgoing scene scales up to this; the incoming one starts at its inverse step. */
export const ZOOM_OUT_SCALE = 1.2;
export const ZOOM_IN_SCALE = 0.8;
/** zoomBlur: blur in px at the far end of each side's motion. */
export const ZOOM_BLUR_PX = 10;
/** wipe: width of the soft edge, in % of the frame. */
export const WIPE_SOFTNESS = 20;

/** Where each side's motion runs, in transition progress. */
const OUT_WINDOW: [number, number] = [0, 0.6];
const IN_WINDOW: [number, number] = [0.4, 1];
/** Where the two sides crossfade. */
const FADE_WINDOW: [number, number] = [0.4, 0.6];

/** slide: the outgoing scene is gone, and the incoming one enters, at this progress. */
const SLIDE_CUT = 0.28;
/** slide: the incoming scene's opacity when it enters, and the progress where it is solid. */
const SLIDE_IN_OPACITY = 0.35;
const SLIDE_IN_SOLID = 0.6;
/** fade: the outgoing scene is gone by FADE_OUT_END; the incoming one starts at FADE_IN_START. */
const FADE_OUT_END = 0.55;
const FADE_IN_START = 0.45;

const easeInCubic = (t: number) => t ** 3;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  // `|| 0` turns -0 into 0 so styles read "0px", not "-0px".
  return Math.round(value * factor) / factor || 0;
};

/** Eased 0..1 progress of one side's motion. */
function motion({ direction, transitionProgress: p }: SceneTransitionState): number {
  return direction === "out" ? expoIn(interpolate(p, OUT_WINDOW, [0, 1])) : expoOut(interpolate(p, IN_WINDOW, [0, 1]));
}

/** The opacity of one side in the mid-transition crossfade. */
function crossfade({ direction, transitionProgress: p }: SceneTransitionState): number {
  return round(interpolate(p, FADE_WINDOW, direction === "out" ? [1, 0] : [0, 1]), 4);
}

const AXIS: Record<SlideDirection, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

function slide(state: SceneTransitionState, { width, height }: Size): CSSProperties {
  const axis = AXIS[state.slideDirection];
  const p = state.transitionProgress;
  const out = state.direction === "out";
  // Outgoing: 0 -> -distance along the travel, fading out. Incoming: +distance -> 0.
  const offset = out
    ? easeInCubic(interpolate(p, [0, SLIDE_CUT], [0, 1]))
    : expoOut(interpolate(p, [SLIDE_CUT, 1], [0, 1])) - 1;
  const opacity = out
    ? interpolate(p, [0, SLIDE_CUT], [1, 0])
    : p < SLIDE_CUT
      ? 0
      : interpolate(p, [SLIDE_CUT, SLIDE_IN_SOLID], [SLIDE_IN_OPACITY, 1], { easing: easeOutCubic });
  const x = round(axis.x * offset * SLIDE_DISTANCE * width);
  const y = round(axis.y * offset * SLIDE_DISTANCE * height);
  return { transform: `translate(${x}px, ${y}px)`, opacity: round(opacity, 4) };
}

function zoomBlur(state: SceneTransitionState): CSSProperties {
  const t = motion(state);
  const [scale, blur] =
    state.direction === "out" ? [1 + (ZOOM_OUT_SCALE - 1) * t, ZOOM_BLUR_PX * t] : [ZOOM_IN_SCALE + (1 - ZOOM_IN_SCALE) * t, ZOOM_BLUR_PX * (1 - t)];
  return { transform: `scale(${round(scale, 4)})`, filter: `blur(${round(blur)}px)`, opacity: crossfade(state) };
}

function fade({ direction, transitionProgress: p }: SceneTransitionState): CSSProperties {
  const opacity =
    direction === "out"
      ? interpolate(p, [0, FADE_OUT_END], [1, 0], { easing: easeInOutCubic })
      : interpolate(p, [FADE_IN_START, 1], [0, 1], { easing: easeInOutCubic });
  return { opacity: round(opacity, 4) };
}

const GRADIENT_TOWARD: Record<SlideDirection, string> = { left: "left", right: "right", up: "top", down: "bottom" };

/** A soft-edged mask sweeping across the frame; the two sides' masks add up to fully opaque. */
function wipe({ direction, transitionProgress: p, slideDirection }: SceneTransitionState): CSSProperties {
  const edge = round(-WIPE_SOFTNESS + easeInOutCubic(p) * (100 + WIPE_SOFTNESS));
  const soft = round(edge + WIPE_SOFTNESS);
  const toward = `to ${GRADIENT_TOWARD[slideDirection]}`;
  const mask =
    direction === "in"
      ? `linear-gradient(${toward}, #000 ${edge}%, transparent ${soft}%)`
      : `linear-gradient(${toward}, transparent ${edge}%, #000 ${soft}%)`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

/** The style for one scene's wrapper while it is in a transition. */
export function transitionStyle(state: SceneTransitionState, size: Size): CSSProperties {
  switch (state.type) {
    case "slide":
      return slide(state, size);
    case "zoomBlur":
      return zoomBlur(state);
    case "fade":
      return fade(state);
    case "wipe":
      return wipe(state);
    case "cut":
      return {};
  }
}
