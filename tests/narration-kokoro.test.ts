import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { kokoroSynthesizer, wordSamples } from "../src/narration/kokoro";
import { createPhonemizer, createWordPhonemizer } from "../src/narration/phonemes";
import { encodePhonemes, encodePhonemesMapped } from "../src/narration/tokenizer";

describe("kokoroSynthesizer", () => {
  it("rejects an unknown voice, listing the supported ones, before touching the network", async () => {
    const synth = kokoroSynthesizer({ offline: true, cacheDir: "no-such-cache" });
    await expect(synth.speak("Hi.", "zz_nobody")).rejects.toThrow(/af_heart, af_bella, am_michael/);
  });

  it("does not remember a failed load: every call reports the real problem", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "mc-empty-"));
    try {
      const synth = kokoroSynthesizer({ offline: true, cacheDir });
      await expect(synth.speak("Hi.", "af_heart")).rejects.toThrow(/run once online to download/);
      await expect(synth.speak("Hi.", "af_heart")).rejects.toThrow(/run once online to download/);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  // The real model: downloads ~100 MB once into ~/.cache/motioncraft.
  it.skipIf(process.env["MOTIONCRAFT_TTS_TEST"] !== "1")(
    "speaks a sentence at 24 kHz",
    async () => {
      const speech = await kokoroSynthesizer().speak("Type one prompt, and get a finished video.", "af_heart");
      expect(speech.sampleRate).toBe(24000);
      const seconds = speech.samples.length / speech.sampleRate;
      expect(seconds).toBeGreaterThan(1.5);
      expect(seconds).toBeLessThan(6);
    },
    600_000,
  );

  it.skipIf(process.env["MOTIONCRAFT_TTS_TEST"] !== "1")(
    "times each word from the model's own durations",
    async () => {
      const speech = await kokoroSynthesizer().speak("Type one prompt, and get a finished video.", "af_heart");
      const words = speech.words!;
      expect(words).toHaveLength(8);
      for (const [i, word] of words.entries()) {
        expect(word.endSample).toBeGreaterThanOrEqual(word.startSample);
        if (i > 0) expect(word.startSample).toBeGreaterThanOrEqual(words[i - 1]!.startSample);
      }
      const loud = (x: number) => Math.abs(x) >= 0.01;
      const first = speech.samples.findIndex(loud);
      const last = speech.samples.length - 1 - [...speech.samples].reverse().findIndex(loud);
      const ms = (samples: number) => (samples / speech.sampleRate) * 1000;
      expect(Math.abs(ms(words[0]!.startSample) - ms(first))).toBeLessThanOrEqual(100);
      // The model gives the last vowel a long fade (here about 300 ms past the last audible sample), so the
      // raw end can sit beyond the sound; narration clamps it to the trimmed sound (see narrate tests).
      expect(words[7]!.endSample).toBeGreaterThanOrEqual(last - ms(150) * 24);
      expect(words[7]!.endSample).toBeLessThanOrEqual(speech.samples.length);
    },
    600_000,
  );
});

