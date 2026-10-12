// The word timings that come with a scene's own audio file: a JSON array of
// `{ text, startMs, endMs }` in ms from the start of the audio, and whether
// their words are the narration's words in order. Pure.

import type { TimedWord } from "../kit/captionWords";

export type ParsedWordTimes = { ok: true; words: TimedWord[] } | { ok: false; error: string };

const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** `raw` (a parsed words file) as `TimedWord`s, or what is wrong with it. */
export function parseWordTimes(raw: unknown): ParsedWordTimes {
  if (!Array.isArray(raw)) return { ok: false, error: "must be a JSON array of { text, startMs, endMs }" };
  for (const [i, word] of raw.entries()) {
    const w = word as Partial<TimedWord> | null;
    if (typeof w !== "object" || w === null || typeof w.text !== "string" || w.text.trim() === "" || !isTime(w.startMs) || !isTime(w.endMs)) {
      return { ok: false, error: `[${i}] must be { text, startMs, endMs } with a non-empty text and times in ms of at least 0 (got ${JSON.stringify(word)})` };
    }
    if (w.endMs < w.startMs) return { ok: false, error: `[${i}] ends (${w.endMs}) before it starts (${w.startMs})` };
  }
  return { ok: true, words: raw.map(({ text, startMs, endMs }: TimedWord) => ({ text, startMs, endMs })) };
}

/** A word without case or the punctuation around it. */
function core(word: string): string {
  return word.toLowerCase().replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
}

/** How `words` differ from the words of `narration` (case and punctuation aside), or undefined when they match in order. */
export function wordMismatch(narration: string, words: readonly Pick<TimedWord, "text">[]): string | undefined {
  const said = narration.split(/\s+/).filter(Boolean);
  if (said.length !== words.length) return `the narration has ${said.length} words and the words file ${words.length}`;
  const i = said.findIndex((word, k) => core(word) !== core(words[k]!.text));
  return i < 0 ? undefined : `word ${i + 1} of the narration is "${said[i]}" but the words file has "${words[i]!.text}"`;
}
