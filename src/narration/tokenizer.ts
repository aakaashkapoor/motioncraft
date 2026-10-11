// Phoneme string to Kokoro token ids, as tokenizer.json does: one id per
// character, characters outside the vocabulary dropped, `$` (id 0) at both ends.

/** The most phoneme ids the model accepts between the two `$` ends. */
export const MAX_PHONEME_IDS = 510;

/** How many characters of `phonemes` the vocabulary knows, before any cap. */
export function countPhonemes(phonemes: string, vocab: Readonly<Record<string, number>>): number {
  return [...phonemes].filter((char) => Object.hasOwn(vocab, char)).length;
}

/**
 * The ids for `phonemes` (see `encodePhonemes`) and, for each UTF-16 index of
 * `phonemes`, the index in `ids` of its id, or undefined when the character
 * has none (outside the vocabulary, or past the cap). Index 0 is the leading
 * `$`, so the first phoneme with an id maps to 1.
 */
export function encodePhonemesMapped(
  phonemes: string,
  vocab: Readonly<Record<string, number>>,
): { ids: number[]; idOfChar: (number | undefined)[] } {
  const ids: number[] = [0];
  const idOfChar: (number | undefined)[] = [];
  for (const char of phonemes) {
    const id = Object.hasOwn(vocab, char) ? vocab[char] : undefined;
    let at: number | undefined;
    if (id !== undefined && ids.length - 1 < MAX_PHONEME_IDS) {
      at = ids.length;
      ids.push(id);
    }
    for (let unit = 0; unit < char.length; unit++) idOfChar.push(at);
  }
  ids.push(0);
  return { ids, idOfChar };
}

export function encodePhonemes(phonemes: string, vocab: Readonly<Record<string, number>>): number[] {
  return encodePhonemesMapped(phonemes, vocab).ids;
}
