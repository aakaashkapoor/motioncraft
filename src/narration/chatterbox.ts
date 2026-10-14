// The Chatterbox-Turbo voice, run locally on onnxruntime-node. Its files are
// fetched once into the cache by `ensureFile` the first time something is
// spoken; the voice itself is `assets/voices/chatterbox.json`.
//
// Chatterbox does not say when each word is spoken, so every line is also said
// by Kokoro (`timing`), whose word times are stretched onto Chatterbox's sound.
// Kokoro's length also catches a line Chatterbox mis-spoke (dropped or repeated
// words): it is said again with the next seed. Seeds come from the text, so the
// same line always sounds the same.

import { readFile } from "node:fs/promises";
import { random } from "../engine/random";
import { CHATTERBOX_FILES, defaultCacheDir, ensureFile } from "./assets";
import { plausibleLength, soundSpan, stretchWords } from "./borrowedWords";
import { createBpeTokenizer, type TokenizerJson } from "./bpe";
import { generateSpeech, type ChatterboxSessions, type Generated, type Run } from "./chatterboxModel";
import { CHATTERBOX_VOICE_PATH, decodeVoice, type VoiceConditioning, type VoiceFile } from "./chatterboxVoice";
import type { Speech, Synthesizer } from "./kokoro";
import { CHATTERBOX_VOICES, isChatterboxVoice } from "./voices";

const SAMPLE_RATE = 24000;
/** The Kokoro voice that times Chatterbox's words. */
export const TIMING_VOICE = "af_heart";
/** How many times a line is said before the best take is kept. */
export const ATTEMPTS = 3;

export interface ChatterboxModel {
  sessions: ChatterboxSessions;
  encode: (text: string) => number[];
  voice: VoiceConditioning;
}

export interface ChatterboxOptions {
  /** Times the words and sets the expected length: Kokoro, saying the same text. */
  timing: Synthesizer;
  cacheDir?: string;
  offline?: boolean;
  /** Replaces loading the model files (tests). */
  load?: () => Promise<ChatterboxModel>;
}

async function loadModel(cacheDir: string, offline: boolean | undefined): Promise<ChatterboxModel> {
  const files = CHATTERBOX_FILES;
  const paths = await Promise.all(Object.values(files).map((file) => ensureFile(file, cacheDir, { offline })));
  const path = (name: keyof typeof files): string => paths[Object.keys(files).indexOf(name)]!;
  const ort = await import("onnxruntime-node");
  const open = async (name: keyof typeof files) => {
    const session = await ort.InferenceSession.create(path(name));
    const run: Run = async (feeds) => (await session.run(feeds as Record<string, InstanceType<typeof ort.Tensor>>)) as Record<string, InstanceType<typeof ort.Tensor>>;
    return { session, run };
  };
  const [embed, languageModel, decoder] = await Promise.all([open("embedTokens"), open("languageModel"), open("decoder")]);
  const tokenizer = JSON.parse(await readFile(path("tokenizer"), "utf8")) as TokenizerJson;
  const voice = decodeVoice(JSON.parse(await readFile(CHATTERBOX_VOICE_PATH, "utf8")) as VoiceFile);
  return {
    sessions: {
      embed: embed.run,
      languageModel: languageModel.run,
      decoder: decoder.run,
      pastNames: languageModel.session.inputNames.filter((name) => name.startsWith("past_key_values")),
      tensor: (type, data, dims) => new ort.Tensor(type, data, [...dims]),
    },
    encode: createBpeTokenizer(tokenizer),
    voice,
  };
}

/** How far a take's length is from the expected one (0 is the same); a take that never stopped is the worst. */
function distance(take: Generated, seconds: number, expected: number | undefined): number {
  if (!take.finished) return Infinity;
  return expected === undefined || expected === 0 ? 0 : Math.abs(Math.log(Math.max(seconds, 1e-3) / expected));
}

export function chatterboxSynthesizer(options: ChatterboxOptions): Synthesizer {
  const load = options.load ?? (() => loadModel(options.cacheDir ?? defaultCacheDir(), options.offline));
  let loading: Promise<ChatterboxModel> | undefined;

  return {
    async speak(text, voice): Promise<Speech> {
      if (!isChatterboxVoice(voice)) throw new Error(`unknown voice "${voice}"; supported voices: ${CHATTERBOX_VOICES.join(", ")}`);
      loading ??= load().catch((error: unknown) => {
        loading = undefined; // a failed load (say, offline) must not stick
        throw error;
      });
      const model = await loading;

      const timing = await options.timing.speak(text, TIMING_VOICE, 1);
      const reference = soundSpan(timing.samples);
      const expected = reference === undefined ? undefined : (reference.last - reference.first) / timing.sampleRate;

      let best: { take: Generated; span: ReturnType<typeof soundSpan>; distance: number } | undefined;
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const take = await generateSpeech(model.sessions, model.voice, model.encode(text), (step) => random(`${text}\u0000${attempt}\u0000${step}`));
        const span = soundSpan(take.samples);
        const seconds = span === undefined ? 0 : (span.last - span.first) / SAMPLE_RATE;
        const candidate = { take, span, distance: distance(take, seconds, expected) };
        if (best === undefined || candidate.distance < best.distance) best = candidate;
        if (take.finished && span !== undefined && (expected === undefined || plausibleLength(seconds, expected))) {
          best = candidate;
          break;
        }
      }

      const words =
        timing.words !== undefined && reference !== undefined && best!.span !== undefined
          ? stretchWords(timing.words, reference, best!.span)
          : undefined;
      return { samples: best!.take.samples, sampleRate: SAMPLE_RATE, ...(words === undefined ? {} : { words }) };
    },
  };
}
