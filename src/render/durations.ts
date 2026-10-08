// Scene durations for stills before narration audio exists. Narrated scenes
// without a `durationMs` get an estimate from their word count; once the
// text-to-speech step lands, its measured audio lengths replace these.

import type { Storyboard } from "../storyboard/types";

/** A comfortable narration pace (~150 words per minute). */
const WORDS_PER_SECOND = 2.5;
/** Breathing room after the last word. */
const PAD_MS = 600;

export function estimateNarrationMs(narration: string): number {
  const words = narration.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / WORDS_PER_SECOND) * 1000 + PAD_MS);
}

/** Estimated durations (ms) for narrated scenes that have no `durationMs`. */
export function estimateDurations(storyboard: Storyboard): Record<string, number> {
  const durations: Record<string, number> = {};
  for (const scene of storyboard.scenes) {
    if (scene.durationMs === undefined && scene.narration !== undefined) {
      durations[scene.id] = estimateNarrationMs(scene.narration);
    }
  }
  return durations;
}
