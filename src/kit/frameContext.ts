// What a component can learn about where and when it is drawn, beyond its
// props: the scene clock (for media that must show an exact moment) and the
// part of its frame that is visible (all of it, or a window's content box).

import { createContext, useContext } from "react";
import { frameSize, type Rect } from "../layout/frame";
import type { Aspect } from "../storyboard/types";

export interface SceneClock {
  fps: number;
  /** Frame within the scene, from 0. */
  frame: number;
}

/** Provided by the render page; absent when a component is drawn on its own. */
export const SceneClockContext = createContext<SceneClock | undefined>(undefined);

/** Milliseconds into the scene. Falls back to 0 without a clock. */
export function useSceneMs(): number {
  const clock = useContext(SceneClockContext);
  return clock === undefined ? 0 : (clock.frame * 1000) / clock.fps;
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
