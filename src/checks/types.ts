// What the in-page measurement reports for one frame, and what a check reports
// back. Measurements are plain JSON so they cross from the browser to Node.

import type { Rect } from "../layout/frame";

export const CHECK_NAMES = ["overflow", "safe-area", "contrast", "readability", "type-scale", "centering"] as const;
export type CheckName = (typeof CHECK_NAMES)[number];

/** Checks whose problems are warnings: reported, but they do not fail the run. */
export const WARNING_CHECKS: ReadonlySet<CheckName> = new Set<CheckName>(["type-scale", "centering"]);

export interface Problem {
  check: CheckName;
  sceneId: string;
  frame: number;
  message: string;
}

export interface CheckResult {
  /** No problems; warnings are allowed. */
  passed: boolean;
  problems: Problem[];
  /** Advice from the warning checks (see `WARNING_CHECKS`). */
  warnings: Problem[];
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
  /** Computed CSS font size in px. */
  fontSize: number;
  /** Inside an element a component shrank on purpose to fit (see `TYPE_FIT_ATTRIBUTE`). */
  fitted: boolean;
  /**
   * Clear of the camera's shot while the camera is on one: scenery the camera
   * moves, not layout. The wide frames around the shot judge it.
   */
  outOfShot?: boolean;
}

/** A non-text element marked `data-key-element` that must stay in the safe area. */
export interface MeasuredKey {
  label: string;
  rect: Rect;
  opacity: number;
  /** See `MeasuredText.outOfShot`. */
  outOfShot?: boolean;
}

/**
 * A kit component's visual block (a card, a window, a list), marked
 * `data-block`; only blocks not inside another block are measured.
 */
export interface MeasuredBlock {
  /** The marker's value, e.g. "Card" or "terminal window". */
  label: string;
  rect: Rect;
  opacity: number;
  /** The burned-in narration caption rather than the scene itself. */
  caption: boolean;
  /** See `MeasuredText.outOfShot`. */
  outOfShot?: boolean;
}

export interface FrameMeasurement {
  texts: MeasuredText[];
  keys: MeasuredKey[];
  blocks: MeasuredBlock[];
}

/** Below this effective opacity an element counts as not on screen. */
export const VISIBLE_OPACITY = 0.05;

/** Short form of an element's text for messages. */
export function quote(text: string, max = 40): string {
  return `"${text.length > max ? `${text.slice(0, max - 1)}…` : text}"`;
}
