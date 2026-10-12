// Line-by-line headlines: `lines` on Headline and TitleCard, a hook that builds
// as it is spoken, each line entering on its own cue. The prop check, and when
// each line starts. Pure, apart from the hooks at the end.

import { useContext } from "react";
import { estimateLines } from "../layout/textFit";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole } from "../theme/types";
import type { TimedWord } from "./captionWords";
import { cueErrors, resolveCue, useCueMs, type Cue } from "./cues";
import { SceneWordsContext } from "./frameContext";
import { hasHeadlineWord, headlineTiming, headlineWords, type HeadlineMotion } from "./headlineMotion";

/** One line of a line-by-line headline: its text, and when it enters (by default the theme's line stagger after the line before). */
export interface HeadlineLine {
  text: string;
  at?: Cue;
}

export const MIN_LINES = 2;
export const MAX_LINES = 4;
const LINE_FIELDS = new Set(["text", "at"]);
/** Word cues are placed this far apart per word to order them without audio, so an offset only breaks ties on one word. */
const WORD_PLACE = 1e9;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  return value === undefined ? "nothing" : (JSON.stringify(value) ?? String(value));
}

/** Where a cue falls among the others, before any audio exists: a number in ms, or a word cue by its word's place in the narration. */
function cuePlace(cue: Cue, places: readonly TimedWord[]): { kind: "ms" | "word"; at: number } | undefined {
  if (typeof cue === "number") return { kind: "ms", at: cue };
  const at = resolveCue(cue, places, Number.NaN);
  return Number.isNaN(at) ? undefined : { kind: "word", at };
}

/**
 * Lines whose cue is not after an earlier line's. Cues of one kind are compared:
 * numbers by ms, word cues by where their word is in `narration` (then by offset).
 */
function orderErrors(lines: readonly HeadlineLine[], narration: string | undefined): string[] {
  const words = (narration ?? "").split(/\s+/).filter(Boolean);
  const places = words.map((text, i) => ({ text, startMs: i * WORD_PLACE, endMs: i * WORD_PLACE }));
  const placed = lines.map((line) => (line.at === undefined ? undefined : cuePlace(line.at, places)));
  const errors: string[] = [];
  placed.forEach((place, j) => {
    const i = placed.findIndex((earlier, k) => k < j && earlier !== undefined && place !== undefined && earlier.kind === place.kind && place.at <= earlier.at);
    if (i < 0) return;
    const how = place!.at < placed[i]!.at ? "is before" : "is at the same time as";
    errors.push(`lines[${j}].at (${describe(lines[j]!.at)}) ${how} lines[${i}].at (${describe(lines[i]!.at)}): line cues must be in increasing order`);
  });
  return errors;
}

/**
 * Problems with `lines` (and `emphasis` and `mark` with them) on a component
 * whose single text is `textKey`; `[]` when fine or when there are no lines.
 * Word cues are checked against `narration`, the scene's text.
 */
export function headlineLinesErrors(props: Record<string, unknown>, textKey: "text" | "title", narration: string | undefined): string[] {
  const { lines, emphasis, mark } = props;
  if (lines === undefined) {
    return typeof emphasis === "number" ? [`emphasis as a line index needs lines; for a single ${textKey} give one or two of its words`] : [];
  }
  const errors: string[] = [];
  if (props[textKey] !== undefined) errors.push(`lines and ${textKey}: give one, not both`);
  if (!Array.isArray(lines) || lines.length < MIN_LINES || lines.length > MAX_LINES) {
    errors.push(`lines must be a list of ${MIN_LINES} to ${MAX_LINES} lines { text, at? } (got ${describe(lines)})`);
    return errors;
  }
  lines.forEach((line: unknown, i) => {
    const at = `lines[${i}]`;
    if (!isObject(line)) {
      errors.push(`${at} must be { text, at? } (got ${describe(line)})`);
      return;
    }
    for (const key of Object.keys(line)) if (!LINE_FIELDS.has(key)) errors.push(`${at}: unknown field "${key}" (a line has text, at)`);
    if (typeof line.text !== "string" || line.text.trim() === "") errors.push(`${at}.text must be a non-empty string (got ${describe(line.text)})`);
    if (line.at !== undefined) errors.push(...cueErrors(line.at, narration).map((error) => `${at}.at: ${error}`));
  });
  if (emphasis !== undefined && !(typeof emphasis === "number" && Number.isInteger(emphasis) && emphasis >= 0 && emphasis < lines.length)) {
    errors.push(`emphasis with lines sets one line in the accent: a line index from 0 to ${lines.length - 1} (got ${describe(emphasis)})`);
  }
  if (errors.length > 0) return errors;
  const valid = lines as HeadlineLine[];
  if (mark !== undefined && markedLine(valid, mark) < 0) errors.push(`mark ${describe(mark)} is not a word of any line`);
  return [...errors, ...orderErrors(valid, narration)];
}

