import { describe, expect, it, vi } from "vitest";
import { ATTEMPTS, chatterboxSynthesizer, TIMING_VOICE, type ChatterboxModel } from "../src/narration/chatterbox";
import { STOP_SPEECH, type ChatterboxSessions, type Tensorish } from "../src/narration/chatterboxModel";
import type { Speech, Synthesizer } from "../src/narration/kokoro";
import { routeVoice } from "../src/narration/synthesizer";

const RATE = 24000;

/** `seconds` of audio, loud from `from` to `to` seconds. */
function recording(seconds: number, from: number, to: number): Float32Array {
  const samples = new Float32Array(Math.round(seconds * RATE));
  samples.fill(0.5, Math.round(from * RATE), Math.round(to * RATE) + 1);
  return samples;
}

/** Kokoro's stand-in: 1 s of sound from 0.5 s to 1.5 s, two words splitting it. */
function fakeTiming(): Synthesizer & { calls: [string, string, number | undefined][] } {
  const calls: [string, string, number | undefined][] = [];
  return {
    calls,
    async speak(text, voice, speed): Promise<Speech> {
      calls.push([text, voice, speed]);
      return {
        samples: recording(2, 0.5, 1.5),
        sampleRate: RATE,
        words: [
          { startSample: 0.5 * RATE, endSample: RATE },
          { startSample: RATE, endSample: 1.5 * RATE },
        ],
      };
    },
  };
}

/** A model that stops at once and whose decoder gives `takes[i]` (seconds of sound starting at 0.1 s) on its i-th line. */
function fakeModel(takes: number[]): ChatterboxModel & { decodes: () => number } {
  let decodes = 0;
  const sessions: ChatterboxSessions = {
    tensor: (_type, data, dims) => ({ data, dims }) as Tensorish,
    pastNames: [],
    embed: async (feeds) => ({ inputs_embeds: { dims: [1, feeds["input_ids"]!.dims[1]!, 2], data: new Float32Array(feeds["input_ids"]!.dims[1]! * 2) } }),
    languageModel: async (feeds) => {
      const seq = feeds["inputs_embeds"]!.dims[1]!;
      const logits = new Float32Array(seq * 6563);
      logits[(seq - 1) * 6563 + STOP_SPEECH] = 100;
      return { logits: { dims: [1, seq, 6563], data: logits } };
    },
    decoder: async () => {
      const seconds = takes[Math.min(decodes++, takes.length - 1)]!;
      return { waveform: { dims: [1, 0], data: recording(seconds + 0.3, 0.1, 0.1 + seconds) } };
    },
  };
  return {
    sessions,
    encode: (text) => [...text].map((c) => c.charCodeAt(0)),
    voice: {
      audioFeatures: { dims: [1, 1, 2], data: new Float32Array(2) },
      audioTokens: { dims: [1, 1], data: BigInt64Array.of(1n) },
      speakerEmbeddings: { dims: [1, 192], data: new Float32Array(192) },
      speakerFeatures: { dims: [1, 1, 80], data: new Float32Array(80) },
    },
    decodes: () => decodes,
  };
}

describe("chatterboxSynthesizer", () => {
  it("speaks in Chatterbox and times the words by Kokoro's saying of the same text", async () => {
    const timing = fakeTiming();
    const model = fakeModel([1.2]);
    const speech = await chatterboxSynthesizer({ timing, load: async () => model }).speak("Hello there.", "chatterbox", 1.3);
    expect(timing.calls).toEqual([["Hello there.", TIMING_VOICE, 1]]);
    expect(model.decodes()).toBe(1);
    expect(speech.sampleRate).toBe(RATE);
    expect(speech.samples.length).toBe(Math.round(1.5 * RATE));
    // Kokoro's sound (0.5..1.5 s) maps onto Chatterbox's (0.1..1.3 s): each word gets half.
    expect(speech.words).toEqual([
      { startSample: 0.1 * RATE, endSample: 0.7 * RATE },
      { startSample: 0.7 * RATE, endSample: 1.3 * RATE },
    ]);
  });

  it("says a line again when its length shows dropped or repeated words, keeping the first plausible one", async () => {
    const model = fakeModel([4, 1.2]);
    const speech = await chatterboxSynthesizer({ timing: fakeTiming(), load: async () => model }).speak("Hi.", "chatterbox");
    expect(model.decodes()).toBe(2);
    expect(speech.samples.length).toBe(Math.round(1.5 * RATE));
  });

  it("keeps the take closest to Kokoro's length when none is plausible", async () => {
    const model = fakeModel([4, 0.3, 2.5]);
    const speech = await chatterboxSynthesizer({ timing: fakeTiming(), load: async () => model }).speak("Hi.", "chatterbox");
    expect(model.decodes()).toBe(ATTEMPTS);
    expect(speech.samples.length).toBe(Math.round(2.8 * RATE));
  });

  it("rejects a voice it does not have before loading anything", async () => {
    const load = vi.fn(async () => fakeModel([1]));
    await expect(chatterboxSynthesizer({ timing: fakeTiming(), load }).speak("Hi.", "af_heart")).rejects.toThrow(/supported voices: chatterbox/);
    expect(load).not.toHaveBeenCalled();
  });

  it("does not remember a failed load", async () => {
    const load = vi.fn(async () => {
      throw new Error("not cached while offline");
    });
    const synth = chatterboxSynthesizer({ timing: fakeTiming(), load });
    await expect(synth.speak("Hi.", "chatterbox")).rejects.toThrow(/offline/);
    await expect(synth.speak("Hi.", "chatterbox")).rejects.toThrow(/offline/);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("routeVoice", () => {
  it("sends Chatterbox voices to Chatterbox and the rest to Kokoro", async () => {
    const said: string[] = [];
    const engine = (name: string): Synthesizer => ({
      speak: async (_text, voice) => {
        said.push(`${name}:${voice}`);
        return { samples: new Float32Array(0), sampleRate: RATE };
      },
    });
    const synth = routeVoice(engine("chatterbox"), engine("kokoro"));
    await synth.speak("a", "chatterbox");
    await synth.speak("a", "af_heart");
    expect(said).toEqual(["chatterbox:chatterbox", "kokoro:af_heart"]);
  });
});

// The real model: downloads ~600 MB once into ~/.cache/motioncraft (plus Kokoro's ~100 MB for timing).
describe.skipIf(process.env["MOTIONCRAFT_TTS_TEST"] !== "1")("the real Chatterbox voice", () => {
  it(
    "speaks a sentence at 24 kHz with one time per word",
    async () => {
      const { voiceSynthesizer } = await import("../src/narration/synthesizer");
      const speech = await voiceSynthesizer().speak("Type one prompt, and get a finished video.", "chatterbox");
      expect(speech.sampleRate).toBe(RATE);
      const seconds = speech.samples.length / RATE;
      expect(seconds).toBeGreaterThan(1.5);
      expect(seconds).toBeLessThan(6);
      expect(speech.words).toHaveLength(8);
      for (const [i, word] of speech.words!.entries()) {
        expect(word.endSample).toBeGreaterThanOrEqual(word.startSample);
        if (i > 0) expect(word.startSample).toBeGreaterThanOrEqual(speech.words![i - 1]!.endSample - 1);
      }
    },
    600_000,
  );
});
