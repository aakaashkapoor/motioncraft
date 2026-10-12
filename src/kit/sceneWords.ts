// A scene's narration words on the scene clock, for word cues: the voice's
// measured times after the scene's lead, or, without cached audio (or with
// words that do not match the narration), an even estimate from the lead
// until the exit begins. The same timing the caption speaks to, without its
// read-ahead. Pure.

import type { Theme } from "../theme/types";
import { evenWordTimes, type TimedWord } from "./captionWords";
import { exitMs } from "./motion";

/**
 * The words of `text` on the scene clock. `spoken` are the measured words on
 * the audio clock, one per word of `text`; the scene's last frame is at `endMs`.
 */
export function sceneWords(theme: Theme, text: string, endMs: number, spoken?: readonly TimedWord[]): TimedWord[] {
  const { leadMs } = theme.motion;
  if (spoken !== undefined && spoken.length > 0 && spoken.length === text.split(/\s+/).filter(Boolean).length) {
    return spoken.map((word) => ({ ...word, startMs: word.startMs + leadMs, endMs: word.endMs + leadMs }));
  }
  return evenWordTimes(text, leadMs, endMs - exitMs(theme, theme.motion.fx.ms));
}
