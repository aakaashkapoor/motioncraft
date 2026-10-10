// A highlight moving along a group's items (design v3, life #8, and the
// owner's reference: "a state moves along a sequence, the accent lands on
// step 5"). A single index lands once; a progression `{ from, to, stepMs }`
// lands on `from` and moves one item every `stepMs` until it comes to rest on
// `to`. The item it lands on pops (`pop`, overshooting); the one it leaves
// lets go on `fx.fast`; the shine crosses the item it rests on, once. Pure.

import type { Theme } from "../theme/types";
import type { SceneTime } from "./frameContext";
import { fade, fitSequence, tween } from "./motion";

/** The highlight moving from item `from` to item `to`, one item every `stepMs`. */
export interface HighlightProgression {
  from: number;
  to: number;
  stepMs: number;
}

/** One item lit for good, or a highlight moving along the items. */
export type HighlightSpec = number | HighlightProgression;

/** The highlight on one item. */
export interface HighlightStop {
  index: number;
  /** When it lands on the item, in scene ms. */
  startMs: number;
  /** When it moves on: the next stop's start, or `Infinity` on the item it rests on. */
  endMs: number;
}

const isIndex = (value: unknown, count: number): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < count;

function checkIndex(name: string, value: unknown, count: number): number {
  if (!isIndex(value, count)) throw new Error(`highlight.${name} must be a whole item index from 0 to ${count - 1}, got ${JSON.stringify(value)}`);
  return value;
}

/**
 * The stops of `highlight` over `count` items, the first landing at
 * `startMs`. A single index off the items lights nothing; a progression off
 * them, or one with no step, is an error. Given the scene's time, a
 * progression that would not rest and shine before the exit speeds up (see
 * `fitSequence`).
 */
export function highlightStops(theme: Theme, highlight: HighlightSpec | undefined, count: number, startMs: number, time?: SceneTime): HighlightStop[] {
  if (highlight === undefined) return [];
  if (typeof highlight === "number") return isIndex(highlight, count) ? [{ index: highlight, startMs, endMs: Infinity }] : [];
  const from = checkIndex("from", highlight.from, count);
  const to = checkIndex("to", highlight.to, count);
  if (!(typeof highlight.stepMs === "number" && highlight.stepMs > 0 && Number.isFinite(highlight.stepMs))) {
    throw new Error(`highlight.stepMs must be a number of ms above 0, got ${JSON.stringify(highlight.stepMs)}`);
  }
  const moves = Math.abs(to - from);
  const { pop, shine, enter } = theme.motion;
  // The moves speed up; the pop and the shine on the last item keep their length, so they must fit too.
  const tail = Math.max(pop.ms, shine.ms);
  const pace = time === undefined ? 1 : fitSequence(theme, { ...time, endMs: time.endMs - tail }, startMs, startMs + moves * highlight.stepMs, enter.ms);
  const step = highlight.stepMs * pace;
  const direction = Math.sign(to - from);
  return Array.from({ length: moves + 1 }, (_, k) => ({
    index: from + k * direction,
    startMs: startMs + k * step,
    endMs: k === moves ? Infinity : startMs + (k + 1) * step,
  }));
}

/** The item the highlight is on at `ms`, or undefined before it lands. */
export function highlightAt(stops: readonly HighlightStop[], ms: number): number | undefined {
  return stops.find((stop) => ms >= stop.startMs && ms < stop.endMs)?.index;
}

/**
 * How lit item `index` is at `ms`: springing to 1 on `pop` as the highlight
 * lands on it (it may overshoot, for scale), back to 0 on `fx.fast` as the
 * highlight moves on.
 */
export function highlightLevel(theme: Theme, stops: readonly HighlightStop[], index: number, ms: number): number {
  const { pop } = theme.motion;
  const off = theme.motion["fx.fast"];
  return stops
    .filter((stop) => stop.index === index)
    .reduce((level, stop) => level + tween(pop, ms - stop.startMs) * (1 - fade(off, ms - stop.endMs)), 0);
}

/**
 * Time since the highlight came to rest on item `index`, in ms, for its
 * shine: undefined for any other item and before it lands. The shine draws
 * nothing once it has crossed (see `shineBand`), so it plays once.
 */
export function highlightShineMs(stops: readonly HighlightStop[], index: number, ms: number): number | undefined {
  const rest = stops.at(-1);
  return rest === undefined || rest.index !== index || ms < rest.startMs ? undefined : ms - rest.startMs;
}
