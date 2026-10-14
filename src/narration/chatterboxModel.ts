// Chatterbox-Turbo's generation loop over its ONNX graphs: the language model
// reads the voice's audio features and the text, then says speech tokens one at
// a time (with a key/value cache) until it says STOP; the decoder turns the
// reference's tokens plus the new ones into a 24 kHz waveform. Sessions sit
// behind `Run` so tests can fake them.
//
// Ported from the example in the model card of ResembleAI/chatterbox-turbo-ONNX
// (MIT, Resemble AI), with the package's sampling instead of its greedy pick.

import type { VoiceConditioning } from "./chatterboxVoice";
import { pickToken, TURBO_SAMPLING, type SamplingOptions } from "./sampling";

export const START_SPEECH = 6561;
export const STOP_SPEECH = 6562;
/** Appended three times so the decoder ends the line cleanly. */
export const SILENCE_TOKEN = 4299;
/** 40 s of speech (25 tokens a second): a line that reaches it never stopped. */
export const MAX_NEW_TOKENS = 1000;
const KV_HEADS = 16;
const HEAD_DIM = 64;

export interface Tensorish {
  readonly dims: readonly number[];
  readonly data: unknown;
}

/** One ONNX session: feeds in, outputs out (the real one wraps `InferenceSession.run`). */
export type Run = (feeds: Record<string, Tensorish>) => Promise<Record<string, Tensorish>>;

export interface ChatterboxSessions {
  embed: Run;
  languageModel: Run;
  decoder: Run;
  /** The language model's `past_key_values.*` inputs, in order; each one's output is the same name with `present`. */
  pastNames: readonly string[];
  /** Makes a tensor (the real one wraps `new ort.Tensor`). */
  tensor: (type: "float32" | "int64", data: Float32Array | BigInt64Array, dims: readonly number[]) => Tensorish;
}

export interface Generated {
  samples: Float32Array;
  /** How many speech tokens were said. */
  tokens: number;
  /** False when it hit the token cap without saying STOP. */
  finished: boolean;
}

const int64 = (values: Iterable<number>): BigInt64Array => BigInt64Array.from(values, (v) => BigInt(v));

/**
 * Speaks `textIds` in `voice`. `draw(step)` gives the uniform number in [0, 1)
 * that picks the step's token, so a seeded `draw` always says the same thing.
 */
export async function generateSpeech(
  sessions: ChatterboxSessions,
  voice: VoiceConditioning,
  textIds: readonly number[],
  draw: (step: number) => number,
  sampling: SamplingOptions = TURBO_SAMPLING,
  maxTokens: number = MAX_NEW_TOKENS,
): Promise<Generated> {
  const { tensor } = sessions;
  const embed = async (ids: readonly number[]) =>
    (await sessions.embed({ input_ids: tensor("int64", int64(ids), [1, ids.length]) }))["inputs_embeds"]!;

  // The first step reads the voice's features, then the text.
  const text = await embed(textIds);
  const features = voice.audioFeatures;
  const hidden = features.dims[2]!;
  const prefix = new Float32Array(features.data.length + (text.data as Float32Array).length);
  prefix.set(features.data);
  prefix.set(text.data as Float32Array, features.data.length);
  let length = prefix.length / hidden;
  let inputs = tensor("float32", prefix, [1, length, hidden]);
  let positions = int64(Array.from({ length }, (_, i) => i));
  let past: Record<string, Tensorish> = Object.fromEntries(
    sessions.pastNames.map((name) => [name, tensor("float32", new Float32Array(0), [1, KV_HEADS, 0, HEAD_DIM])]),
  );

  const said = [START_SPEECH];
  let finished = false;
  for (let step = 0; step < maxTokens; step++) {
    const output = await sessions.languageModel({
      inputs_embeds: inputs,
      attention_mask: tensor("int64", int64(new Array<number>(length).fill(1)), [1, length]),
      position_ids: tensor("int64", positions, [1, positions.length]),
      ...past,
    });
    const logits = output["logits"]!;
    const [, seq, vocab] = logits.dims as [number, number, number];
    const token = pickToken((logits.data as Float32Array).subarray((seq - 1) * vocab, seq * vocab), said, draw(step), sampling);
    if (token === STOP_SPEECH) {
      finished = true;
      break;
    }
    said.push(token);
    inputs = await embed([token]);
    positions = int64([length]);
    length += 1;
    past = Object.fromEntries(sessions.pastNames.map((name) => [name, output[name.replace("past_key_values", "present")]!]));
  }

  const spoken = said.slice(1);
  const tokens = int64([...Array.from(voice.audioTokens.data, Number), ...spoken, SILENCE_TOKEN, SILENCE_TOKEN, SILENCE_TOKEN]);
  const decoded = await sessions.decoder({
    speech_tokens: tensor("int64", tokens, [1, tokens.length]),
    speaker_embeddings: tensor("float32", voice.speakerEmbeddings.data, voice.speakerEmbeddings.dims),
    speaker_features: tensor("float32", voice.speakerFeatures.data, voice.speakerFeatures.dims),
  });
  return { samples: Float32Array.from(decoded["waveform"]!.data as Float32Array), tokens: spoken.length, finished };
}
