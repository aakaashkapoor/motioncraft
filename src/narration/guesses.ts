// The narration words the voice will guess: found in no dictionary and no
// rule, so sounded out letter by letter, and often said wrong. `scripts/check.ts`
// warns about each one (`narration-guess`) so the author can listen to it or
// add a `pronounce` entry. Reads the dictionaries only when already cached.

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Storyboard } from "../storyboard/types";
import { GOLD_FILE, SILVER_FILE } from "./assets";
import { normalizeText } from "./normalize";
import { createWordPhonemizer, type Lexicon, type WordPhonemes } from "./phonemes";
import { pronunciationsIn, spokenPlan } from "./pronounce";
import { splitSentences } from "./sentences";
import { BUILTIN_PRONOUNCE } from "./terms";

export interface GuessedWord {
  sceneId: string;
  /** The word as spoken, without the punctuation around it. */
  word: string;
  /** How the voice will say it. */
  phonemes: string;
}

/** A word with the punctuation before and after it set aside. */
const CORE = /^[\p{P}\p{S}]*(.*?)[\p{P}\p{S}]*$/u;

/**
 * Each word of each narrated scene that `phonemize` guesses, once per scene, in
 * order. A word the `pronounce` map (built-in, then the storyboard's) names is
 * never reported, nor a word of the respelling it is said as.
 */
export function guessedWords(storyboard: Storyboard, phonemize: (words: readonly string[]) => WordPhonemes): GuessedWord[] {
  const pronounce = { ...BUILTIN_PRONOUNCE, ...storyboard.pronounce };
  const guesses: GuessedWord[] = [];
  for (const scene of storyboard.scenes) {
    if (scene.narration === undefined) continue;
    const seen = new Set<string>();
    for (const sentence of splitSentences(scene.narration)) {
      const respelled = new Set(pronunciationsIn(sentence, pronounce).flatMap(([, said]) => said.split(" ")));
      const words = normalizeText(spokenPlan(sentence, pronounce).text).split(/\s+/).filter(Boolean);
      const { phonemes, spans, guessed } = phonemize(words);
      for (const [i, written] of words.entries()) {
        const word = CORE.exec(written)?.[1] ?? written;
        if (!guessed[i] || word === "" || seen.has(word) || Object.hasOwn(pronounce, word) || respelled.has(word)) continue;
        seen.add(word);
        guesses.push({ sceneId: scene.id, word, phonemes: phonemes.slice(spans[i]!.start, spans[i]!.end) });
      }
    }
  }
  return guesses;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** The voice's dictionaries when both are already in `cacheDir`, else undefined. Never downloads. */
export async function loadCachedLexicons(cacheDir: string): Promise<{ gold: Lexicon; silver: Lexicon } | undefined> {
  const [goldPath, silverPath] = [GOLD_FILE, SILVER_FILE].map((file) => join(cacheDir, file.path)) as [string, string];
  if (!(await exists(goldPath)) || !(await exists(silverPath))) return undefined;
  const read = async (path: string): Promise<Lexicon> => JSON.parse(await readFile(path, "utf8")) as Lexicon;
  return { gold: await read(goldPath), silver: await read(silverPath) };
}

export function formatGuess(guess: GuessedWord): string {
  return `warning [narration-guess] scene "${guess.sceneId}": "${guess.word}" is not in the voice's dictionary and will be guessed (/${guess.phonemes}/); listen to it, or add it to "pronounce"`;
}

/** One `narration-guess` warning line per guessed word; none when the dictionaries are not cached. */
export async function narrationGuessWarnings(storyboard: Storyboard, cacheDir: string): Promise<string[]> {
  if (!storyboard.scenes.some((scene) => scene.narration !== undefined)) return [];
  const lexicons = await loadCachedLexicons(cacheDir);
  if (lexicons === undefined) return [];
  return guessedWords(storyboard, createWordPhonemizer(lexicons.gold, lexicons.silver)).map(formatGuess);
}
