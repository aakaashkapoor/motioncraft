// What the in-page measurement reports for one frame, and what a check reports
// back. Measurements are plain JSON so they cross from the browser to Node.

import type { Rect } from "../layout/frame";

export const CHECK_NAMES = ["overflow", "safe-area", "contrast", "readability"] as const;
export type CheckName = (typeof CHECK_NAMES)[number];

export interface Problem {
  check: CheckName;
  sceneId: string;
  frame: number;
  message: string;
}

export interface CheckResult {
  passed: boolean;
  problems: Problem[];
}

/** An element with its own text, as laid out on one frame. */
export interface MeasuredText {
  /** The element's text, whitespace collapsed. */
  text: string;
  /** Box around the rendered text, in frame px. */
  rect: Rect;
  /** Boxes that clip the text: the element itself and ancestors whose overflow is not visible. */
  clips: Rect[];
  /** Product of `opacity` down the tree; 0 means not visible on this frame. */
  opacity: number;
  /** Computed CSS text color. */
  color: string;
  /** Computed CSS background colors under the text, topmost first. */
  backgrounds: string[];
  /** Part of the burned-in narration caption rather than the scene itself. */
  caption: boolean;
}

/** A non-text element marked `data-key-element` that must stay in the safe area. */
export interface MeasuredKey {
  label: string;
  rect: Rect;
  opacity: number;
}

export interface FrameMeasurement {
  texts: MeasuredText[];
  keys: MeasuredKey[];
}

/** Below this effective opacity an element counts as not on screen. */
export const VISIBLE_OPACITY = 0.05;

/** Short form of an element's text for messages. */
export function quote(text: string, max = 40): string {
  return `"${text.length > max ? `${text.slice(0, max - 1)}…` : text}"`;
}
