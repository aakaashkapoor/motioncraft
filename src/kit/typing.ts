// Typing with a live caret (design v3, life #10), as pure timing: when each
// keystroke lands, from the theme's `typing` token with seeded jitter, so the
// same seed types the same way on every render; and how the caret blinks.

import { random, type Seed } from "../engine/random";
import type { Theme } from "../theme/types";

/** The pause on an empty prompt or field before typing starts, in mean keystrokes. */
const PAUSE_KEYSTROKES = 6;
/** Punctuation that ends a clause: a typist pauses after it when a space follows. */
const CLAUSE_END = /[,.;:!?]/;

/**
 * When each character of `text` lands, in ms after typing starts: entry `i`
 * is when `text[i]` shows. Each gap is the token's mean keystroke varied by
 * up to its `jitter` either way; the space after clause punctuation waits a
 * further `pauseMinMs`-`pauseMaxMs`. Deterministic for a seed.
 */
export function typingTimes(theme: Theme, text: string, seed: Seed = 0): number[] {
  const { cps, jitter, pauseMinMs, pauseMaxMs } = theme.motion.typing;
  const mean = 1000 / cps;
  const chars = [...text];
  let at = 0;
  return chars.map((ch, i) => {
    at += mean * (1 + jitter * (2 * random(`${seed}:${i}`) - 1));
    if (i > 0 && /\s/.test(ch) && CLAUSE_END.test(chars[i - 1]!)) at += pauseMinMs + (pauseMaxMs - pauseMinMs) * random(`${seed}:${i}:pause`);
    return at;
  });
}

/** How many characters show at `ms`, given when each lands (ascending, on the same clock). */
export function typedCount(chars: readonly number[], ms: number): number {
  let count = 0;
  while (count < chars.length && chars[count]! <= ms) count++;
  return count;
}

/** The pause on an empty prompt or field before typing starts, in ms at natural pace. */
export function typingPauseMs(theme: Theme): number {
  return (PAUSE_KEYSTROKES * 1000) / theme.motion.typing.cps;
}

/** One piece of text typed into a field, in ms on the scene clock. */
export interface TypingSpan {
  /** The caret appears on the empty field. */
  start: number;
  /** Typing starts, after a short pause. */
  typeStart: number;
  /** When each character lands. */
  chars: number[];
  /** The last character lands (`typeStart` for empty text). */
  end: number;
}

/**
 * `text` typed into a field whose caret appears at `start`: a short pause,
 * then its keystrokes (see `typingTimes`), the pause and every gap scaled by
 * `pace` (below 1 to fit a short scene).
 */
export function typingSpan(theme: Theme, text: string, start: number, seed: Seed = 0, pace = 1): TypingSpan {
  const typeStart = start + typingPauseMs(theme) * pace;
  const chars = typingTimes(theme, text, seed).map((t) => typeStart + t * pace);
  return { start, typeStart, chars, end: chars.at(-1) ?? typeStart };
}

/** `text` as typed by `ms`. */
export function typedText(text: string, span: TypingSpan, ms: number): string {
  return [...text].slice(0, typedCount(span.chars, ms)).join("");
}

/** Caret opacity `ms` after it starts blinking: a smooth blink, fully on as it starts, off half a period later. */
export function caretBlink(theme: Theme, ms: number): number {
  return 0.5 + 0.5 * Math.cos((2 * Math.PI * ms) / theme.motion.typing.blinkMs);
}
