// Shared narration types, free of Node imports so render and check code can use them.

import type { TimedWord } from "../kit/captionWords";

export interface SceneNarration {
  sceneId: string;
  wavPath: string;
  /** Length of the audio, in ms. */
  audioMs: number;
  /** When each word is spoken, in ms from the start of the scene's audio. */
  words: TimedWord[];
}

/** What the page needs of a scene's narration: its words, on the audio clock. */
export type PageNarration = Record<string, { words: TimedWord[] }>;

/** Cached narration, and the narrated scenes that had none. */
export interface CachedNarration {
  scenes: Record<string, SceneNarration>;
  /** Ids of narrated scenes with no usable cached audio. */
  missing: string[];
}
