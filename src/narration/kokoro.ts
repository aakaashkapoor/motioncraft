// The Kokoro-82M voice, run locally on onnxruntime-node. Everything it needs
// (model, vocab, dictionaries, voices) is fetched once into the cache by
// `ensureFile` the first time something is spoken.
//
// Ported from `generate_from_ids` in kokoro-js
// (https://github.com/hexgrad/kokoro, Apache-2.0, hexgrad): the style vector is
// row `min(max(ids - 2, 0), 509)` of the voice file, and the model takes
// `input_ids`, `style` and `speed` and returns a 24 kHz mono `waveform`. The
// timestamped export also returns `durations`, one per input id in 600-sample
// frames; `wordSamples` turns them into each word's start and end in the audio.

import { readFile } from "node:fs/promises";
import type { InferenceSession } from "onnxruntime-node";
import {
  defaultCacheDir,
  ensureFile,
  GOLD_FILE,
  MODEL_FILE,
  SILVER_FILE,
  TOKENIZER_FILE,
  VOICE_FILES,
} from "./assets";
import { createWordPhonemizer, type Lexicon, type WordPhonemes } from "./phonemes";
import { tooLongError } from "./pieces";
import { countPhonemes, encodePhonemesMapped, MAX_PHONEME_IDS } from "./tokenizer";

export interface Speech {
  samples: Float32Array;
  sampleRate: number;
  /** One per display word of the spoken text (split on whitespace): when it is said, in samples of `samples`. */
  words?: { startSample: number; endSample: number }[];
}

export interface Synthesizer {
  /** `speed` is 1 when omitted. */
  speak(text: string, voice: string, speed?: number): Promise<Speech>;
}

const SAMPLE_RATE = 24000;
const STYLE_SIZE = 256;
const MAX_STYLE_ROW = 509;
/** The model's frame: one duration unit is this many samples. */
const SAMPLES_PER_FRAME = 600;

/**
 * When each word is said, from the model's per-id `durations` (a value of `d`
 * lasts `max(1, round(d))` frames of 600 samples). `idOfChar` maps each index
 * of the phoneme string to its index in the ids (undefined: no id) and `spans`
 * are the words' [start, end) in the phoneme string. A word with no ids sits,
 * with no length, where the last id before it ends. When the total is more
 * than one frame off `waveformLength`, every time is scaled to fit it.
 */
export function wordSamples(
  durations: ArrayLike<number>,
  idOfChar: readonly (number | undefined)[],
  spans: readonly { start: number; end: number }[],
  waveformLength?: number,
): { startSample: number; endSample: number }[] {
  const starts: number[] = [];
  let total = 0;
  for (let i = 0; i < durations.length; i++) {
    starts.push(total);
    // Math.round rounds halves up where torch rounds them to even; the scale below absorbs any drift.
    total += Math.max(1, Math.round(durations[i]!)) * SAMPLES_PER_FRAME;
  }
  starts.push(total);
  const scale =
    waveformLength !== undefined && total > 0 && Math.abs(total - waveformLength) > SAMPLES_PER_FRAME ? waveformLength / total : 1;

  return spans.map(({ start, end }) => {
    let first: number | undefined;
    let last: number | undefined;
    let before = 0; // the id of the last character ahead of the word: the pad, when there is none
    for (let c = 0; c < end; c++) {
      const id = idOfChar[c];
      if (id === undefined) continue;
      if (c < start) before = id;
      else {
        first ??= id;
        last = id;
      }
    }
    // With no ids of its own, a word is a point at the end of the id before it.
    const startSample = starts[first ?? before + 1]!;
    const endSample = starts[last === undefined ? before + 1 : last + 1]!;
    return { startSample: startSample * scale, endSample: endSample * scale };
  });
}

/** `wordSamples`, or undefined (the caller falls back to an estimate) when the model gave no `durations` or not one per id. */
export function speechWords(
  durations: ArrayLike<number> | undefined,
  idCount: number,
  idOfChar: readonly (number | undefined)[],
  spans: readonly { start: number; end: number }[],
  waveformLength: number,
): { startSample: number; endSample: number }[] | undefined {
  if (durations === undefined || durations.length !== idCount) return undefined;
  return wordSamples(durations, idOfChar, spans, waveformLength);
}

