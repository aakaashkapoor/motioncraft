// When each word of the narration is spoken. The synthesizer reports no word
// times, so each sentence's measured span is shared out by word weight. Pure.

import type { TimedWord } from "../kit/captionWords";

/** A word's weight: its letters and digits plus one, and three more when a pause follows it. */
function weight(word: string): number {
  const letters = word.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return letters + 1 + (/[,;:]$/.test(word) ? 3 : 0);
}

/** The words of each sentence timed across its span, with no gaps inside a sentence. */
export function alignWords(sentences: readonly { text: string; startMs: number; endMs: number }[]): TimedWord[] {
  return sentences.flatMap(({ text, startMs, endMs }) => {
    const words = text.split(/\s+/).filter(Boolean);
    const weights = words.map(weight);
    const total = weights.reduce((sum, w) => sum + w, 0);
    let spent = 0;
    return words.map((word, i) => {
      const start = startMs + ((endMs - startMs) * spent) / total;
      spent += weights[i]!;
      const end = i === words.length - 1 ? endMs : startMs + ((endMs - startMs) * spent) / total;
      return { text: word, startMs: start, endMs: end };
    });
  });
}
