import { describe, expect, it } from "vitest";
import {
  generateSpeech,
  MAX_NEW_TOKENS,
  SILENCE_TOKEN,
  STOP_SPEECH,
  type ChatterboxSessions,
  type Tensorish,
} from "../src/narration/chatterboxModel";
import type { VoiceConditioning } from "../src/narration/chatterboxVoice";
import { TURBO_SAMPLING } from "../src/narration/sampling";

const HIDDEN = 4;
const VOCAB = 6563;

const voice: VoiceConditioning = {
  audioFeatures: { dims: [1, 2, HIDDEN], data: new Float32Array(2 * HIDDEN).fill(7) },
  audioTokens: { dims: [1, 2], data: BigInt64Array.of(11n, 12n) },
  speakerEmbeddings: { dims: [1, 192], data: new Float32Array(192) },
  speakerFeatures: { dims: [1, 3, 80], data: new Float32Array(240) },
};

/** Fake sessions: the language model says `script(step)` at each step and records what it was fed. */
function fakeSessions(script: (step: number) => number) {
  const lmCalls: Record<string, Tensorish>[] = [];
  const decoderCalls: Record<string, Tensorish>[] = [];
  const pastNames = ["past_key_values.0.key", "past_key_values.0.value"];
  const sessions: ChatterboxSessions = {
    tensor: (type, data, dims) => ({ type, data, dims }) as Tensorish,
    pastNames,
    embed: async (feeds) => {
      const len = feeds["input_ids"]!.dims[1]!;
      return { inputs_embeds: { dims: [1, len, HIDDEN], data: new Float32Array(len * HIDDEN) } };
    },
    languageModel: async (feeds) => {
      lmCalls.push(feeds);
      const seq = feeds["inputs_embeds"]!.dims[1]!;
      const logits = new Float32Array(seq * VOCAB);
      logits[(seq - 1) * VOCAB + script(lmCalls.length - 1)] = 100;
      const step = lmCalls.length;
      return {
        logits: { dims: [1, seq, VOCAB], data: logits },
        "present.0.key": { dims: [1, 16, step, 64], data: `key ${step}` },
        "present.0.value": { dims: [1, 16, step, 64], data: `value ${step}` },
      };
    },
    decoder: async (feeds) => {
      decoderCalls.push(feeds);
      return { waveform: { dims: [1, 5], data: Float32Array.of(0, 0.1, 0.2, 0.1, 0) } };
    },
  };
  return { sessions, lmCalls, decoderCalls };
}

const greedy = { ...TURBO_SAMPLING, temperature: 0 };
const ints = (t: Tensorish | undefined) => [...(t!.data as BigInt64Array)].map(Number);

describe("generateSpeech", () => {
  it("decodes the reference's tokens, the generated ones and three silences", async () => {
    const { sessions, decoderCalls } = fakeSessions((step) => (step < 3 ? 100 + step : STOP_SPEECH));
    const result = await generateSpeech(sessions, voice, [5, 6, 7], () => 0.5, greedy);
    expect(ints(decoderCalls[0]!["speech_tokens"])).toEqual([11, 12, 100, 101, 102, SILENCE_TOKEN, SILENCE_TOKEN, SILENCE_TOKEN]);
    expect(decoderCalls[0]!["speaker_embeddings"]!.dims).toEqual([1, 192]);
    expect(decoderCalls[0]!["speaker_features"]!.dims).toEqual([1, 3, 80]);
    expect(result).toEqual({ samples: Float32Array.of(0, 0.1, 0.2, 0.1, 0), tokens: 3, finished: true });
  });

  it("reads the voice before the text, then one token at a time", async () => {
    const { sessions, lmCalls } = fakeSessions((step) => (step < 2 ? 100 : STOP_SPEECH));
    await generateSpeech(sessions, voice, [5, 6, 7], () => 0.5, greedy);
    const first = lmCalls[0]!["inputs_embeds"]!;
    expect(first.dims).toEqual([1, 5, HIDDEN]);
    expect([...(first.data as Float32Array).subarray(0, 2 * HIDDEN)]).toEqual(new Array(2 * HIDDEN).fill(7));
    expect(lmCalls[1]!["inputs_embeds"]!.dims).toEqual([1, 1, HIDDEN]);
    expect(ints(lmCalls[0]!["position_ids"])).toEqual([0, 1, 2, 3, 4]);
    expect(ints(lmCalls[1]!["position_ids"])).toEqual([5]);
    expect(ints(lmCalls[2]!["position_ids"])).toEqual([6]);
    expect(ints(lmCalls[2]!["attention_mask"])).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it("starts with an empty cache and then feeds each step's present back as the past", async () => {
    const { sessions, lmCalls } = fakeSessions((step) => (step < 2 ? 100 : STOP_SPEECH));
    await generateSpeech(sessions, voice, [5], () => 0.5, greedy);
    expect(lmCalls[0]!["past_key_values.0.key"]!.dims).toEqual([1, 16, 0, 64]);
    expect(lmCalls[1]!["past_key_values.0.key"]!.data).toBe("key 1");
    expect(lmCalls[2]!["past_key_values.0.value"]!.data).toBe("value 2");
  });

  it("gives each step its own draw and stops at the cap when STOP never comes", async () => {
    const draws: number[] = [];
    const { sessions } = fakeSessions(() => 100);
    const result = await generateSpeech(sessions, voice, [5], (step) => (draws.push(step), 0.5), greedy, 4);
    expect(draws).toEqual([0, 1, 2, 3]);
    expect(result.finished).toBe(false);
    expect(result.tokens).toBe(4);
  });

  it("caps a line at MAX_NEW_TOKENS by default", () => {
    expect(MAX_NEW_TOKENS).toBe(1000);
  });
});
