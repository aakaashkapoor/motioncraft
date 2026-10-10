// Narrates a storyboard: each scene's `narration` becomes a WAV file and its
// word times, cached by content so unchanged scenes are never spoken twice.

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TimedWord } from "../kit/captionWords";
import type { Storyboard } from "../storyboard/types";
import { KOKORO_REVISION } from "./assets";
import type { Synthesizer } from "./kokoro";
import { splitSentences } from "./sentences";
import { encodeWav } from "./wav";
import { alignWords } from "./wordTimes";

export const DEFAULT_VOICE = "af_heart";
/** Silence between two sentences of a scene. */
export const SENTENCE_GAP_MS = 250;

export interface SceneNarration {
  sceneId: string;
  wavPath: string;
  /** Length of the audio, in ms. */
  audioMs: number;
  /** When each word is spoken, in ms from the start of the scene's audio. */
  words: TimedWord[];
}

interface Sidecar {
  audioMs: number;
  words: TimedWord[];
}

async function readSidecar(path: string): Promise<Sidecar | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Sidecar;
  } catch {
    return undefined;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Speaks `text` sentence by sentence into one recording with its word times. */
async function speakScene(
  text: string,
  voice: string,
  synthesizer: Synthesizer,
): Promise<{ samples: Float32Array; sampleRate: number; audioMs: number; words: TimedWord[] }> {
  const chunks: Float32Array[] = [];
  const spans: { text: string; startMs: number; endMs: number }[] = [];
  let sampleRate = 0;
  let total = 0;
  const msAt = (samples: number): number => (samples / sampleRate) * 1000;

  for (const sentence of splitSentences(text)) {
    const speech = await synthesizer.speak(sentence, voice);
    if (sampleRate === 0) sampleRate = speech.sampleRate;
    if (chunks.length > 0) {
      const gap = new Float32Array(Math.round((SENTENCE_GAP_MS * sampleRate) / 1000));
      chunks.push(gap);
      total += gap.length;
    }
    const startMs = msAt(total);
    chunks.push(speech.samples);
    total += speech.samples.length;
    spans.push({ text: sentence, startMs, endMs: msAt(total) });
  }

  const samples = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return { samples, sampleRate, audioMs: Math.round(msAt(total)), words: alignWords(spans) };
}

export async function narrateStoryboard(
  storyboard: Storyboard,
  options: { synthesizer: Synthesizer; outDir: string; voice?: string },
): Promise<Record<string, SceneNarration>> {
  const voice = options.voice ?? storyboard.voice ?? DEFAULT_VOICE;
  const result: Record<string, SceneNarration> = {};
  await mkdir(options.outDir, { recursive: true });

  for (const scene of storyboard.scenes) {
    if (scene.narration === undefined || splitSentences(scene.narration).length === 0) continue;
    const key = createHash("sha1").update(KOKORO_REVISION + voice + scene.narration).digest("hex");
    const wavPath = join(options.outDir, `${key}.wav`);
    const jsonPath = join(options.outDir, `${key}.json`);

    const cached = (await exists(wavPath)) ? await readSidecar(jsonPath) : undefined;
    if (cached !== undefined) {
      result[scene.id] = { sceneId: scene.id, wavPath, audioMs: cached.audioMs, words: cached.words };
      continue;
    }

    const spoken = await speakScene(scene.narration, voice, options.synthesizer);
    await writeFile(wavPath, encodeWav(spoken.samples, spoken.sampleRate));
    await writeFile(jsonPath, JSON.stringify({ audioMs: spoken.audioMs, words: spoken.words }, null, 2));
    result[scene.id] = { sceneId: scene.id, wavPath, audioMs: spoken.audioMs, words: spoken.words };
  }
  return result;
}
