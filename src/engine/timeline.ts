// The frame timeline: maps a frame number to the scene on screen and how far
// into it we are. Pure and deterministic.

import type { Storyboard } from "../storyboard/types";

/** Resolved scene durations in ms, keyed by scene id. */
export type SceneDurations = Readonly<Record<string, number>> | ReadonlyMap<string, number>;

export interface TimelineScene {
  id: string;
  startFrame: number;
  /** Whole frames, always >= 1. */
  frames: number;
}

export interface Timeline {
  fps: number;
  totalFrames: number;
  scenes: TimelineScene[];
}

export interface FrameInfo {
  sceneIndex: number;
  sceneId: string;
  /** Frame within the scene, 0..sceneFrames-1. */
  localFrame: number;
  sceneFrames: number;
  /** 0 on the scene's first frame, 1 on its last. */
  progress: number;
}

function lookup(durations: SceneDurations, id: string): number | undefined {
  if (durations instanceof Map) return durations.get(id);
  const record = durations as Readonly<Record<string, number>>;
  return Object.hasOwn(record, id) ? record[id] : undefined;
}

/**
 * Converts scene durations to whole frames. Each scene's duration comes from
 * `durations`, falling back to its `durationMs`. Every scene but the last is
 * rounded to the nearest frame; the last takes the remainder, so the total is
 * exactly round(totalMs * fps / 1000) with no drift.
 */
export function buildTimeline(storyboard: Storyboard, durations: SceneDurations): Timeline {
  const { fps, scenes } = storyboard;
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`timeline: fps must be a positive number, got ${fps}`);
  }
  if (scenes.length === 0) throw new Error("timeline: storyboard has no scenes");

  const ms = scenes.map((scene) => {
    const value = lookup(durations, scene.id) ?? scene.durationMs;
    if (value === undefined) throw new Error(`timeline: scene "${scene.id}" has no duration`);
    if (value === "clip") {
      throw new Error(`timeline: scene "${scene.id}" has durationMs "clip", so it takes its length from its clip; resolve it first (prepareMedia)`);
    }
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`timeline: scene "${scene.id}" duration must be a positive number of ms, got ${value}`);
    }
    return value;
  });

  const totalMs = ms.reduce((sum, value) => sum + value, 0);
  const totalFrames = Math.round((totalMs * fps) / 1000);

  const result: TimelineScene[] = [];
  let startFrame = 0;
  scenes.forEach((scene, i) => {
    const isLast = i === scenes.length - 1;
    const frames = isLast ? totalFrames - startFrame : Math.round((ms[i]! * fps) / 1000);
    if (frames < 1) {
      throw new Error(`timeline: scene "${scene.id}" (${ms[i]}ms) is shorter than one frame at ${fps} fps`);
    }
    result.push({ id: scene.id, startFrame, frames });
    startFrame += frames;
  });

  return { fps, totalFrames, scenes: result };
}

/** What is on screen at frame `n`. Throws if `n` is not a frame of the timeline. */
export function frameAt(timeline: Timeline, n: number): FrameInfo {
  if (!Number.isInteger(n)) throw new Error(`timeline: frame must be an integer, got ${n}`);
  const last = timeline.totalFrames - 1;
  if (n < 0 || n > last) {
    throw new Error(`timeline: frame ${n} is out of range: valid frames are 0..${last}`);
  }

  // Binary search for the last scene starting at or before n.
  const { scenes } = timeline;
  let lo = 0;
  let hi = scenes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (scenes[mid]!.startFrame <= n) lo = mid;
    else hi = mid - 1;
  }

  const scene = scenes[lo]!;
  const localFrame = n - scene.startFrame;
  const progress = scene.frames === 1 ? 1 : localFrame / (scene.frames - 1);
  return { sceneIndex: lo, sceneId: scene.id, localFrame, sceneFrames: scene.frames, progress };
}