describe("wordSamples", () => {
  const A = { start: 0, end: 2 };
  const B = { start: 2, end: 3 };

  it("times each word from the cumulative rounded durations, 600 samples a frame", () => {
    // Rounded: 2, 1, 1, 4, 1 frames -> id starts 0, 1200, 1800, 2400, 4800.
    expect(wordSamples([2.2, 1.4, 0.3, 3.6, 1], [1, 2, 3], [A, B], 5400)).toEqual([
      { startSample: 1200, endSample: 2400 },
      { startSample: 2400, endSample: 4800 },
    ]);
  });

  it("gives a zero duration one frame", () => {
    expect(wordSamples([0, 0, 0.4, 0], [1, 2], [A], 2400)).toEqual([{ startSample: 600, endSample: 1800 }]);
  });

  it("skips a character that has no id", () => {
    // Char 0 has no id, so word A's sound is char 1 alone (id 2).
    expect(wordSamples([1, 1, 1, 1, 1], [undefined, 2, 3], [A, B], 3000)).toEqual([
      { startSample: 1200, endSample: 1800 },
      { startSample: 1800, endSample: 2400 },
    ]);
  });

  it("puts a word with no ids at the end of what comes before it", () => {
    const empty = { start: 2, end: 2 };
    expect(wordSamples([1, 1, 1, 1, 1], [1, 2], [A, empty], 3000)).toEqual([
      { startSample: 600, endSample: 1800 },
      { startSample: 1800, endSample: 1800 },
    ]);
    // Nothing before it: after the leading pad.
    expect(wordSamples([1, 1, 1], [1], [{ start: 0, end: 0 }, { start: 0, end: 1 }], 1800)[0]).toEqual({ startSample: 600, endSample: 600 });
  });

  it("scales all times when the total is more than 600 samples off the waveform", () => {
    const exact = wordSamples([1, 2, 1, 2, 1], [1, 2, 3], [A, B], 4200);
    const twice = wordSamples([1, 2, 1, 2, 1], [1, 2, 3], [A, B], 8400);
    expect(twice[0]!.startSample).toBeCloseTo(exact[0]!.startSample * 2, 6);
    expect(twice[1]!.endSample).toBeCloseTo(exact[1]!.endSample * 2, 6);
    // Within 600 samples: left alone.
    expect(wordSamples([1, 2, 1, 2, 1], [1, 2, 3], [A, B], 4700)).toEqual(exact);
  });
});

describe("word spans of a text", () => {
  const gold = { type: "tˈIp", one: "wˈʌn", prompt: "pɹˈɑmpt", and: "ænd", get: "ɡɛt", three: "θɹi", two: "tu", to: "tu" };
  const words = (text: string): string[] => text.split(/\s+/).filter((word) => word !== "");
  const phonemizeWords = createWordPhonemizer(gold, {});

  it("gives the same phonemes as the plain text path", () => {
    for (const text of ["Type one prompt, and get one.", "Type 3 prompts, and get 2-3 more at $5 million.", "Dr. Type  one"]) {
      expect(phonemizeWords(words(text)).phonemes).toBe(createPhonemizer(gold, {})(text));
    }
  });

  it("has one ordered span per whitespace-separated word of the text, inside the phonemes", () => {
    const text = "Type 3 prompts, and get 2-3 more.";
    const { phonemes, spans } = phonemizeWords(words(text));
    expect(spans).toHaveLength(words(text).length);
    for (const span of spans) {
      expect(span.start).toBeLessThanOrEqual(span.end);
      expect(span.end).toBeLessThanOrEqual(phonemes.length);
    }
    for (let i = 1; i < spans.length; i++) expect(spans[i]!.start).toBeGreaterThanOrEqual(spans[i - 1]!.end);
    expect(phonemes.slice(spans[0]!.start, spans[0]!.end)).toBe("tˈIp");
  });

  it("gives a number that reads as several words one span over all of them", () => {
    const { phonemes, spans } = phonemizeWords(["get", "3", "and"]);
    expect(spans).toHaveLength(3);
    expect(phonemes.slice(spans[1]!.start, spans[1]!.end)).toBe("θɹi");
  });

  it("gives 2-3, one display word, a span over all of its spoken words", () => {
    const { phonemes, spans } = phonemizeWords(["get", "2-3", "and"]);
    expect(spans).toHaveLength(3);
    expect(phonemes.slice(spans[1]!.start, spans[1]!.end)).toBe("tu tə θɹi");
  });
});

describe("encodePhonemesMapped", () => {
  const vocab = { a: 5, b: 6, " ": 16 };
  it("matches encodePhonemes and maps each character to its id index", () => {
    const { ids, idOfChar } = encodePhonemesMapped("a?b a", vocab);
    expect(ids).toEqual(encodePhonemes("a?b a", vocab));
    expect(ids).toEqual([0, 5, 6, 16, 5, 0]);
    expect(idOfChar).toEqual([1, undefined, 2, 3, 4]);
  });
});
