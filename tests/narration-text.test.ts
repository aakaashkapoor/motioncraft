import { describe, expect, it } from "vitest";
import { normalizeText } from "../src/narration/normalize";
import { createPhonemizer, type Lexicon } from "../src/narration/phonemes";
import { encodePhonemes } from "../src/narration/tokenizer";
import { splitSentences } from "../src/narration/sentences";
import { alignWords } from "../src/narration/wordTimes";
import { decodeWav, encodeWav } from "../src/narration/wav";

describe("normalizeText", () => {
  it.each([
    ["He said “hi” and it’s fine", "He said \"hi\" and it's fine"],
    ["Dr. Smith met Mr. Jones", "Doctor Smith met Mister Jones"],
    ["Ms. Lee and Mrs. Kay", "Miss Lee and Mrs Kay"],
    ["since 1990s", "since nineteen nineties"],
    ["in 2024", "in twenty twenty-four"],
    ["at 9:41", "at nine forty-one"],
    ["at 9:00", "at nine o'clock"],
    ["at 9:05", "at nine oh five"],
    ["costs $12.50", "costs twelve dollars and fifty cents"],
    ["costs $1", "costs one dollar"],
    ["rated 4.8", "rated four point eight"],
    ["pages 2-3", "pages two to three"],
    ["1,200 frames", "one thousand two hundred frames"],
    ["42", "forty-two"],
    ["0", "zero"],
    ["305", "three hundred five"],
    ["7,000,000", "seven million"],
    ["3,000,000,000", "three billion"],
  ])("%s", (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });
});

const gold: Lexicon = {
  hello: "həlˈO",
  cat: "kæt",
  dog: "dɔɡ",
  kick: "kˈɪk",
  read: { VBD: "ɹɛd", DEFAULT: "ɹid" },
  lead: { NOUN: "lɛd", VERB: "lid" },
  both: "gold",
  A: "ˈA",
  I: "ˈI",
};
const silver: Lexicon = { both: "silver", onlysilver: "sˈɪlvəɹ" };

describe("createPhonemizer", () => {
  const phonemize = createPhonemizer(gold, silver);

  it("looks words up, lowercase as a second try, and keeps punctuation", () => {
    expect(phonemize("Hello, cat!")).toBe("həlˈO, kæt!");
    expect(phonemize("hello; cat: dog? cat.")).toBe("həlˈO; kæt: dɔɡ? kæt.");
  });

  it("prefers gold over silver and falls back to silver", () => {
    expect(phonemize("both")).toBe("gold");
    expect(phonemize("onlysilver")).toBe("sˈɪlvəɹ");
  });

  it("picks DEFAULT of a part-of-speech entry, else the first value", () => {
    expect(phonemize("read")).toBe("ɹid");
    expect(phonemize("lead")).toBe("lɛd");
  });

  it("adds a z, s or iz sound for a plural or possessive s", () => {
    expect(phonemize("dogs")).toBe("dɔɡz");
    expect(phonemize("cats")).toBe("kæts");
    expect(phonemize("dog's")).toBe("dɔɡz");
    expect(phonemize("kicks")).toBe("kˈɪks");
  });

  it("spells an unknown all-caps word letter by letter", () => {
    expect(phonemize("AI")).toBe("ˈAˈI");
  });

  it("gives an unknown word some pronunciation", () => {
    expect(phonemize("blorp").length).toBeGreaterThan(0);
    expect(phonemize("motioncraft")).toMatch(/\S/);
  });

  it("does not trip over words that are properties of Object", () => {
    expect(phonemize("constructor").length).toBeGreaterThan(0);
  });

  it("separates words with single spaces", () => {
    expect(phonemize("  cat   dog ")).toBe("kæt dɔɡ");
  });
});

describe("encodePhonemes", () => {
  const vocab = { $: 0, a: 1, b: 2, " ": 3 };

  it("wraps ids with 0, one per character, dropping unknown ones", () => {
    expect(encodePhonemes("ab Zb", vocab)).toEqual([0, 1, 2, 3, 2, 0]);
  });

  it("caps at 510 ids between the ends", () => {
    const ids = encodePhonemes("a".repeat(600), vocab);
    expect(ids).toHaveLength(512);
    expect(ids[0]).toBe(0);
    expect(ids.at(-1)).toBe(0);
  });

  it("is just the two ends for no phonemes", () => {
    expect(encodePhonemes("", vocab)).toEqual([0, 0]);
  });
});

describe("wav", () => {
  it("round-trips samples at 16-bit precision", () => {
    const samples = Float32Array.from([0, 0.5, -0.5, 1, -1, 0.25]);
    const decoded = decodeWav(encodeWav(samples, 24000));
    expect(decoded.sampleRate).toBe(24000);
    expect(decoded.samples).toHaveLength(6);
    samples.forEach((s, i) => expect(decoded.samples[i]!).toBeCloseTo(s, 3));
  });

  it("clamps out-of-range samples and writes a RIFF header", () => {
    const bytes = encodeWav(Float32Array.from([2, -2]), 8000);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("RIFF");
    expect(bytes).toHaveLength(48);
    expect(decodeWav(bytes).samples[0]).toBeCloseTo(1, 3);
    expect(decodeWav(bytes).samples[1]).toBeCloseTo(-1, 3);
  });

  it("rejects bytes that are not a WAV", () => {
    expect(() => decodeWav(new Uint8Array(20))).toThrow(/WAV/);
  });
});

describe("splitSentences", () => {
  it("splits at . ! ? and keeps the mark", () => {
    expect(splitSentences("One thing. Another! Really? Yes.")).toEqual(["One thing.", "Another!", "Really?", "Yes."]);
  });

  it("is one sentence when there is no terminal mark", () => {
    expect(splitSentences("no mark here")).toEqual(["no mark here"]);
    expect(splitSentences("Done. and then more")).toEqual(["Done.", "and then more"]);
  });

  it("ignores decimals and abbreviations", () => {
    expect(splitSentences("It scored 4.8 today. Dr. Lee agreed.")).toEqual(["It scored 4.8 today.", "Dr. Lee agreed."]);
  });

  it("keeps runs of marks and closing quotes with their sentence", () => {
    expect(splitSentences('Wait... what?! "Fine." Ok.')).toEqual(["Wait...", "what?!", '"Fine."', "Ok."]);
  });

  it("returns nothing for blank text", () => {
    expect(splitSentences("  ")).toEqual([]);
  });
});

describe("alignWords", () => {
  it("shares each sentence's span by word weight with no gaps", () => {
    // weights: "ab" 3, "cde," 3 + 1 + 3 = 7 ; total 10 over 1100 ms
    const [a, b] = alignWords([{ text: "ab cde,", startMs: 100, endMs: 1200 }]);
    expect(a).toEqual({ text: "ab", startMs: 100, endMs: 430 });
    expect(b!.text).toBe("cde,");
    expect(b!.startMs).toBeCloseTo(430);
    expect(b!.endMs).toBe(1200);
  });

  it("times each sentence within its own span", () => {
    const words = alignWords([
      { text: "one two", startMs: 0, endMs: 1000 },
      { text: "three", startMs: 1500, endMs: 2000 },
    ]);
    expect(words.map((w) => w.text)).toEqual(["one", "two", "three"]);
    expect(words[1]!.endMs).toBe(1000);
    expect(words[2]).toEqual({ text: "three", startMs: 1500, endMs: 2000 });
    expect(words[0]!.endMs).toBeCloseTo(words[1]!.startMs);
  });
});
