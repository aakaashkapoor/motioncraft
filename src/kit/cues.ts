// Cues: when a timed prop starts. A number is ms from the scene start; a word
// cue starts on a word of the scene's narration, resolved from the voice's
// measured word times (or their even estimate). The shared timing contract for
// motion that lands on what is being said. Pure, apart from `useCueMs`.

import { useContext } from "react";
import type { TimedWord } from "./captionWords";
import { SceneWordsContext, useMotionDelay } from "./frameContext";

/**
 * When something starts: ms from the scene start, or the start of the
 * `occurrence`-th (1-based, default 1) match of `word` in the scene's
 * narration plus `offsetMs` (default 0, may be negative). `word` may be a
 * phrase ("split the bill"): it matches consecutive words and starts on the first.
 */
export type Cue = number | { word: string; occurrence?: number; offsetMs?: number };

const CUE_FIELDS = new Set(["word", "occurrence", "offsetMs"]);

/** A word as matched: lowercase, without punctuation at either end. Empty for a token that is only punctuation. */
function normalize(token: string): string {
  return token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** The words of `text` as matched. */
function phraseWords(text: string): string[] {
  return text.split(/\s+/).map(normalize).filter(Boolean);
}

/** Indexes into `tokens` where `phrase` starts, skipping tokens that are only punctuation. */
function matches(tokens: readonly string[], phrase: readonly string[]): number[] {
  const kept = tokens.flatMap((token, index) => {
    const word = normalize(token);
    return word === "" ? [] : [{ word, index }];
  });
  const found: number[] = [];
  for (let i = 0; i + phrase.length <= kept.length; i++) {
    if (phrase.every((word, j) => kept[i + j]!.word === word)) found.push(kept[i]!.index);
  }
  return found;
}

/**
 * The cue in ms on the clock of `words` (the scene clock, for a scene's
 * words). A word that is not there, or not that many times, returns
 * `fallbackMs` when given and throws otherwise.
 */
export function resolveCue(cue: Cue, words: readonly TimedWord[], fallbackMs?: number): number {
  if (typeof cue === "number") return cue;
  const { word, occurrence = 1, offsetMs = 0 } = cue;
  const index = matches(
    words.map((w) => w.text),
    phraseWords(word),
  )[occurrence - 1];
  if (index !== undefined) return words[index]!.startMs + offsetMs;
  if (fallbackMs !== undefined) return fallbackMs;
  throw new Error(`cue: word ${JSON.stringify(word)}${occurrence === 1 ? "" : ` (occurrence ${occurrence})`} is not in the scene's words`);
}

function describe(value: unknown): string {
  return value === undefined ? "nothing" : JSON.stringify(value) ?? String(value);
}

/**
 * Problems with `cue` as written in a storyboard: its shape, and a word that is
 * not in `narration` (the scene's text, so it is checked before any audio
 * exists). A word cue needs narration.
 */
export function cueErrors(cue: unknown, narration: string | undefined): string[] {
  if (typeof cue === "number") return Number.isFinite(cue) && cue >= 0 ? [] : [`a cue in ms must be a number of 0 or more (got ${describe(cue)})`];
  if (typeof cue !== "object" || cue === null || Array.isArray(cue)) {
    return [`a cue must be ms from the scene start or { "word": ... } (got ${describe(cue)})`];
  }
  const raw = cue as Record<string, unknown>;
  const errors = Object.keys(raw)
    .filter((key) => !CUE_FIELDS.has(key))
    .map((key) => `unknown cue field "${key}" (a cue has word, occurrence, offsetMs)`);
  const { word, occurrence, offsetMs } = raw;
  const phrase = typeof word === "string" ? phraseWords(word) : [];
  if (phrase.length === 0) errors.push(`word must be a word or phrase of the scene's narration (got ${describe(word)})`);
  if (occurrence !== undefined && !(typeof occurrence === "number" && Number.isInteger(occurrence) && occurrence > 0)) {
    errors.push(`occurrence must be a whole number of 1 or more (got ${describe(occurrence)})`);
  }
  if (offsetMs !== undefined && !(typeof offsetMs === "number" && Number.isFinite(offsetMs))) {
    errors.push(`offsetMs must be a number of ms (got ${describe(offsetMs)})`);
  }
  if (errors.length > 0) return errors;
  if (narration === undefined) return [`word cue ${describe(word)} needs narration: this scene has none`];
  const count = matches(narration.split(/\s+/), phrase).length;
  if (count === 0) return [`word ${describe(word)} is not in this scene's narration`];
  const nth = (occurrence as number | undefined) ?? 1;
  if (nth > count) return [`word ${describe(word)} occurs ${count === 1 ? "once" : `${count} times`} in this scene's narration, so occurrence ${nth} is not there`];
  return [];
}

/**
 * The cue in ms on the component's motion clock (`useSceneTime(...).ms`). A
 * word cue lands on its word in the scene even inside a `MotionDelay`; a
 * number, like any ms prop, counts on the component's own clock. Drawn alone
 * (no scene words), a word cue starts at `fallbackMs`, 0 by default; in a
 * scene, a word that is not there throws unless `fallbackMs` is given.
 */
export function useCueMs(cue: Cue, fallbackMs?: number): number {
  const words = useContext(SceneWordsContext);
  const delay = useMotionDelay();
  if (typeof cue === "number") return cue;
  if (words === undefined) return fallbackMs ?? 0;
  // NaN marks "not found", so a fallback is not moved by the delay.
  const ms = resolveCue(cue, words, fallbackMs === undefined ? undefined : Number.NaN);
  return Number.isNaN(ms) ? fallbackMs! : ms - delay;
}
