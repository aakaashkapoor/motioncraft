// The living ground's motion (design v3, life #5), from the theme's tokens and
// the video's clock: where each mesh blob is, how far the grid has breathed,
// and which grain is showing. The same moment and seed always give the same
// ground. Pure.

import { noise2D, random } from "../engine/random";
import type { Aspect } from "../storyboard/types";
import { meshLayout, type MeshRest } from "../theme/mesh";
import type { Theme } from "../theme/types";
import { curveEasing } from "./motion";

export interface MeshBlob extends MeshRest {
  /** Its center now, within `motion.drift.px` of home on each axis. */
  x: number;
  y: number;
}

/** Radius of a blob's loop through the noise field, in noise cells: a few swings of the noise per loop. */
const LOOP = 0.8;

/**
 * The mesh's blobs at `ms` into the video: each wanders from home along its
 * own seeded loop through 2D noise, so it is back where it was once per period.
 */
export function meshBlobs(theme: Theme, aspect: Aspect, ms: number): MeshBlob[] {
  const { px } = theme.motion.drift;
  const key = (i: number, axis: string) => `${theme.ground.seed}:mesh:${i}:${axis}`;
  return meshLayout(theme, aspect).map((rest, i) => {
    const phase = (2 * Math.PI * ms) / rest.periodMs;
    const [u, v] = [LOOP * Math.cos(phase), LOOP * Math.sin(phase)];
    return { ...rest, x: rest.homeX + px * noise2D(key(i, "x"), u, v), y: rest.homeY + px * noise2D(key(i, "y"), u, v) };
  });
}

/**
 * The grid at `ms` into the video: its scale breathes 1 -> `grid.breathe.scale`
 * and back once per period, and its opacity rises and falls with it by the
 * same ratio, fullest when largest.
 */
export function gridBreath(theme: Theme, ms: number): { scale: number; opacity: number } {
  const { ms: period, scale: peak, curve } = theme.motion["grid.breathe"];
  const phase = (((ms % period) + period) % period) / period;
  const scale = 1 + (peak - 1) * curveEasing(curve)(phase < 0.5 ? 2 * phase : 2 - 2 * phase);
  return { scale, opacity: scale / peak };
}

/** Seeds film grain can take; any positive integer works for `feTurbulence`. */
const GRAIN_SEEDS = 1_000_000;
/** Absorbs float error in frame times, so a tick that starts on a frame shows on it. */
const TICK_EPSILON = 1e-6;

/** The grain's seed at `ms` into the video: a new one `motion.grainFps` times a second. */
export function grainSeed(theme: Theme, ms: number): number {
  const fps = theme.motion.grainFps;
  const tick = fps > 0 ? Math.floor((ms * fps) / 1000 + TICK_EPSILON) : 0;
  return 1 + Math.floor(random(`${theme.ground.seed}:grain:${tick}`) * (GRAIN_SEEDS - 1));
}
