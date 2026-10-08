// Readability time: a scene must stay on screen long enough to read its text,
// at least 1.5 s plus 0.25 s per word. Caption words are not counted: the
// caption follows the narration, which already sets the scene's length.

import type { Timeline } from "../engine/timeline";
import type { FrameMeasurement } from "./types";

export const BASE_READ_MS = 1500;
export const MS_PER_WORD = 250;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Shortest time on screen for `words` words of text. */
export function minReadMs(words: number): number {
  return words === 0 ? 0 : BASE_READ_MS + MS_PER_WORD * words;
}

/** Words of scene text (not caption) on one frame, whether or not it has faded in yet. */
export function sceneWords(measurement: FrameMeasurement): number {
  return measurement.texts.filter((text) => !text.caption).reduce((sum, text) => sum + countWords(text.text), 0);
}

/** A message if a scene of `sceneMs` is too short for `words` words, else undefined. */
export function checkReadability(sceneMs: number, words: number): string | undefined {
  const needed = minReadMs(words);
  if (sceneMs + 0.5 >= needed) return undefined;
  const s = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
  return `scene is on screen for ${s(sceneMs)} but its ${words} word${words === 1 ? "" : "s"} need at least ${s(needed)} to read`;
}

/** How long a timeline scene lasts, in ms. */
export function sceneMs(timeline: Timeline, sceneIndex: number): number {
  return (timeline.scenes[sceneIndex]!.frames / timeline.fps) * 1000;
}
