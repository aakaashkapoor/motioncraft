import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GOLD_FILE, SILVER_FILE } from "../src/narration/assets";
import { formatGuess, guessedWords, loadCachedLexicons, narrationGuessWarnings } from "../src/narration/guesses";
import { createWordPhonemizer, type Lexicon } from "../src/narration/phonemes";
import { validateStoryboard, type Storyboard } from "../src/index";

const gold: Lexicon = { the: "ðə", voice: "vˈYs", says: "sˈɛz", this: "ðˈɪs", line: "lˈIn", speaks: "spˈiks", A: "ˈA", P: "pˈi", I: "ˈI" };
const silver: Lexicon = { word: "wˈɜɹd" };
const phonemize = createWordPhonemizer(gold, silver);

function storyboard(narrations: (string | undefined)[], pronounce?: Record<string, string>): Storyboard {
  const scenes = narrations.map((narration, i) => ({
    id: `s${i}`,
    component: "TitleCard",
    props: { title: "t" },
    ...(narration === undefined ? { durationMs: 2000 } : { narration }),
  }));
  const result = validateStoryboard({ title: "Test", aspect: "9:16", scenes, ...(pronounce === undefined ? {} : { pronounce }) });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

describe("guessedWords", () => {
  it("reports a made-up word with its phonemes, and not a word in the lexicon", () => {
    const guesses = guessedWords(storyboard(["The voice says Zorbleflax. This word."]), phonemize);
    expect(guesses).toEqual([{ sceneId: "s0", word: "Zorbleflax", phonemes: expect.stringMatching(/^z.*ks$/) }]);
    expect(guesses[0]!.phonemes).toBe(phonemize(["Zorbleflax"]).phonemes);
  });

  it("does not report an all-caps word the voice spells out", () => {
    expect(guessedWords(storyboard(["The API says this."]), phonemize)).toEqual([]);
  });

  it("does not report a pronounce key, a built-in key, or the respelling it is said as", () => {
    const board = storyboard(["Zorbleflax says JSON, this Qwop line."], { Zorbleflax: "zorble flax", Qwop: "Kwop" });
    expect(guessedWords(board, phonemize)).toEqual([]);
  });

  it("reports a word once per scene, in each scene it is guessed in", () => {
    const board = storyboard(["Zorbleflax says Zorbleflax. Zorbleflax.", undefined, "This Zorbleflax line."]);
    expect(guessedWords(board, phonemize).map(({ sceneId, word }) => [sceneId, word])).toEqual([
      ["s0", "Zorbleflax"],
      ["s2", "Zorbleflax"],
    ]);
  });

  it("has nothing to check without narration", () => {
    expect(guessedWords(storyboard([undefined]), phonemize)).toEqual([]);
  });
});

describe("narrationGuessWarnings", () => {
  let cacheDir: string;
  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "mc-guesses-"));
  });
  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  const writeLexicon = async (file: typeof GOLD_FILE, lexicon: Lexicon) => {
    const path = join(cacheDir, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(lexicon));
  };

  it("warns about each guessed word, from the dictionaries in the cache", async () => {
    await writeLexicon(GOLD_FILE, gold);
    await writeLexicon(SILVER_FILE, silver);
    const lines = await narrationGuessWarnings(storyboard(["Kokoro speaks this line."]), cacheDir);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^warning \[narration-guess\] scene "s0": "Kokoro" is not in the voice's dictionary and will be guessed \(\/k\S+\/\); listen to it, or add it to "pronounce"$/,
    );
  });

  it("says nothing when the dictionaries were never downloaded", async () => {
    expect(await loadCachedLexicons(cacheDir)).toBeUndefined();
    expect(await narrationGuessWarnings(storyboard(["Kokoro speaks this line."]), cacheDir)).toEqual([]);
  });

  it("says nothing when only one dictionary is there", async () => {
    await writeLexicon(GOLD_FILE, gold);
    expect(await loadCachedLexicons(cacheDir)).toBeUndefined();
  });

  it("formats one guess", () => {
    expect(formatGuess({ sceneId: "intro", word: "Kokoro", phonemes: "kˈɑkɔɹɑ" })).toBe(
      'warning [narration-guess] scene "intro": "Kokoro" is not in the voice\'s dictionary and will be guessed (/kˈɑkɔɹɑ/); listen to it, or add it to "pronounce"',
    );
  });
});
