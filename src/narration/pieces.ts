// Keeps each thing the voice is asked to say within what the model can take
// (510 phoneme ids). A long sentence is split again at commas, semicolons and
// colons, then at spaces. Phonemes are estimated at one per character of the
// normalized text, which is close for English. Pure.

import { normalizeText } from "./normalize";

/** The most phonemes the model accepts in one go. */
export const MAX_PHONEMES = 510;
/** Pieces are split to stay under this, leaving room for the estimate being off. */
const BUDGET = 400;

function estimate(text: string): number {
  return normalizeText(text).length;
}

/** The error for text that cannot be spoken in one go; `phonemes` is the count that was too many. */
export function tooLongError(phonemes: number, text: string): Error {
  const words = text.trim().split(/\s+/).slice(0, 6).join(" ");
  return new Error(`sentence too long to speak (${phonemes} phonemes, max ${MAX_PHONEMES}): "${words}…"`);
}

/** Packs `parts` (joined by a space) into pieces within the budget. */
function pack(parts: string[]): string[] {
  const pieces: string[] = [];
  for (const part of parts) {
    const last = pieces.at(-1);
    if (last !== undefined && estimate(`${last} ${part}`) <= BUDGET) pieces[pieces.length - 1] = `${last} ${part}`;
    else pieces.push(part);
  }
  return pieces;
}

/** `sentence` as pieces to speak back to back: itself when short, else split at clause marks, then spaces. */
export function splitForSpeech(sentence: string): string[] {
  if (estimate(sentence) <= BUDGET) return [sentence];
  const clauses = sentence.split(/(?<=[,;:])\s+/).filter(Boolean);
  const pieces = pack(clauses).flatMap((clause) =>
    estimate(clause) <= BUDGET ? [clause] : pack(clause.split(/\s+/).filter(Boolean)),
  );
  for (const piece of pieces) {
    const size = estimate(piece);
    if (size > MAX_PHONEMES) throw tooLongError(size, piece);
  }
  return pieces;
}
