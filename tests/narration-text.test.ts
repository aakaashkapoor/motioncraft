import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { splitForSpeech } from "../src/narration/pieces";
import { normalizeText } from "../src/narration/normalize";
import { createPhonemizer, createWordPhonemizer, type Lexicon } from "../src/narration/phonemes";
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
    ["$1999", "one thousand nine hundred ninety-nine dollars"],
    ["the $2024 plan", "the two thousand twenty-four dollars plan"],
    ["$0.01", "one cent"],
    ["$1.00", "one dollar"],
    ["$0.50", "fifty cents"],
    ["10x faster", "ten x faster"],
    ["an MP4 file.", "an MP four file."],
    ["1080p", "one thousand eighty p"],
    ["24fps", "twenty-four fps"],
    ["4K and 3D", "four K and three D"],
    ["the 1st, 2nd, 3rd and 21st", "the first, second, third and twenty-first"],
    ["the 12th and 40th", "the twelfth and fortieth"],
    ["50%", "fifty percent"],
    ["4.8% more", "four point eight percent more"],
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

  describe("stems", () => {
    const stems = createPhonemizer(
      {
        generate: "ʤˈɛnəɹˌAt", walk: "wˈɔk", play: "plˈA", add: "ˈæd", make: "mˈAk", run: "ɹˈʌn",
        get: "ɡˈɛt", box: "bˈɑks", story: "stˈɔɹi", motion: "mˈOʃən", craft: "kɹˈæft", need: "nˈid",
        ne: "nˈɛ", ed: "ˈɛd",
      },
      {},
    );

    it.each([
      ["generated", "ʤˈɛnəɹˌATᵻd"],
      ["walked", "wˈɔkt"],
      ["played", "plˈAd"],
      ["added", "ˈædᵻd"],
      ["making", "mˈAkɪŋ"],
      ["running", "ɹˈʌnɪŋ"],
      ["getting", "ɡˈɛTɪŋ"],
      ["boxes", "bˈɑksᵻz"],
      ["stories", "stˈɔɹiz"],
      ["motioncraft", "mˈOʃənkɹˌæft"],
    ])("derives %s from its stem", (word, expected) => {
      expect(stems(word)).toBe(expected);
    });

    it("lets a dictionary entry win over a stem split", () => {
      expect(stems("need")).toBe("nˈid");
    });
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

  it("treats no, st and mt as abbreviations only before a number or name", () => {
    expect(splitSentences("The answer is no. We move on.")).toEqual(["The answer is no.", "We move on."]);
    expect(splitSentences("See No. 5 now.")).toEqual(["See No. 5 now."]);
    expect(splitSentences("Visit St. Louis today.")).toEqual(["Visit St. Louis today."]);
    expect(splitSentences("It was the 1st. then more")).toEqual(["It was the 1st.", "then more"]);
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

describe("splitForSpeech", () => {
  const long = Array.from({ length: 40 }, (_, i) => `clause number ${i} here`).join(", ") + ".";

  it("leaves a short sentence whole", () => {
    expect(splitForSpeech("Short one, really.")).toEqual(["Short one, really."]);
  });

  it("splits a long sentence at commas into pieces within budget, losing nothing", () => {
    const pieces = splitForSpeech(long);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(400);
    expect(pieces.join(" ")).toBe(long);
    expect(pieces[0]!.endsWith(",")).toBe(true);
  });

  it("falls back to spaces when there is no punctuation", () => {
    const words = Array.from({ length: 150 }, () => "word").join(" ");
    const pieces = splitForSpeech(words);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join(" ")).toBe(words);
  });

  it("throws when one word alone is too long", () => {
    expect(() => splitForSpeech(`Start ${"x".repeat(600)}`)).toThrow(/sentence too long to speak \(\d+ phonemes, max 510\): "x+/);
  });
});

describe("phonemes in context", () => {
  const lex: Lexicon = {
    the: "ði",
    a: "A",
    an: "æn",
    to: "tu",
    in: "ɪn",
    cat: "kæt",
    egg: "ˈɛɡ",
    go: "ɡˈO",
    by: { DEFAULT: "bI", None: "bˈI" },
    use: { NOUN: "jˈus", VERB: "jˈuz", DEFAULT: "jus" },
    abuse: { NN: "əbjˈus", VB: "əbjˈuz", DEFAULT: "əbjus" }, // NN and VB mirror misaki's tags
    read: { DEFAULT: "ɹˈid", VBP: "ɹˈɛd" },
    it: "ɪt",
    eight: "ˈAt",
    type: "tˈIp",
    one: "wˈʌn",
    prompt: "pɹˈɑmpt",
    and: "ænd",
    videos: "vˈɪdioz",
    water: "wˈɔɾəɹ",
    stop: "stˈɑp",
    is: "ɪz",
    here: "hˈɪɹ",
    A: "ˈA",
    I: "ˈI",
  };
  const phonemize = createPhonemizer(lex, {});

  it("says the as ði before a vowel and ðə otherwise", () => {
    expect(phonemize("the cat")).toBe("ðə kæt");
    expect(phonemize("the egg")).toBe("ði ˈɛɡ");
    expect(phonemize("cat the.")).toBe("kæt ðə.");
  });

  it("says a, an and I in their weak forms", () => {
    expect(phonemize("a cat")).toBe("ɐ kæt");
    expect(phonemize("A cat")).toBe("ɐ kæt");
    expect(phonemize("an egg")).toBe("ɐn ˈɛɡ");
    expect(phonemize("I go")).toBe("ˌI ɡˈO");
  });

  it("says to as tə before a consonant, tʊ before a vowel and the entry before punctuation", () => {
    expect(phonemize("to cat")).toBe("tə kæt");
    expect(phonemize("to egg")).toBe("tʊ ˈɛɡ");
    expect(phonemize("go to.")).toBe("ɡˈO tu.");
    expect(phonemize("go to")).toBe("ɡˈO tu");
  });

  it("stresses in only before punctuation or the end", () => {
    expect(phonemize("go in, cat")).toBe("ɡˈO ˈɪn, kæt");
    expect(phonemize("go in cat")).toBe("ɡˈO ɪn kæt");
    expect(phonemize("In egg")).toBe("ɪn ˈɛɡ");
  });

  it("uses the None form of an entry at the end of a clause and DEFAULT mid-sentence", () => {
    expect(phonemize("go by.")).toBe("ɡˈO bˈI.");
    expect(phonemize("go by cat")).toBe("ɡˈO bI kæt");
  });

  it("picks the noun or verb form by the word before", () => {
    expect(phonemize("the use")).toBe("ðə jˈus");
    expect(phonemize("to use")).toBe("tə jˈuz");
    expect(phonemize("cat use")).toBe("kæt jus");
    expect(phonemize("the abuse")).toBe("ði əbjˈus");
    expect(phonemize("to abuse")).toBe("tʊ əbjˈuz");
  });

  it("keeps DEFAULT when the verb tag is one the entry has no plain form for", () => {
    expect(phonemize("to read")).toBe("tə ɹˈid");
  });

  it("stresses a capitalized dictionary word", () => {
    expect(phonemize("It go")).toBe("ˌɪt ɡˈO");
    expect(phonemize("IT go")).toBe("ˈɪt ɡˈO");
    expect(phonemize("Cat")).toBe("kˌæt");
  });

  it("does not stress the special cases or spelled-out acronyms", () => {
    expect(phonemize("The cat")).toBe("ðə kæt");
    expect(phonemize("AI")).toBe("ˈAˈI");
  });

  it("applies the special cases in all caps too", () => {
    expect(phonemize("THE cat")).toBe("ðə kæt");
    expect(phonemize("AN egg")).toBe("ɐn ˈɛɡ");
    expect(phonemize("TO cat")).toBe("tə kæt");
    expect(phonemize("go IN, cat")).toBe("ɡˈO ˈɪn, kæt");
  });

  it("spells a dotted acronym out letter by letter, with no inner periods", () => {
    expect(phonemize("A.I. is here")).toBe("ˈAˈI ɪz hˈɪɹ");
    expect(phonemize("the A.I. is here")).toBe("ði ˈAˈI ɪz hˈɪɹ");
  });

  it("keeps the final period of a dotted acronym only at the end of the text", () => {
    expect(phonemize("go A.I.")).toBe("ɡˈO ˈAˈI.");
    expect(phonemize("A.I. go")).toBe("ˈAˈI ɡˈO");
  });

  it("turns a flap into T", () => {
    expect(phonemize("water")).toBe("wˈɔTəɹ");
  });
});

describe("createWordPhonemizer", () => {
  const lex: Lexicon = {
    type: "tˈIp",
    one: "wˈʌn",
    prompt: "pɹˈɑmpt",
    and: "ænd",
    eight: "ˈAt",
    videos: "vˈɪdioz",
  };
  const run = createWordPhonemizer(lex, {});

  it("reports where each word's phonemes sit, without punctuation", () => {
    const words = ["Type", "one", "prompt,", "and", "8", "videos."];
    const { phonemes, spans } = run(words);
    expect(spans).toHaveLength(6);
    const slices = spans.map(({ start, end }) => phonemes.slice(start, end));
    expect(slices).toEqual(["tˈIp", "wˈʌn", "pɹˈɑmpt", "ænd", "ˈAt", "vˈɪdioz"]);
    expect(phonemes).toBe("tˈIp wˈʌn pɹˈɑmpt, ænd ˈAt vˈɪdioz.");
  });

  it("gives a word with no sounds an empty span", () => {
    const { spans } = run(["one", "...", "and"]);
    expect(spans[1]!.start).toBe(spans[1]!.end);
  });

  it("matches createPhonemizer on the same text", () => {
    expect(run(["one", "and", "8"]).phonemes).toBe(createPhonemizer(lex, {})("one and 8"));
  });

  it("gives empty input no phonemes and no spans", () => {
    expect(run([])).toEqual({ phonemes: "", spans: [] });
  });

  it("gives a leading pause an empty span at the start", () => {
    const { phonemes, spans } = run(["...", "one"]);
    expect(phonemes).toBe(".. wˈʌn".replace("..", "..."));
    expect(spans[0]).toEqual({ start: 0, end: 0 });
    expect(phonemes.slice(spans[1]!.start, spans[1]!.end)).toBe("wˈʌn");
  });

  it("reads a title with the capitalized name after it, with no period, and one shared span", () => {
    const { phonemes, spans } = run(["Dr.", "Smith", "said"]);
    expect(phonemes).not.toContain(".");
    expect(spans[0]).toEqual(spans[1]);
    expect(phonemes.slice(spans[2]!.start)).not.toBe(phonemes.slice(spans[0]!.start, spans[0]!.end));
    expect(phonemes).toBe(createPhonemizer(lex, {})("Dr. Smith said"));
  });

  it("reads an amount and its scale as the whole-text normalizer does", () => {
    const whole = normalizeText("$5 million");
    expect(whole).toBe("five million dollars");
    const { phonemes, spans } = run(["$5", "million"]);
    expect(phonemes).toBe(createWordPhonemizer(lex, {})(whole.split(" ")).phonemes);
    expect(spans[0]).toEqual(spans[1]);
  });

  it("keeps the period of etc. before a capital", () => {
    expect(run(["etc.", "The", "end"]).phonemes).toContain(".");
    expect(run(["etc.", "the", "end"]).phonemes).not.toContain(".");
  });

  it("gives the same phonemes as the plain text path for every showcase line", () => {
    const storyboard = JSON.parse(
      readFileSync(new URL("../examples/showcase/storyboard.json", import.meta.url), "utf8"),
    ) as { scenes: { narration?: string }[] };
    const lines = storyboard.scenes.flatMap((scene) => (scene.narration === undefined ? [] : splitSentences(scene.narration)));
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines) {
      expect(run(line.split(/\s+/).filter(Boolean)).phonemes).toBe(createPhonemizer(lex, {})(line));
    }
  });
});