/** The model's three inputs; `speed` is the storyboard's `voiceSpeed` (1 is the voice's own pace). */
export function modelInputs(
  Tensor: typeof import("onnxruntime-node").Tensor,
  ids: ArrayLike<number>,
  style: Float32Array,
  speed: number,
): Record<"input_ids" | "style" | "speed", InstanceType<typeof import("onnxruntime-node").Tensor>> {
  return {
    input_ids: new Tensor("int64", BigInt64Array.from(ids, BigInt), [1, ids.length]),
    style: new Tensor("float32", style, [1, STYLE_SIZE]),
    speed: new Tensor("float32", Float32Array.of(speed), [1]),
  };
}

interface Loaded {
  session: InferenceSession;
  vocab: Record<string, number>;
  phonemizeWords: (words: readonly string[]) => WordPhonemes;
  voices: Map<string, Float32Array>;
}

export function kokoroSynthesizer(options: { cacheDir?: string; offline?: boolean } = {}): Synthesizer {
  const cacheDir = options.cacheDir ?? defaultCacheDir();
  const fetchOptions = { offline: options.offline };
  let loading: Promise<Loaded> | undefined;

  const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8")) as T;

  async function load(): Promise<Loaded> {
    const [modelPath, tokenizerPath, goldPath, silverPath] = await Promise.all(
      [MODEL_FILE, TOKENIZER_FILE, GOLD_FILE, SILVER_FILE].map((file) => ensureFile(file, cacheDir, fetchOptions)),
    ) as [string, string, string, string];
    const ort = await import("onnxruntime-node");
    const [session, tokenizer, gold, silver] = await Promise.all([
      ort.InferenceSession.create(modelPath),
      readJson<{ model: { vocab: Record<string, number> } }>(tokenizerPath),
      readJson<Lexicon>(goldPath),
      readJson<Lexicon>(silverPath),
    ]);
    return { session, vocab: tokenizer.model.vocab, phonemizeWords: createWordPhonemizer(gold, silver), voices: new Map() };
  }

  async function voiceStyles(loaded: Loaded, voice: string): Promise<Float32Array> {
    const cached = loaded.voices.get(voice);
    if (cached !== undefined) return cached;
    const bytes = await readFile(await ensureFile(VOICE_FILES[voice]!, cacheDir, fetchOptions));
    const styles = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    loaded.voices.set(voice, styles);
    return styles;
  }

  return {
    async speak(text, voice, speed = 1) {
      if (!Object.hasOwn(VOICE_FILES, voice)) {
        throw new Error(`unknown voice "${voice}"; supported voices: ${Object.keys(VOICE_FILES).join(", ")}`);
      }
      loading ??= load().catch((error: unknown) => {
        loading = undefined; // a failed load (say, offline) must not stick
        throw error;
      });
      const loaded = await loading;
      const { phonemes, spans } = loaded.phonemizeWords(text.split(/\s+/).filter((word) => word !== ""));
      const { ids, idOfChar } = encodePhonemesMapped(phonemes, loaded.vocab);
      const known = countPhonemes(phonemes, loaded.vocab);
      if (known > MAX_PHONEME_IDS) throw tooLongError(known, text);
      const row = Math.min(Math.max(ids.length - 2, 0), MAX_STYLE_ROW);
      const styles = await voiceStyles(loaded, voice);

      const ort = await import("onnxruntime-node");
      const output = await loaded.session.run(
        modelInputs(ort.Tensor, ids, styles.slice(row * STYLE_SIZE, (row + 1) * STYLE_SIZE), speed),
      );
      const samples = Float32Array.from(output["waveform"]!.data as Float32Array);
      return { samples, sampleRate: SAMPLE_RATE, words: speechWords(output["durations"]?.data as ArrayLike<number> | undefined, ids.length, idOfChar, spans, samples.length) };
    },
  };
}
