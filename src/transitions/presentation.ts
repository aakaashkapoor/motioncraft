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
//
// iris and whipPan are ported from HyperFrames' iris-reveal and whip-pan-cut.
// iris opens a circle from a point (quart in-out) with the incoming scene on
// top; the page draws its accent ring from `transitionOverlay`. whipPan obeys
// the Vector Law: one axis, one direction, a hard cut at 0.5 with both sides at
// the same speed (mirrored quint curves over the same distance and time). As in
// the source, the pan covers one frame and the cut lands where the seam crosses
// the middle: each side travels half a frame, so neither is gone at the cut.

import type { CSSProperties } from "react";
import { easeInOutCubic, expoIn, expoOut } from "../engine/easing";
import { interpolate } from "../engine/interpolate";
import type { SceneTransitionState } from "../engine/timeline";
import type { Size } from "../layout/frame";
import { DEFAULT_IRIS_ORIGIN, type SlideDirection, type TransitionOrigin } from "../storyboard/types";

/** How far a slide travels, as a fraction of the frame along its axis. */
export const SLIDE_DISTANCE = 0.12;
/** zoomBlur: the outgoing scene scales up to this; the incoming one starts at its inverse step. */
export const ZOOM_OUT_SCALE = 1.2;
export const ZOOM_IN_SCALE = 0.8;
/** zoomBlur: blur in px at the far end of each side's motion. */
export const ZOOM_BLUR_PX = 10;
/** wipe: width of the soft edge, in % of the frame. */
export const WIPE_SOFTNESS = 20;

/** iris: width of the accent ring riding the circle's edge, in px. */
export const IRIS_RING_PX = 6;
/** iris: the outgoing scene's brightness once the circle has opened. */
export const IRIS_DIM = 0.85;
/** iris: the ring fades out from this progress to the end. */
const IRIS_RING_FADE = 0.85;
/** whipPan: blur in px at the cut, where both sides move fastest. */
export const WHIP_BLUR_PX = 24;
/** whipPan: extra scale along the axis at the cut, so the blur reads as directional. */
export const WHIP_STRETCH = 0.08;
/** whipPan: how far each side travels, as a fraction of the frame along its axis. */
export const WHIP_TRAVEL = 0.5;
/** whipPan: the outgoing scene is gone, and the incoming one appears, at this progress. */
const WHIP_CUT = 0.5;

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
const easeInOutQuart = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
const easeInQuint = (t: number) => t ** 5;
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

/** iris: the circle's center in frame px, and its radius at `progress`: 0 at 0, the farthest corner at 1. */
function irisCircle(progress: number, origin: TransitionOrigin = DEFAULT_IRIS_ORIGIN, { width, height }: Size) {
  const x = origin.x * width;
  const y = origin.y * height;
  const far = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
  return { x, y, r: far * easeInOutQuart(Math.min(1, Math.max(0, progress))) };
}

/** iris: the circle's radius in px at `progress`, from `origin` (frame fractions, default the center). */
export function irisRadius(progress: number, origin: TransitionOrigin | undefined, size: Size): number {
  return irisCircle(progress, origin, size).r;
}

/**
 * Incoming: clipped to the opening circle, on top. Outgoing: stays put and
 * dims, masked out inside the circle. Scenes draw over a shared ground, so
 * without the mask it would show through the incoming scene.
 */
function iris(state: SceneTransitionState, size: Size): CSSProperties {
  const { x, y, r } = irisCircle(state.transitionProgress, state.origin, size);
  if (state.direction === "out") {
    const mask = `radial-gradient(circle at ${round(x)}px ${round(y)}px, transparent ${round(r)}px, #000 ${round(r)}px)`;
    return {
      filter: `brightness(${round(1 - (1 - IRIS_DIM) * easeInOutQuart(state.transitionProgress), 4)})`,
      maskImage: mask,
      WebkitMaskImage: mask,
    };
  }
  return { clipPath: `circle(${round(r)}px at ${round(x)}px ${round(y)}px)` };
}

/**
 * Outgoing: accelerates along the travel (quint in) by half a frame, hidden at the cut.
 * Incoming: arrives from half a frame back at the same speed and decelerates (quint out).
 * Blur and an axis stretch follow the speed, peaking at the cut.
 */
function whipPan(state: SceneTransitionState, { width, height }: Size): CSSProperties {
  const axis = AXIS[state.slideDirection];
  const p = state.transitionProgress;
  const out = state.direction === "out";
  // How far this side is from rest, 0..1: 1 at the cut on both sides.
  const away = out
    ? easeInQuint(interpolate(p, [0, WHIP_CUT], [0, 1]))
    : easeInQuint(1 - interpolate(p, [WHIP_CUT, 1], [0, 1]));
  const along = (out ? away : -away) * WHIP_TRAVEL;
  const stretch = round(1 + WHIP_STRETCH * away, 4);
  const [sx, sy] = axis.x !== 0 ? [stretch, 1] : [1, stretch];
  const visible = out ? p < WHIP_CUT : p >= WHIP_CUT;
  return {
    transform: `translate(${round(axis.x * along * width)}px, ${round(axis.y * along * height)}px) scale(${sx}, ${sy})`,
    filter: `blur(${round(WHIP_BLUR_PX * away)}px)`,
    opacity: visible ? 1 : 0,
  };
}

/**
 * What the page draws above a scene's wrapper during a transition, if
 * anything: iris's accent ring, a circle whose stroke is centered on the
 * incoming scene's clip edge, fading out over the last 15%.
 */
export function transitionOverlay(state: SceneTransitionState, size: Size, accent: string): CSSProperties | undefined {
  if (state.type !== "iris" || state.direction !== "in") return undefined;
  const { x, y, r } = irisCircle(state.transitionProgress, state.origin, size);
  const outer = r + IRIS_RING_PX / 2;
  return {
    position: "absolute",
    left: round(x - outer),
    top: round(y - outer),
    width: round(2 * outer),
    height: round(2 * outer),
    borderRadius: "50%",
    border: `${IRIS_RING_PX}px solid ${accent}`,
    boxSizing: "border-box",
    pointerEvents: "none",
    opacity: round(interpolate(state.transitionProgress, [IRIS_RING_FADE, 1], [1, 0]), 4),
  };
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
    case "iris":
      return iris(state, size);
    case "whipPan":
      return whipPan(state, size);
    case "cut":
      return {};
  }
}
