// The kinetic headline as numbers (design v3, life #3 and #6): when each word
// or character of a headline starts to land, where it is at any moment on its
// way in and out, which words carry the accent or the marker, and how far the
// marker has swept. Pure; `Headline.tsx` draws it.

import { stagger } from "../engine/choreography";
import type { Theme } from "../theme/types";
import { cascadeStep, fade, tween } from "./motion";

/** `whole`: the line lands as one (the default); `words`: word by word through a clipped line; `chars`: character by character. */
export const HEADLINE_MOTIONS = ["whole", "words", "chars"] as const;
export type HeadlineMotion = (typeof HEADLINE_MOTIONS)[number];

/** `bar`: a tilted bar of the accent behind the word; `underline`: a line of the accent under it. */
export const MARK_STYLES = ["bar", "underline"] as const;
export type MarkStyle = (typeof MARK_STYLES)[number];

// The shape of each motion, in shares of the line's height (bang-motion's recipes).
/** `words`: a word rises a whole line (`y 100% -> 0`) ... */
const WORD_RISE_SHARE = 1;
/** ... while a blur of this many px clears. */
const WORD_BLUR_PX = 8;
/** `chars`: a character rises 60% of the line (`yPercent 60 -> 0`) ... */
const CHAR_RISE_SHARE = 0.6;
/** ... from stretched this tall (`scaleY 1.45 -> 1`). */
const CHAR_FROM_SCALE = 1.45;
/** `whole`: the line's short rise. */
const LINE_RISE_SHARE = 0.4;
/** Leaving, words go up this far (`y -40%`). */
const EXIT_RISE_SHARE = 0.4;

/** The words of a headline: its text split on whitespace. */
export function headlineWords(text: string | undefined): string[] {
  return typeof text === "string" ? text.trim().split(/\s+/).filter(Boolean) : [];
}

export interface HeadlineTiming {
  /** When each word starts to land, in ms on the caller's clock. `whole`: all with the line; `chars`: with its first character. */
  words: number[];
  /** `chars` only: when each character of each word starts. */
  chars: number[][];
  /** When the entrance is over: the last word (or character) has landed. */
  landed: number;
  /** When the marker starts to sweep: `mark.delayMs` after the headline has landed. */
  mark: number;
}

/**
 * When a headline starting at `start` lands: as a whole on `text.in`; word by
 * word `text.in`'s stagger apart; or character by character on `text.char`.
 * A long headline staggers tighter, so it lands in about the first 1.2 s.
 */
export function headlineTiming(theme: Theme, words: readonly string[], start: number, motion: HeadlineMotion = "whole"): HeadlineTiming {
  const textIn = theme.motion["text.in"];
  if (motion === "chars") {
    const token = theme.motion["text.char"];
    const count = words.reduce((n, word) => n + [...word].length, 0);
    const step = cascadeStep(theme, count, token);
    let next = 0;
    const starts: number[] = [];
    const chars = words.map((word) => {
      starts.push(stagger(next, { start, step }));
      return [...word].map(() => stagger(next++, { start, step }));
    });
    const landed = stagger(Math.max(0, count - 1), { start, step }) + token.ms;
    return { words: starts, chars, landed, mark: landed + theme.motion.mark.delayMs };
  }
  const step = motion === "words" ? cascadeStep(theme, words.length, textIn) : 0;
  const starts = words.map((_, i) => stagger(i, { start, step }));
  const landed = (starts.at(-1) ?? start) + textIn.ms;
  return { words: starts, chars: [], landed, mark: landed + theme.motion.mark.delayMs };
}

/** The gap between words leaving: `text.out`'s stagger, tighter when the exit would outlast the exit token's longest. */
function leaveStep(theme: Theme, count: number): number {
  const out = theme.motion["text.out"];
  if (count <= 1) return 0;
  return Math.min(out.staggerMs, Math.max(0, theme.motion.exit.maxMs - out.ms) / (count - 1));
}

/**
 * How far word `index` of `count` has left, 0..1, `leftMs` before the scene's
 * last frame: in reading order on `text.out`, the last word gone on the last
 * frame. A whole line is one word of one.
 */
export function wordLeaving(theme: Theme, index: number, count: number, leftMs: number): number {
  const out = theme.motion["text.out"];
  return fade(out, out.ms + (count - 1 - index) * leaveStep(theme, count) - leftMs);
}

