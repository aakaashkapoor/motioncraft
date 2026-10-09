// When each caption word is spoken, which page is up and which word is lit
// (design v3, life #4). There is no text-to-speech yet, so narration is split
// evenly, each word's share weighted by its length; measured word times can
// replace `evenWordTimes` later without changing the rest. Pure.

import { pageRanges, type CaptionLimits, type PageRange } from "./captionPages";
import { fade, type Timed } from "./motion";

/** A word of narration and when it is spoken, in ms on the scene clock. */
export interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
}

/** A caption page: its words (see `PageRange`) and when it comes up, the moment its first word is spoken. */
export interface TimedPage extends PageRange {
  startMs: number;
}

/**
 * The words of `text` spoken one after another from `startMs` to `endMs`,
 * with no gaps, each taking time in proportion to its length.
 */
export function evenWordTimes(text: string, startMs: number, endMs: number): TimedWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  const msPerChar = Math.max(0, endMs - startMs) / words.reduce((sum, word) => sum + word.length, 0);
  let at = startMs;
  return words.map((word) => {
    const start = at;
    at += word.length * msPerChar;
    return { text: word, startMs: start, endMs: at };
  });
}

/** `words` paged by `limits` (see `pageRanges`), each page timed by its first word. */
export function timedPages(words: readonly TimedWord[], limits: CaptionLimits): TimedPage[] {
  return pageRanges(
    words.map((word) => word.text),
    limits,
  ).map((page) => ({ ...page, startMs: words[page.start]!.startMs }));
}

/** The index of the page up at `ms`: the last to have come up, or the first before any has. */
export function pageIndexAt(pages: readonly TimedPage[], ms: number): number {
  let index = 0;
  while (index + 1 < pages.length && pages[index + 1]!.startMs <= ms) index++;
  return index;
}

/** The index of the word being spoken at `ms`, or undefined before the first word and after the last. */
export function activeWordAt(words: readonly TimedWord[], ms: number): number | undefined {
  const index = words.findIndex((word) => word.startMs <= ms && ms < word.endMs);
  return index < 0 ? undefined : index;
}

/**
 * How lit `word` is at `ms`, 0..1: it lights over `ramp.ms`, or over half the
 * word when that is shorter, as it starts, and dims over the same as it ends,
 * while the next word lights.
 */
export function wordLight(word: TimedWord, ms: number, ramp: Timed): number {
  const token = { ms: Math.min(ramp.ms, (word.endMs - word.startMs) / 2), curve: ramp.curve };
  if (!(token.ms > 0)) return word.startMs <= ms && ms < word.endMs ? 1 : 0;
  return fade(token, ms - word.startMs) - fade(token, ms - word.endMs);
}
