// The Kokoro-82M voice, run locally on onnxruntime-node. Everything it needs
// (model, vocab, dictionaries, voices) is fetched once into the cache by
// `ensureFile` the first time something is spoken.
//
// Ported from `generate_from_ids` in kokoro-js
// (https://github.com/hexgrad/kokoro, Apache-2.0, hexgrad): the style vector is
// row `min(max(ids - 2, 0), 509)` of the voice file, and the model takes
// `input_ids`, `style` and `speed` and returns a 24 kHz mono `waveform`.

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
import { normalizeText } from "./normalize";
import { createPhonemizer, type Lexicon } from "./phonemes";
import { tooLongError } from "./pieces";
import { countPhonemes, encodePhonemes, MAX_PHONEME_IDS } from "./tokenizer";

export interface Speech {
  samples: Float32Array;
  sampleRate: number;
}

export interface Synthesizer {
  speak(text: string, voice: string): Promise<Speech>;
}

const SAMPLE_RATE = 24000;
const STYLE_SIZE = 256;
const MAX_STYLE_ROW = 509;

interface Loaded {
  session: InferenceSession;
  vocab: Record<string, number>;
  phonemize: (text: string) => string;
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
    return { session, vocab: tokenizer.model.vocab, phonemize: createPhonemizer(gold, silver), voices: new Map() };
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
    async speak(text, voice) {
      if (!Object.hasOwn(VOICE_FILES, voice)) {
        throw new Error(`unknown voice "${voice}"; supported voices: ${Object.keys(VOICE_FILES).join(", ")}`);
      }
      loading ??= load().catch((error: unknown) => {
        loading = undefined; // a failed load (say, offline) must not stick
        throw error;
      });
      const loaded = await loading;
      const phonemes = loaded.phonemize(normalizeText(text));
      const ids = encodePhonemes(phonemes, loaded.vocab);
      const known = countPhonemes(phonemes, loaded.vocab);
      if (known > MAX_PHONEME_IDS) throw tooLongError(known, text);
      const row = Math.min(Math.max(ids.length - 2, 0), MAX_STYLE_ROW);
      const styles = await voiceStyles(loaded, voice);

      const ort = await import("onnxruntime-node");
      const output = await loaded.session.run({
        input_ids: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, ids.length]),
        style: new ort.Tensor("float32", styles.slice(row * STYLE_SIZE, (row + 1) * STYLE_SIZE), [1, STYLE_SIZE]),
        speed: new ort.Tensor("float32", Float32Array.of(1), [1]),
      });
      return { samples: Float32Array.from(output["waveform"]!.data as Float32Array), sampleRate: SAMPLE_RATE };
    },
  };
}