/**
 * Average glyph width in em at which a line is sure to sit on one row: bold
 * Source Sans 3 at the headline steps measures 0.40-0.50 em a character on
 * ordinary lines ("Who owes what?" is 0.50), so this leaves a small margin.
 * Narrower than `AVG_CHAR_EM`, which is generous for wrapped text.
 */
export const ONE_ROW_CHAR_EM = 0.52;

/** Whether every line is estimated to fit one row of `width` px at `size` px. */
export function linesOnOneRow(texts: readonly string[], width: number, size: number): boolean {
  return texts.every((text) => estimateLines(text, width, size, ONE_ROW_CHAR_EM) <= 1);
}

/**
 * The step for line-by-line text, from `steps` (largest first): the largest at
 * which every line sits on one row (`linesOnOneRow`) and the block, each line
 * one row, fits (`fits(step, ONE_ROW_CHAR_EM)`); failing that, the largest at
 * which the wrapped lines fit (`fits(step)`); failing that, undefined.
 */
export function lineStep<T extends TypeRole>(
  theme: Theme,
  aspect: Aspect,
  steps: readonly T[],
  texts: readonly string[],
  width: number,
  fits: (step: T, charEm?: number) => boolean,
): T | undefined {
  const oneRow = steps.find((step) => linesOnOneRow(texts, width, theme.type[step][aspect].size) && fits(step, ONE_ROW_CHAR_EM));
  return oneRow ?? steps.find((step) => fits(step));
}

/** The first line with the word `mark`, or -1. */
export function markedLine(lines: readonly { text: string }[], mark: unknown): number {
  return typeof mark === "string" ? lines.findIndex((line) => hasHeadlineWord(headlineWords(line.text), mark.trim())) : -1;
}

/**
 * How many lines, from the first, are entrances that a settled opening shows
 * landed at frame 0: the first, and any after it up to the next one with a cue.
 * A cued line is timed to the narration, so it builds on the scene clock (as
 * any cue does), and so do the lines that follow it.
 */
export function settlingLines(lines: readonly { at?: Cue }[]): number {
  const cued = lines.findIndex((line, i) => i > 0 && line.at !== undefined);
  return cued < 0 ? lines.length : cued;
}

/**
 * When each line starts, in ms: at its cue (`cueMs[i]`, ms on the clock the
 * line is drawn on), or, without one, the theme's line stagger after the last
 * word of the line before; the first line without a cue at `start`. Throws if a
 * cue is not after the cue before it.
 */
export function lineStarts(theme: Theme, texts: readonly string[], cueMs: readonly (number | undefined)[], start: number, motion: HeadlineMotion = "whole"): number[] {
  const { lineStaggerMs } = theme.motion["text.in"];
  let next = start;
  let cued: { index: number; ms: number } | undefined;
  return texts.map((text, i) => {
    const ms = cueMs[i];
    if (ms !== undefined) {
      if (cued !== undefined && ms <= cued.ms) {
        throw new Error(`lines[${i}] starts at ${Math.round(ms)} ms, not after lines[${cued.index}] at ${Math.round(cued.ms)} ms: line cues must be in increasing order`);
      }
      cued = { index: i, ms };
    }
    const at = ms ?? next;
    next = (headlineTiming(theme, headlineWords(text), at, motion).words.at(-1) ?? at) + lineStaggerMs;
    return at;
  });
}

/**
 * `lineStarts` for `lines` drawn on the component's motion clock. Drawn alone
 * (no scene words), a word cue is left out and its line follows the one before.
 */
export function useLineStarts(theme: Theme, lines: readonly HeadlineLine[], start: number, motion?: HeadlineMotion): number[] {
  // A storyboard's lines are fixed for the scene, so this calls the same hooks on every frame.
  const cues = lines.map((line) => (line.at === undefined ? undefined : useCueMs(line.at, Number.NaN)));
  return lineStarts(
    theme,
    lines.map((line) => line.text),
    cues.map((ms) => (ms === undefined || Number.isNaN(ms) ? undefined : ms)),
    start,
    motion,
  );
}

/**
 * Throws, naming `component`, on bad `lines` props. Drawn alone (no scene
 * words) word cues are not checked here (the storyboard's scene is).
 */
export function useHeadlineLinesCheck(component: string, props: Record<string, unknown>, textKey: "text" | "title"): void {
  const words = useContext(SceneWordsContext);
  const narration = words === undefined || words.length === 0 ? undefined : words.map((w) => w.text).join(" ");
  const { lines } = props;
  const alone = (line: unknown) => (isObject(line) && isObject(line.at) ? { ...line, at: undefined } : line);
  const checked = words === undefined && Array.isArray(lines) ? { ...props, lines: lines.map(alone) } : props;
  const errors = headlineLinesErrors(checked, textKey, narration);
  if (errors.length > 0) throw new Error(`${component}: ${errors.join("; ")}`);
}
