// The pure parts of Countdown: its prop rules, which number shows at a scene
// ms and how far its ring has drawn, and where the numeral and ring sit per
// aspect. Runs in tests.

import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";

export const FROM_MIN = 1;
export const FROM_MAX = 9;
export const STEP_MIN_MS = 300;
export const STEP_MAX_MS = 1500;
export const DEFAULT_FROM = 3;
export const DEFAULT_TO = 1;
export const DEFAULT_STEP_MS = 600;
/** The ring starts drawing (and each step is counted) from here: the first move is inside 100-200 ms. The first number is on screen from frame 0. */
export const LEAD_MS = 100;

export interface CountdownSpec {
  from: number;
  to: number;
  stepMs: number;
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** The props with their defaults filled in. */
export function countdownSpec(props: { from?: number; to?: number; stepMs?: number }): CountdownSpec {
  return { from: props.from ?? DEFAULT_FROM, to: props.to ?? DEFAULT_TO, stepMs: props.stepMs ?? DEFAULT_STEP_MS };
}

/** How long the numbers take to count, ms: `(from - to + 1) * stepMs`. */
export function countdownMs(spec: CountdownSpec): number {
  return (spec.from - spec.to + 1) * spec.stepMs;
}

/**
 * What is wrong with Countdown props; empty when they are fine. With the
 * scene's length (ms), a scene too short for the countdown is an error too.
 */
export function countdownErrors(props: Record<string, unknown>, sceneMs?: number): string[] {
  const { from, to, stepMs } = props;
  const errors: string[] = [];
  if (from !== undefined && (!isInt(from) || from < FROM_MIN || from > FROM_MAX)) errors.push(`\`from\` must be a whole number ${FROM_MIN}-${FROM_MAX} (got ${JSON.stringify(from)})`);
  if (to !== undefined && (!isInt(to) || to < FROM_MIN || to > FROM_MAX)) errors.push(`\`to\` must be a whole number ${FROM_MIN}-${FROM_MAX} (got ${JSON.stringify(to)})`);
  if (stepMs !== undefined && (typeof stepMs !== "number" || !Number.isFinite(stepMs) || stepMs < STEP_MIN_MS || stepMs > STEP_MAX_MS)) errors.push(`\`stepMs\` must be ${STEP_MIN_MS}-${STEP_MAX_MS} ms (got ${JSON.stringify(stepMs)})`);
  if (errors.length > 0) return errors;
  const spec = countdownSpec(props as { from?: number; to?: number; stepMs?: number });
  if (spec.to > spec.from) return [`\`to\` (${spec.to}) must not be above \`from\` (${spec.from}): a countdown counts down`];
  const needed = countdownMs(spec);
  if (sceneMs !== undefined && sceneMs < needed) errors.push(`the scene is ${Math.round(sceneMs)} ms but counting ${spec.from} to ${spec.to} at ${spec.stepMs} ms a number takes ${needed} ms: lengthen the scene to at least ${needed} ms`);
  return errors;
}

export interface CountdownState {
  /** The number on screen. */
  value: number;
  /** How much of its ring is drawn, 0-1 (linear over the step). */
  ring: number;
}

/** The number shown and its ring at a scene ms: hard cuts, the ring drawing over each step (the first number waits LEAD_MS with its ring empty). */
export function countdownAt(spec: CountdownSpec, ms: number): CountdownState {
  const steps = spec.from - spec.to + 1;
  const index = ms < LEAD_MS ? 0 : Math.min(steps - 1, Math.floor((ms - LEAD_MS) / spec.stepMs));
  const elapsed = ms - LEAD_MS - index * spec.stepMs;
  return { value: spec.from - index, ring: Math.min(1, Math.max(0, elapsed / spec.stepMs)) };
}

/** When the last number has had its whole step, ms on the scene clock: the exit's entry length. */
export const countdownEndMs = (spec: CountdownSpec): number => LEAD_MS + countdownMs(spec);

// ---- Size and place ----

/** The display serif's line box (ascent + descent), its baseline's depth in it, and a lining figure's height, em. */
export const LINE_EM = 1.333;
const BASELINE_EM = 1.082;
const FIGURE_EM = 0.708;
/** The ring's stroke, px. */
export const RING_STROKE_PX = 1.5;

export interface CountdownLayout {
  box: Rect;
  /** Font size, px: the numeral's text box fills the area's height. */
  size: number;
  /** Where the numeral's line box starts inside `box`, px, so the figure's middle is the ring's. */
  numeralTop: number;
  /** The ring's centre (relative to `box`) and diameter, px. */
  ringCenter: { x: number; y: number };
  ringDiameter: number;
}

/**
 * The numeral as big as its text box lets it be inside the content area (the
 * slot when nested), its figure centred on the area; the ring is centred on
 * the figure and as wide as the area is short (or narrow).
 */
export function countdownLayout(theme: Theme, aspect: Aspect, slot?: Rect): CountdownLayout {
  const box = slot ?? contentArea(theme, aspect);
  // The figure sits below the line box's middle: size it so the box still fits once the figure is moved up to the area's middle.
  const below = BASELINE_EM - FIGURE_EM / 2 - LINE_EM / 2;
  const size = Math.floor(Math.min(box.height / (LINE_EM + 2 * below), box.width / 0.7) * 100) / 100;
  const cx = box.width / 2;
  const cy = box.height / 2;
  return {
    box,
    size,
    numeralTop: Math.round((cy - (BASELINE_EM - FIGURE_EM / 2) * size) * 100) / 100,
    ringCenter: { x: cx, y: cy },
    ringDiameter: Math.floor(Math.min(box.width, box.height) - 2 * RING_STROKE_PX),
  };
}