/** Where a piece of text is drawn: offset `y` in px, `opacity`, a `blur` in px and a vertical stretch. */
export interface TextPose {
  y: number;
  opacity: number;
  blur: number;
  scaleY: number;
}

/** Rounded for stable markup; `+ 0` turns -0 into 0. */
const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places + 0;

/** How far text `leaving` 0..1 has gone up, in px of a `line` px tall line. */
const lift = (leaving: number, line: number) => leaving * EXIT_RISE_SHARE * line;

/** A line landing as a whole, `sinceMs` into its `text.in` rise, `leaving` 0..1 on its way out. */
export function linePose(theme: Theme, line: number, sinceMs: number, leaving: number): TextPose {
  const textIn = theme.motion["text.in"];
  const rest = 1 - tween(textIn, sinceMs);
  return { y: round(rest * LINE_RISE_SHARE * line - lift(leaving, line)), opacity: round(fade(textIn, sinceMs) * (1 - leaving), 4), blur: 0, scaleY: 1 };
}

/** A word rising through its clipped line, `sinceMs` into its `text.in` rise, `leaving` 0..1 on its way out. */
export function wordPose(theme: Theme, line: number, sinceMs: number, leaving: number): TextPose {
  const textIn = theme.motion["text.in"];
  const shown = fade(textIn, sinceMs);
  const rest = 1 - tween(textIn, sinceMs);
  return {
    y: round(rest * WORD_RISE_SHARE * line - lift(leaving, line)),
    opacity: round(shown * (1 - leaving), 4),
    blur: round((1 - shown) * WORD_BLUR_PX),
    scaleY: 1,
  };
}

/** A character rising into place, `sinceMs` into its `text.char` rise. Its word carries the exit. */
export function charPose(theme: Theme, line: number, sinceMs: number): TextPose {
  const token = theme.motion["text.char"];
  const rest = 1 - tween(token, sinceMs);
  return { y: round(rest * CHAR_RISE_SHARE * line), opacity: round(fade(token, sinceMs), 4), blur: 0, scaleY: round(1 + rest * (CHAR_FROM_SCALE - 1), 4) };
}

/** A word in `chars` motion: still while its characters land, then leaving like any word. */
export function leavingPose(line: number, leaving: number): TextPose {
  return { y: round(-lift(leaving, line)), opacity: round(1 - leaving, 4), blur: 0, scaleY: 1 };
}

/** How far the marker has swept across its word, 0..1, `sinceMs` after it starts (the `mark` token). */
export function markSweep(theme: Theme, sinceMs: number): number {
  return round(fade(theme.motion.mark, sinceMs), 4);
}

/** Which words carry the accent and the marker, by index into the headline's words. */
export interface HeadlineMarks {
  emphasis: number[];
  mark?: number;
}

/** A word as `emphasis` and `mark` match it: lower case, without surrounding punctuation. */
const bare = (word: string) => word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/**
 * The words `emphasis` (one or two words, as a phrase or a list) and `mark`
 * (one word, not also emphasized) pick out of `words`. Matching ignores case
 * and punctuation. Throws, naming the problem, on anything else.
 */
export function headlineMarks(words: readonly string[], emphasis: unknown, mark: unknown): HeadlineMarks {
  const find = (word: string, taken: readonly number[]) => {
    const index = words.findIndex((w, i) => !taken.includes(i) && bare(w) === bare(word));
    if (index < 0) throw new Error(`"${word}" is not a word of the headline "${words.join(" ")}"`);
    return index;
  };
  const asked = emphasis === undefined ? [] : Array.isArray(emphasis) ? emphasis : [emphasis];
  if (!asked.every((e) => typeof e === "string")) throw new Error(`emphasis must be a word or a list of words (got ${JSON.stringify(emphasis)})`);
  const wanted = asked.flatMap((e: string) => headlineWords(e));
  if (wanted.length > 2) throw new Error(`emphasis sets one or two words in the accent (got ${wanted.length}: "${wanted.join(" ")}")`);
  const emphasized: number[] = [];
  for (const word of wanted) emphasized.push(find(word, emphasized));

  if (mark === undefined) return { emphasis: emphasized };
  if (typeof mark !== "string" || headlineWords(mark).length !== 1) throw new Error(`mark takes one word of the headline (got ${JSON.stringify(mark)})`);
  const marked = find(mark.trim(), []);
  if (emphasized.includes(marked)) throw new Error(`"${mark}" is both the mark and in emphasis; mark a word that is not emphasized`);
  return { emphasis: emphasized, mark: marked };
}
