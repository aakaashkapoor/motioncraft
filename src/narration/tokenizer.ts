// Phoneme string to Kokoro token ids, as tokenizer.json does: one id per
// character, characters outside the vocabulary dropped, `$` (id 0) at both ends.

/** The most phoneme ids the model accepts between the two `$` ends. */
export const MAX_PHONEME_IDS = 510;

/** How many characters of `phonemes` the vocabulary knows, before any cap. */
export function countPhonemes(phonemes: string, vocab: Readonly<Record<string, number>>): number {
  return [...phonemes].filter((char) => Object.hasOwn(vocab, char)).length;
}

export function encodePhonemes(phonemes: string, vocab: Readonly<Record<string, number>>): number[] {
  const ids: number[] = [];
  for (const char of phonemes) {
    const id = Object.hasOwn(vocab, char) ? vocab[char] : undefined;
    if (id !== undefined && ids.length < MAX_PHONEME_IDS) ids.push(id);
  }
  return [0, ...ids, 0];
}
