// Chatterbox says when nothing is said, so its word times are borrowed from
// Kokoro saying the same line: Kokoro's words are moved from Kokoro's sound
// onto Chatterbox's by a linear map of one sound span onto the other. Kokoro's
// length also tells a line that dropped or repeated words. Pure.

import { SPEECH_LEVEL } from "./silence";

export interface WordSpan {
  startSample: number;
  endSample: number;
}

export interface SoundSpan {
  /** The first loud sample. */
  first: number;
  /** The last loud sample. */
  last: number;
}

/** Where the sound of a recording is, or undefined when it is silent. */
export function soundSpan(samples: Float32Array): SoundSpan | undefined {
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]!) < SPEECH_LEVEL) first++;
  if (first === samples.length) return undefined;
  let last = samples.length - 1;
  while (Math.abs(samples[last]!) < SPEECH_LEVEL) last--;
  return { first, last };
}

/** `words`, timed on a recording whose sound is `from`, moved onto another recording of the same line whose sound is `to`. */
export function stretchWords(words: readonly WordSpan[], from: SoundSpan, to: SoundSpan): WordSpan[] {
  const scale = from.last > from.first ? (to.last - to.first) / (from.last - from.first) : 0;
  const move = (sample: number): number => Math.min(Math.max(to.first + (sample - from.first) * scale, to.first), to.last);
  return words.map(({ startSample, endSample }) => ({ startSample: move(startSample), endSample: move(endSample) }));
}

const SHORTEST = 0.6;
const LONGEST = 1.6;

/** Whether a line that took `seconds` is a plausible saying of one Kokoro said in `referenceSeconds`. */
export function plausibleLength(seconds: number, referenceSeconds: number): boolean {
  return seconds >= referenceSeconds * SHORTEST && seconds <= referenceSeconds * LONGEST;
}
