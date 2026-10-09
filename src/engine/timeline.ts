// The frame timeline: maps a frame number to the scene on screen and how far
// into it we are. Scenes overlap during transitions (design v2, section 3):
// the next scene starts while the previous one finishes, so the total is the
// sum of the scenes minus the sum of the transitions. Pure and deterministic.

import { DEFAULT_SLIDE_DIRECTION, type SlideDirection, type Storyboard, type TransitionType } from "../storyboard/types";
import type { ThemeMotion } from "../theme/types";

/** Resolved scene durations in ms, keyed by scene id. */
export type SceneDurations = Readonly<Record<string, number>> | ReadonlyMap<string, number>;

export interface TimelineScene {
  id: string;
  startFrame: number;
  /** Whole frames, always >= 1. */
  frames: number;
}

/** The boundary from scene `i` into scene `i + 1`. */
export interface TimelineTransition {
  type: TransitionType;
  /** First frame where both scenes are on screen: the next scene's `startFrame`. */
  startFrame: number;
  /** Frames both scenes share. 0 for a cut. */
  frames: number;
  direction: SlideDirection;
}

export interface Timeline {
  fps: number;
  totalFrames: number;
  scenes: TimelineScene[];
  /** One per boundary: `transitions[i]` leads from `scenes[i]` into `scenes[i + 1]`. */
  transitions: TimelineTransition[];
}

/** Where a scene is in a transition it takes part in. */
export interface SceneTransitionState {
  type: TransitionType;
  /** "out" for the scene leaving, "in" for the scene arriving. */
  direction: "in" | "out";
  /** Strictly between 0 and 1, rising through the transition; the same for both scenes. */
  transitionProgress: number;
  slideDirection: SlideDirection;
}

/** One scene on screen at a frame. */
export interface ActiveScene {
  sceneIndex: number;
  sceneId: string;
  /** Frame within the scene, 0..sceneFrames-1. */
  localFrame: number;
  sceneFrames: number;
  /** 0 on the scene's first frame, 1 on its last. */
  progress: number;
  /** Present while the scene is in a transition. */
  transition?: SceneTransitionState;
}

/**
 * What is on screen at a frame. The top-level fields describe the scene that
 * started last (during a transition, the incoming one).
 */
export interface FrameInfo extends ActiveScene {
  /** Both scenes, outgoing then incoming, during a transition. Absent otherwise. */
  pair?: [ActiveScene, ActiveScene];
}

/** Used when a storyboard transition sets no duration and no theme is given. */
export const DEFAULT_TRANSITION_MS = 600;

/** The theme tokens the timeline reads: the default transition and its length. */
export interface TransitionDefaults {
  motion: Pick<ThemeMotion, "transition" | "transitionMs">;
}

function lookup(durations: SceneDurations, id: string): number | undefined {
  if (durations instanceof Map) return durations.get(id);
  const record = durations as Readonly<Record<string, number>>;
  return Object.hasOwn(record, id) ? record[id] : undefined;
}

/**
 * Converts scene durations to whole frames. Each scene's duration comes from
 * `durations`, falling back to its `durationMs`. Every scene but the last is
 * rounded to the nearest frame; the last takes the remainder, so the scenes
 * sum to exactly round(totalMs * fps / 1000) with no drift.
 *
 * Each boundary takes the scene's `transition`, else the theme's default
 * (pass the theme the frames render with; without one, unset boundaries cut).
 * A transition is shortened where needed so every scene keeps at least one
 * frame to itself, so at most two scenes are ever on screen.
 */
export function buildTimeline(storyboard: Storyboard, durations: SceneDurations, theme?: TransitionDefaults): Timeline {
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
  const sceneFrameTotal = Math.round((totalMs * fps) / 1000);

  let assigned = 0;
  const frames = scenes.map((scene, i) => {
    const isLast = i === scenes.length - 1;
    const count = isLast ? sceneFrameTotal - assigned : Math.round((ms[i]! * fps) / 1000);
    if (count < 1) {
      throw new Error(`timeline: scene "${scene.id}" (${ms[i]}ms) is shorter than one frame at ${fps} fps`);
    }
    assigned += count;
    return count;
  });

  const result: TimelineScene[] = [];
  const transitions: TimelineTransition[] = [];
  let startFrame = 0;
  let previousOverlap = 0;
  scenes.forEach((scene, i) => {
    result.push({ id: scene.id, startFrame, frames: frames[i]! });
    if (i === scenes.length - 1) return;
    const spec = scene.transition;
    const type = spec?.type ?? theme?.motion.transition ?? "cut";
    const transitionMs = spec?.durationMs ?? theme?.motion.transitionMs ?? DEFAULT_TRANSITION_MS;
    const wanted = type === "cut" ? 0 : Math.round((transitionMs * fps) / 1000);
    const overlap = Math.max(0, Math.min(wanted, frames[i]! - previousOverlap - 1, frames[i + 1]! - 1));
    startFrame += frames[i]! - overlap;
    transitions.push({ type, startFrame, frames: overlap, direction: spec?.direction ?? DEFAULT_SLIDE_DIRECTION });
    previousOverlap = overlap;
  });

  const totalFrames = sceneFrameTotal - transitions.reduce((sum, t) => sum + t.frames, 0);
  return { fps, totalFrames, scenes: result, transitions };
}

/** The first and last frame where scene `index` is on screen alone, outside every transition. */
export function soloFrames(timeline: Timeline, index: number): { first: number; last: number } {
  const scene = timeline.scenes[index];
  if (scene === undefined) throw new Error(`timeline: no scene ${index}`);
  const into = index > 0 ? timeline.transitions[index - 1]!.frames : 0;
  const out = timeline.transitions[index]?.frames ?? 0;
  return { first: scene.startFrame + into, last: scene.startFrame + scene.frames - 1 - out };
}

/** The scenes a frame shows, back to front: one, or two during a transition. */
export function scenesOnScreen(info: FrameInfo): ActiveScene[] {
  return info.pair ?? [info];
}

function activeScene(timeline: Timeline, index: number, n: number): ActiveScene {
  const scene = timeline.scenes[index]!;
  const localFrame = n - scene.startFrame;
  const progress = scene.frames === 1 ? 1 : localFrame / (scene.frames - 1);
  return { sceneIndex: index, sceneId: scene.id, localFrame, sceneFrames: scene.frames, progress };
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

  const current = activeScene(timeline, lo, n);
  const transition = lo > 0 ? timeline.transitions[lo - 1] : undefined;
  if (transition === undefined || n >= transition.startFrame + transition.frames) return current;

  const shared = {
    type: transition.type,
    transitionProgress: (n - transition.startFrame + 0.5) / transition.frames,
    slideDirection: transition.direction,
  };
  const outgoing: ActiveScene = { ...activeScene(timeline, lo - 1, n), transition: { ...shared, direction: "out" } };
  const incoming: ActiveScene = { ...current, transition: { ...shared, direction: "in" } };
  return { ...incoming, pair: [outgoing, incoming] };
}
