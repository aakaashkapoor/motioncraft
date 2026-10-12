// What a component can learn about where and when it is drawn, beyond its
// props: the scene clock (for motion and for media that must show an exact
// moment) and the part of its frame that is visible (all of it, or a window's
// content box), and the scene's narration words (for word cues).

import { createContext, createElement, useContext, type ReactNode } from "react";
import { frameSize, type Rect } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import type { TimedWord } from "./captionWords";

export interface SceneClock {
  fps: number;
  /** Frame within the scene, from 0. */
  frame: number;
  /** Frames in the scene. */
  frames: number;
  /**
   * The scene opens settled: its entrances count as finished at frame 0 (see
   * `entering`). Set for the first scene unless the storyboard says `opening: build`.
   */
  settled?: boolean;
}

/** Provided by the render page; absent when a component is drawn on its own. */
export const SceneClockContext = createContext<SceneClock | undefined>(undefined);

/** Milliseconds into the scene. Falls back to 0 without a clock. */
export function useSceneMs(): number {
  const clock = useContext(SceneClockContext);
  return clock === undefined ? 0 : (clock.frame * 1000) / clock.fps;
}

/**
 * The scene length motion assumes when a component is drawn without a clock
 * (tests, thumbnails): its `progress` stands for this many ms.
 */
export const NOMINAL_SCENE_MS = 5000;

/** Where a component is in its scene, for motion: entrances count from `ms` 0, exits land on `endMs`. */
export interface SceneTime {
  /** Milliseconds into the scene (less any `MotionDelay` around the component). */
  ms: number;
  /** When the scene's last frame is drawn, on the same clock: `ms + leftMs`. */
  endMs: number;
  /** Milliseconds until the scene's last frame, counted in whole frames so exits match in any scene. */
  leftMs: number;
  /** How far entrances are ahead of `ms`: `OPENING_SETTLE_MS` in a settled opening scene, else 0. See `entering`. */
  settleMs?: number;
}

/**
 * How far ahead of the timeline a settled opening scene's entrances run: far
 * enough that every entrance (headline, mark, a content container's `enter`,
 * through any `MotionDelay`) has finished at frame 0.
 */
export const OPENING_SETTLE_MS = 10_000;

/**
 * The time an entrance should use: `time`, with the settled opening's head
 * start added. Only entrances use it (headline words, the mark sweep, a
 * container's `enter`); anything timed inside the scene (typing, cursor
 * clicks, scheduled list items, captions) keeps `time`. The same as `time`
 * when the scene is not settled.
 */
export function entering(time: SceneTime): SceneTime {
  const settleMs = time.settleMs ?? 0;
  return settleMs === 0 ? time : { ms: time.ms + settleMs, endMs: time.endMs + settleMs, leftMs: time.leftMs, settleMs };
}

const MotionDelayContext = createContext(0);

/**
 * Delays the motion of everything inside by `ms` (a negative delay runs it
 * ahead), on top of any delay around it. Exits still land on the scene's last
 * frame. Media keep the scene clock (`useSceneMs`).
 */
export function MotionDelay({ ms, children }: { ms: number; children?: ReactNode }) {
  const outer = useContext(MotionDelayContext);
  return createElement(MotionDelayContext.Provider, { value: outer + ms }, children);
}

/** The total `MotionDelay` around the component, in ms. */
export function useMotionDelay(): number {
  return useContext(MotionDelayContext);
}

/**
 * The scene's narration words on the scene clock (see `sceneWords`): the
 * voice's measured times, or an even estimate without audio. Provided by the
 * render page per scene (empty for a scene without narration); absent when a
 * component is drawn on its own.
 */
export const SceneWordsContext = createContext<readonly TimedWord[] | undefined>(undefined);

/** The scene's narration words on the scene clock; none when drawn on its own. */
export function useSceneWords(): readonly TimedWord[] {
  return useContext(SceneWordsContext) ?? [];
}

/**
 * The component's time in its scene: from the scene clock, or `progress`
 * times `NOMINAL_SCENE_MS` without one, less any `MotionDelay` around it.
 */
export function useSceneTime(progress: number): SceneTime {
  const clock = useContext(SceneClockContext);
  const delay = useContext(MotionDelayContext);
  const ms = clock === undefined ? progress * NOMINAL_SCENE_MS : (clock.frame * 1000) / clock.fps;
  const leftMs = clock === undefined ? (1 - progress) * NOMINAL_SCENE_MS : (Math.max(0, clock.frames - 1 - clock.frame) * 1000) / clock.fps;
  const settleMs = clock?.settled === true ? OPENING_SETTLE_MS : 0;
  return { ms: ms - delay, endMs: ms - delay + leftMs, leftMs, ...(settleMs !== 0 && { settleMs }) };
}

/**
 * The visible part of the component's frame, in its own frame coordinates.
 * A content slot sets it to the slot's box; elsewhere it is the whole frame.
 */
export const VisibleRectContext = createContext<Rect | undefined>(undefined);

/** The rect a full-bleed element (an image, a video) should fill. */
export function useVisibleRect(aspect: Aspect): Rect {
  return useContext(VisibleRectContext) ?? { x: 0, y: 0, ...frameSize(aspect) };
}
