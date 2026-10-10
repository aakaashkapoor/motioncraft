// Scene durations for narrated scenes without a `durationMs`: from the
// measured audio when it exists, else an estimate from the word count.

import { ownValue, outgoingTransition } from "../engine/timeline";
import type { SceneNarration } from "../narration/types";
import type { Storyboard } from "../storyboard/types";
import type { Theme } from "../theme/types";

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

/** Least silence after the last word of a narrated scene. */
export const NARRATION_TAIL_MS = 500;
/** Silence between the end of a scene voice and the next scene lead when a transition overlaps them. */
const TRANSITION_GAP_MS = 250;

/**
 * Silence after scene `sceneIndex` audio: the next scene starts a transition
 * early, so the tail covers the outgoing transition plus a gap (never less
 * than `NARRATION_TAIL_MS`). A cut, or the last scene, gets the plain tail.
 */
export function narrationTailMs(storyboard: Storyboard, sceneIndex: number, theme: Theme): number {
  const scene = storyboard.scenes[sceneIndex];
  if (scene === undefined || sceneIndex === storyboard.scenes.length - 1) return NARRATION_TAIL_MS;
  const { ms } = outgoingTransition(scene, theme);
  return ms === 0 ? NARRATION_TAIL_MS : Math.max(NARRATION_TAIL_MS, ms + TRANSITION_GAP_MS);
}

/**
 * Durations (ms) for narrated scenes without `durationMs` that have audio: the
 * scene lead, the audio and a tail, up to a whole frame at the storyboard fps.
 */
export function narrationDurations(
  storyboard: Storyboard,
  narration: Record<string, Pick<SceneNarration, "audioMs">>,
  theme: Theme,
): Record<string, number> {
  const durations: Record<string, number> = {};
  for (const [i, scene] of storyboard.scenes.entries()) {
    const audio = ownValue(narration, scene.id);
    if (scene.durationMs !== undefined || audio === undefined) continue;
    const ms = theme.motion.leadMs + audio.audioMs + narrationTailMs(storyboard, i, theme);
    durations[scene.id] = (Math.ceil((ms * storyboard.fps) / 1000 - 1e-9) * 1000) / storyboard.fps;
  }
  return durations;
}

/** Measured durations where narration audio exists, estimates for the other narrated scenes. */
export function sceneDurations(
  storyboard: Storyboard,
  narration: Record<string, Pick<SceneNarration, "audioMs">>,
  theme: Theme,
): Record<string, number> {
  return { ...estimateDurations(storyboard), ...narrationDurations(storyboard, narration, theme) };
}
