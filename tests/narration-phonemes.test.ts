import { describe, expect, it } from "vitest";
import { createWordPhonemizer, type Lexicon } from "../src/narration/phonemes";

describe("createWordPhonemizer guessed", () => {
  const lex: Lexicon = {
    type: "tˈIp",
    one: "wˈʌn",
    prompt: "pɹˈɑmpt",
    and: "ænd",
    eight: "ˈAt",
    videos: "vˈɪdioz",
    A: "ˈA",
    P: "pˈi",
    I: "ˈI",
  };
  const run = createWordPhonemizer(lex, {});
  const words = ["Type", "one", "Zorbleflax", "prompt,", "and", "8", "API", "U.S.", "videos."];

  it("leaves the phonemes and spans byte-identical", () => {
    const { phonemes, spans } = run(words);
    expect(phonemes).toBe("tˈIp wˈʌn zˈɔɹblɛflæks pɹˈɑmpt, ænd ˈAt ˈApˈiˈI ˈʌs vˈɪdioz.");
    expect(spans).toEqual([
      { start: 0, end: 4 }, { start: 5, end: 9 }, { start: 10, end: 22 }, { start: 23, end: 30 }, { start: 32, end: 35 },
      { start: 36, end: 39 }, { start: 40, end: 47 }, { start: 48, end: 51 }, { start: 52, end: 59 },
    ]);
  });

  it("marks only the words sounded out by letter-to-sound rules", () => {
    const { guessed } = run(words);
    expect(guessed).toHaveLength(words.length);
    expect(guessed).toEqual([false, false, true, false, false, false, false, false, false]);
  });

  it("does not mark words found through the stem or compound rules", () => {
    expect(run(["typed", "prompts", "typing", "oneprompt"]).guessed).toEqual([false, false, false, false]);
  });

  it("gives a group of words that normalize together one shared answer", () => {
    expect(run(["Dr.", "Zorbleflax", "and"]).guessed).toEqual([true, true, false]);
  });

  it("has no entries for no words", () => {
    expect(run([]).guessed).toEqual([]);
  });
});
