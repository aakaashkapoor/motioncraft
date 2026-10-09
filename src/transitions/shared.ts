// Shared-element transitions (design v2, section 3): an element carrying the
// same `shareId` in two adjoining scenes is drawn once during their
// transition, in a box that springs from its place in the outgoing scene to
// its place in the incoming one while its content cross-fades. This module is
// the pure part: the morph math and which frozen frames the boxes come from.
// The page measures the boxes (see `src/render/sharedMeasure.ts`).

import { easeInOutCubic } from "../engine/easing";
import { interpolateColors } from "../engine/interpolate";
import { spring, springPresets } from "../engine/spring";
import { frameAt, type ActiveScene, type Timeline } from "../engine/timeline";

/** One shared element as laid out in a scene: frame px, after transforms. */
export interface SharedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Corner radius in frame px. */
  radius: number;
  /** A CSS color. */
  background: string;
  /** The element's own opacity. */
  opacity: number;
}

/** A scene's shared elements, by `shareId`. */
export type SharedBoxes = Readonly<Record<string, SharedBox>>;

/** The boxes on both sides of one scene boundary. */
export interface BoundaryMeasurement {
  /** In the outgoing scene, where the transition starts. */
  from: SharedBoxes;
  /** In the incoming scene, where the transition ends. */
  to: SharedBoxes;
}

/** Measurements by boundary index (`timeline.transitions[i]`). */
export type SharedMeasurements = ReadonlyMap<number, BoundaryMeasurement>;

/** The `shareId`s present on both sides, in the outgoing scene's order. */
export function sharedIds(from: SharedBoxes, to: SharedBoxes): string[] {
  return Object.keys(from).filter((id) => Object.hasOwn(to, id));
}

/**
 * How far the morph is, 0..1, at `transitionProgress` through a transition of
 * `frames` frames: the `smooth` spring stretched over the transition.
 */
export function morphProgress(transitionProgress: number, frames: number, fps: number): number {
  if (frames <= 0 || transitionProgress >= 1) return 1;
  return spring({ frame: transitionProgress * frames, fps, config: springPresets.smooth, durationInFrames: frames });
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function mixColor(a: string, b: string, t: number): string {
  try {
    return interpolateColors(t, [0, 1], [a, b]);
  } catch {
    // A color the mixer cannot read (e.g. a wide-gamut one): switch halfway.
    return t < 0.5 ? a : b;
  }
}

/** The morphing box at `t` (0 = A's box, 1 = B's). */
export function interpolateSharedBox(from: SharedBox, to: SharedBox, t: number): SharedBox {
  return {
    x: mix(from.x, to.x, t),
    y: mix(from.y, to.y, t),
    width: mix(from.width, to.width, t),
    height: mix(from.height, to.height, t),
    radius: mix(from.radius, to.radius, t),
    background: mixColor(from.background, to.background, t),
    opacity: mix(from.opacity, to.opacity, t),
  };
}

/** Opacity of A's and B's content inside the moving box at `t`. */
export function contentFade(t: number): { from: number; to: number } {
  const into = easeInOutCubic(Math.min(1, Math.max(0, t)));
  return { from: 1 - into, to: into };
}

/**
 * The frozen scenes a boundary's morph comes from: the outgoing scene where
 * the transition starts and the incoming one where it ends. The morph begins
 * and lands exactly where the originals are drawn, so the handover is seamless.
 * Their content is drawn frozen inside the moving box.
 */
export function morphEndpoints(timeline: Timeline, boundary: number): [ActiveScene, ActiveScene] {
  const transition = timeline.transitions[boundary];
  if (transition === undefined || transition.frames === 0) {
    throw new Error(`shared elements: boundary ${boundary} has no transition frames`);
  }
  const from = frameAt(timeline, transition.startFrame).pair![0];
  const to = frameAt(timeline, transition.startFrame + transition.frames - 1).pair![1];
  return [
    { ...from, transition: undefined },
    { ...to, transition: undefined },
  ];
}
