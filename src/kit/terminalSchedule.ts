// When a terminal's lines appear, type and scroll away (design v3, life #10),
// as pure timing and geometry. Lines appear one after another once the window
// has faded in; a command pauses on its empty prompt, then types with the
// `typing` token's jittered keystrokes; output appears the moment the command
// before it has been typed; a fresh prompt waits at the end. Text stays at the
// mono step: once the window is full, it scrolls with the `enter` spring. A line
// scrolling out of view fades as it glides up and is gone before it reaches the
// window's edge, and a new line fades in once the scroll has made room for it,
// so no visible line is ever cut off.

import type { Seed } from "../engine/random";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { estimateLines } from "../layout/textFit";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import type { SceneTime } from "./frameContext";
import { fade, fitSequence, tween } from "./motion";
import { typingSpan } from "./typing";
import { MONO_ADVANCE, maxInnerHeight, windowMetrics, windowWidth } from "./windowLayout";

export interface TerminalLine {
  /** A typed command (true) or program output (default). */
  prompt?: boolean;
  text: string;
}

/** When a line appears and, for prompt lines, when typing starts and ends, in ms from the scene's start. */
export interface TerminalLineTiming {
  start: number;
  typeStart: number;
  end: number;
}

/** A line, or the fresh prompt at the end, as scheduled. */
export interface TerminalEntry extends TerminalLineTiming {
  /** When each typed character lands (none for output and the fresh prompt). */
  chars: number[];
  /** When it has scrolled out of view and is no longer drawn; Infinity while it stays. */
  leave: number;
}

export interface TerminalScroll {
  /** When the scroll starts, in ms. */
  at: number;
  rows: number;
}

export interface TerminalSchedule {
  /** The mono size in px: the ramp's, never shrunk. */
  size: number;
  rowHeight: number;
  /** How many rows the window shows. */
  visibleRows: number;
  /** Room around the rows inside the window's clipping edge, in px. */
  padding: number;
  /** Each entry's rows, as laid out: every line, then the fresh prompt. */
  rows: number[];
  /** Every line, then the fresh prompt (it appears at `start` and never types). */
  entries: TerminalEntry[];
  scrolls: TerminalScroll[];
}

export const PROMPT_MARKER = "$";
/** Stands in for the caret when counting a line's characters: one more, on the last word. */
const CARET_ROOM = "_";

/** The text each entry lays out, for counting its rows. */
function entryTexts(lines: readonly TerminalLine[]): string[] {
  return [...lines.map((line) => (line.prompt ? `${PROMPT_MARKER} ${line.text}${CARET_ROOM}` : line.text)), `${PROMPT_MARKER} ${CARET_ROOM}`];
}

/** How far the content has scrolled at `ms`, in rows: each scroll follows the `enter` spring. */
function scrolledAt(theme: Theme, scrolls: readonly TerminalScroll[], ms: number): number {
  return scrolls.reduce((sum, s) => sum + s.rows * tween(theme.motion.enter, ms - s.at), 0);
}

/**
 * When `past` first holds after `from`, as [the last ms it does not, the first
 * ms it does], to within half a ms; undefined if it does not within `span`.
 * `past` must stay true once it is.
 */
function whenPast(from: number, span: number, past: (ms: number) => boolean): [number, number] | undefined {
  if (!past(from + span)) return undefined;
  if (past(from)) return [from, from];
  let [lo, hi] = [from, from + span];
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (past(mid)) hi = mid;
    else lo = mid;
  }
  return [lo, hi];
}

/** The window in rows: how many show, and how far past them a line may be and still sit inside the clipping edge. */
interface RowLayout {
  rows: readonly number[];
  visibleRows: number;
  /** Below the last row: a line rising in may start this low. */
  slackRows: number;
  /** Above the first row: where the window's clipping edge is. */
  edgeRows: number;
}

interface Plan {
  entries: TerminalEntry[];
  scrolls: TerminalScroll[];
  /** Time spent waiting for scrolls to make room, in ms. */
  waited: number;
}

/**
 * Lays the entries out in time with typing at `pace`. Each entry is due when
 * the one before it ends; one that overflows the window starts a scroll as it
 * comes due and appears once the scroll has brought its bottom within
 * `slackRows` of the last row. A line the scroll pushes out of view (even
 * partly) leaves just before it would cross the clipping edge, so it fades as
 * it glides up rather than being cut off.
 */
function plan(theme: Theme, lines: readonly TerminalLine[], layout: RowLayout, seed: Seed, pace: number): Plan {
  const { rows, visibleRows, slackRows, edgeRows } = layout;
  const span = theme.motion.enter.ms;
  const entries: TerminalEntry[] = [];
  const scrolls: TerminalScroll[] = [];
  const scrolled = (ms: number) => scrolledAt(theme, scrolls, ms);
  /** For each line pushed out of view, when the scroll that pushes it starts. */
  const pushed = new Map<number, number>();
  let due = theme.motion.leadMs + theme.motion.fx.ms;
  let total = 0;
  let target = 0;
  let waited = 0;
  for (let i = 0; i <= lines.length; i++) {
    total += rows[i]!;
    let start = due;
    if (total - visibleRows > target) {
      scrolls.push({ at: due, rows: total - visibleRows - target });
      target = total - visibleRows;
      let top = 0;
      for (let k = 0; k < i; k++) {
        if (top < target && !pushed.has(k)) pushed.set(k, due);
        top += rows[k]!;
      }
      const bottom = total;
      start = whenPast(due, span, (ms) => bottom - scrolled(ms) <= visibleRows + slackRows)?.[1] ?? due;
      waited += start - due;
    }
    const line = lines[i];
    if (line?.prompt) {
      const typing = typingSpan(theme, line.text, start, `${seed}:${i}`, pace);
      entries.push({ start, typeStart: typing.typeStart, end: typing.end, chars: typing.chars, leave: Infinity });
    } else {
      entries.push({ start, typeStart: start, end: start, chars: [], leave: Infinity });
    }
    due = entries[i]!.end;
  }
  // With every scroll known: each pushed line leaves before its top passes the edge (or as its scroll settles).
  let top = 0;
  entries.forEach((entry, k) => {
    const from = pushed.get(k);
    const rowsAbove = top;
    top += rows[k]!;
    if (from !== undefined) entry.leave = whenPast(from, span, (ms) => rowsAbove - scrolled(ms) < -edgeRows)?.[0] ?? from + span;
  });
  return { entries, scrolls, waited };
}

