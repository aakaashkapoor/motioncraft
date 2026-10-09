// What a component can learn about where and when it is drawn, beyond its
// props: the scene clock (for motion and for media that must show an exact
// moment) and the part of its frame that is visible (all of it, or a window's
// content box).

import { createContext, createElement, useContext, type ReactNode } from "react";
import { frameSize, type Rect } from "../layout/frame";
import type { Aspect } from "../storyboard/types";

export interface SceneClock {
  fps: number;
  /** Frame within the scene, from 0. */
  frame: number;
  /** Frames in the scene. */
  frames: number;
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

/**
 * The component's time in its scene: from the scene clock, or `progress`
 * times `NOMINAL_SCENE_MS` without one, less any `MotionDelay` around it.
 */
export function useSceneTime(progress: number): SceneTime {
  const clock = useContext(SceneClockContext);
  const delay = useContext(MotionDelayContext);
  const ms = clock === undefined ? progress * NOMINAL_SCENE_MS : (clock.frame * 1000) / clock.fps;
  const leftMs = clock === undefined ? (1 - progress) * NOMINAL_SCENE_MS : (Math.max(0, clock.frames - 1 - clock.frame) * 1000) / clock.fps;
  return { ms: ms - delay, endMs: ms - delay + leftMs, leftMs };
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