/**
 * Plays the plan at the pace that fits the scene: typing that would run into
 * the exit speeds up so the fresh prompt appears before it; waits for a
 * scroll stay as they are.
 */
function fittedPlan(theme: Theme, lines: readonly TerminalLine[], layout: RowLayout, seed: Seed, time?: SceneTime): Plan {
  const natural = plan(theme, lines, layout, seed, 1);
  if (time === undefined) return natural;
  const first = theme.motion.leadMs + theme.motion.fx.ms;
  const pace = fitSequence(theme, time, first + natural.waited, natural.entries.at(-1)!.start, theme.motion.enter.ms);
  return pace === 1 ? natural : plan(theme, lines, layout, seed, pace);
}

/**
 * Every line's timing, in ms, ignoring the window's height (nothing scrolls).
 * The first line appears once the window has faded in; each line after appears
 * when the one before it ends; a prompt line pauses, then types (see
 * `typingSpan`), and an output line ends as it appears. Given the scene's
 * time, typing that would run into the exit speeds up to finish before it.
 */
export function terminalTiming(theme: Theme, lines: readonly TerminalLine[], time?: SceneTime, seed: Seed = 0): TerminalLineTiming[] {
  const layout = { rows: entryTexts(lines).map(() => 1), visibleRows: Infinity, slackRows: 0, edgeRows: 0 };
  return fittedPlan(theme, lines, layout, seed, time)
    .entries.slice(0, lines.length)
    .map(({ start, typeStart, end }) => ({ start, typeStart, end }));
}

export interface TerminalScheduleOptions {
  /** The slot the window sits in; the content area by default. */
  area?: Rect;
  time?: SceneTime;
  seed?: Seed;
}

/** The terminal's layout in rows and its whole timeline, scrolls included. */
export function terminalSchedule(theme: Theme, aspect: Aspect, lines: readonly TerminalLine[], { area, time, seed = 0 }: TerminalScheduleOptions = {}): TerminalSchedule {
  const box = area ?? contentArea(theme, aspect);
  const { inner } = windowWidth(theme, aspect, box);
  const mono = theme.type.mono[aspect];
  const rowHeight = mono.size * mono.lineHeight;
  // Lines wrap at their spaces (`pre-wrap`), breaking a word only when it is too long.
  const rows = entryTexts(lines).map((text) => Math.max(1, estimateLines(text, inner, mono.size, MONO_ADVANCE)));
  const fits = Math.max(1, Math.floor(maxInnerHeight(theme, aspect, box) / rowHeight));
  const visibleRows = Math.min(fits, rows.reduce((sum, n) => sum + n, 0));
  const padding = windowMetrics(theme, aspect).padding;
  // A new line rises into place, so it may start lower by its rise and still be inside the window.
  const slackRows = Math.max(0, padding - theme.spacing.xxs) / rowHeight;
  const { entries, scrolls } = fittedPlan(theme, lines, { rows, visibleRows, slackRows, edgeRows: padding / rowHeight }, seed, time);
  return { size: mono.size, rowHeight, visibleRows, padding, rows, entries, scrolls };
}

export interface TerminalEntryFrame {
  /** Drawn: it has appeared and not yet scrolled away. */
  shown: boolean;
  opacity: number;
  /** How far below its place it still is as it rises in, in px. */
  rise: number;
  /** Its top below the top of the rows, in px, scrolled (before its rise). */
  top: number;
}

export interface TerminalFrame {
  /** Rows scrolled so far (springs may overshoot a little). */
  scroll: number;
  /** How far the drawn lines are moved down from the top of the rows, in px. */
  offset: number;
  entries: TerminalEntryFrame[];
}

/**
 * Where everything is at `ms`. An entry fades in over the `typing` token and
 * rises `spacing.xxs` into place; a line scrolling away fades out (`fx.fast`)
 * as it glides up and is dropped before it reaches the window's edge, so the
 * drawn lines stack from the top, moved down by `offset`.
 */
export function terminalFrame(theme: Theme, schedule: TerminalSchedule, ms: number): TerminalFrame {
  const { typing } = theme.motion;
  const fast = theme.motion["fx.fast"];
  const scroll = scrolledAt(theme, schedule.scrolls, ms);
  let rowsAbove = 0;
  let dropped = 0;
  const entries = schedule.entries.map((entry, i): TerminalEntryFrame => {
    const top = (rowsAbove - scroll) * schedule.rowHeight;
    rowsAbove += schedule.rows[i]!;
    if (entry.leave <= ms) dropped += schedule.rows[i]!;
    const shown = ms >= entry.start && ms < entry.leave;
    if (!shown) return { shown, opacity: 0, rise: 0, top };
    const opacity = Math.min(fade(typing, ms - entry.start), 1 - fade(fast, ms - (entry.leave - fast.ms)));
    return { shown, opacity, rise: (1 - tween(typing, ms - entry.start)) * theme.spacing.xxs, top };
  });
  return { scroll, offset: (dropped - scroll) * schedule.rowHeight, entries };
}
