// Narrates a storyboard: each scene's `narration` becomes a WAV file and its
// word times, cached by content so unchanged scenes are never spoken twice.

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TimedWord } from "../kit/captionWords";
import type { Storyboard } from "../storyboard/types";
import { KOKORO_REVISION, KOKORO_TIMESTAMPED_REVISION, MISAKI_REVISION } from "./assets";
import type { Speech, Synthesizer } from "./kokoro";
import type { CachedNarration, SceneNarration } from "./types";
import { splitForSpeech } from "./pieces";
import { pronunciationsIn, sayAs } from "./pronounce";
import { splitSentences } from "./sentences";
import { trimSilence, type Trimmed } from "./silence";
import { encodeWav } from "./wav";
import { alignWords } from "./wordTimes";

/** Bump to discard every cached narration when how it is made changes. */
export const NARRATION_CACHE_VERSION = 6;
export const DEFAULT_VOICE = "af_heart";
/** Silence between two sentences of a scene. */
export const SENTENCE_GAP_MS = 250;

export type { CachedNarration, SceneNarration } from "./types";

interface Sidecar {
  audioMs: number;
  words: TimedWord[];
}

async function readSidecar(path: string): Promise<Sidecar | undefined> {
  try {
    const sidecar = JSON.parse(await readFile(path, "utf8")) as Partial<Sidecar> | null;
    const valid =
      typeof sidecar?.audioMs === "number" &&
      Number.isFinite(sidecar.audioMs) &&
      Array.isArray(sidecar.words) &&
      sidecar.words.every(
        (w) => typeof w?.text === "string" && Number.isFinite(w.startMs) && Number.isFinite(w.endMs),
      );
    return valid ? (sidecar as Sidecar) : undefined;
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

/**
 * The words of one piece timed by the voice, on the scene clock. `pieceStart`
 * is where the piece's kept sound begins in the scene (in samples), `trimmed`
 * how it was cut from `speech`. Undefined when the voice gave no word times
 * or not one per word.
 */
function spokenWords(
  piece: string,
  speech: Speech,
  trimmed: Trimmed,
  pieceStart: number,
  msAt: (samples: number) => number,
): TimedWord[] | undefined {
  const words = piece.split(/\s+/).filter(Boolean);
  if (speech.words === undefined || speech.words.length !== words.length) return undefined;
  const clamp = (sample: number): number => Math.min(Math.max(sample, 0), trimmed.samples.length);
  const at = (sample: number): number => msAt(pieceStart + clamp(sample - trimmed.startSample));
  return words.map((text, i) => ({
    text,
    startMs: at(speech.words![i]!.startSample),
    endMs: at(speech.words![i]!.endSample),
  }));
}

/**
 * Speaks `text` sentence by sentence into one recording with its word times.
 * The voice says each word as `pronounce` maps it; the words keep the written text.
 */
async function speakScene(
  text: string,
  voice: string,
  synthesizer: Synthesizer,
  pronounce: Storyboard["pronounce"],
): Promise<{ samples: Float32Array; sampleRate: number; audioMs: number; words: TimedWord[] }> {
  const chunks: Float32Array[] = [];
  const words: TimedWord[] = [];
  let sampleRate = 0;
  let total = 0;
  const msAt = (samples: number): number => (samples / sampleRate) * 1000;

  for (const sentence of splitSentences(text)) {
    // A long sentence is spoken in pieces back to back; only sentences get a gap.
    // Each piece is trimmed of the silence around it, so word times match the sound.
    for (const [i, piece] of splitForSpeech(sentence).entries()) {
      const speech = await synthesizer.speak(sayAs(piece, pronounce), voice);
      if (sampleRate === 0) sampleRate = speech.sampleRate;
      const trimmed = trimSilence(speech.samples, speech.sampleRate);
      const { samples: sound, leadSamples, tailSamples } = trimmed;
      if (i === 0 && chunks.length > 0) {
        const gap = new Float32Array(Math.round((SENTENCE_GAP_MS * sampleRate) / 1000));
        chunks.push(gap);
        total += gap.length;
      }
      const pieceStart = total;
      chunks.push(sound);
      total += sound.length;
      // Words the voice timed keep its times. Otherwise they share the sound itself, not the margins kept around it.
      words.push(
        ...(spokenWords(piece, speech, trimmed, pieceStart, msAt) ??
          alignWords([{ text: piece, startMs: msAt(pieceStart + leadSamples), endMs: msAt(total - tailSamples) }])),
      );
    }
  }

  const samples = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return { samples, sampleRate, audioMs: Math.round(msAt(total)), words };
}

/** Where a storyboard file's narration is kept: `.motioncraft/narration/` beside it. */
export function narrationDir(storyboardFile: string): string {
  return join(dirname(storyboardFile), ".motioncraft", "narration");
}

interface SceneFiles {
  sceneId: string;
  text: string;
  wavPath: string;
  jsonPath: string;
}

/** The narrated scenes of a storyboard and where each one's cached files live. */
function sceneFiles(storyboard: Storyboard, outDir: string, voice: string | undefined): { voice: string; files: SceneFiles[] } {
  const chosen = voice ?? storyboard.voice ?? DEFAULT_VOICE;
  const files: SceneFiles[] = [];
  for (const scene of storyboard.scenes) {
    if (scene.narration === undefined || splitSentences(scene.narration).length === 0) continue;
    const parts = [NARRATION_CACHE_VERSION, KOKORO_REVISION, KOKORO_TIMESTAMPED_REVISION, MISAKI_REVISION, chosen, scene.narration];
    // Only the pronunciations this scene uses, so a scene without any keeps its key.
    const said = pronunciationsIn(scene.narration, storyboard.pronounce);
    if (said.length > 0) parts.push(JSON.stringify(said));
    const key = createHash("sha1").update(parts.join("\0")).digest("hex");
    files.push({ sceneId: scene.id, text: scene.narration, wavPath: join(outDir, `${key}.wav`), jsonPath: join(outDir, `${key}.json`) });
  }
  return { voice: chosen, files };
}

async function readCached(file: SceneFiles): Promise<SceneNarration | undefined> {
  const sidecar = (await exists(file.wavPath)) ? await readSidecar(file.jsonPath) : undefined;
  return sidecar === undefined ? undefined : { sceneId: file.sceneId, wavPath: file.wavPath, audioMs: sidecar.audioMs, words: sidecar.words };
}

/**
 * The scenes whose narration is already on disk (a wav and a valid sidecar),
 * and the narrated scenes that are not. Never speaks and never needs the model.
 */
export async function loadCachedNarration(
  storyboard: Storyboard,
  options: { outDir: string; voice?: string },
): Promise<CachedNarration> {
  const result: CachedNarration = { scenes: {}, missing: [] };
  for (const file of sceneFiles(storyboard, options.outDir, options.voice).files) {
    const cached = await readCached(file);
    if (cached === undefined) result.missing.push(file.sceneId);
    else result.scenes[file.sceneId] = cached;
  }
  return result;
}

/** A line telling that some narrated scenes have no audio yet, or undefined when all (or none) are cached. */
export function missingNarrationNotice(cached: CachedNarration): string | undefined {
  if (cached.missing.length === 0) return undefined;
  const total = Object.keys(cached.scenes).length + cached.missing.length;
  return `narration: ${total - cached.missing.length} of ${total} scenes cached; run scripts/narrate.ts for timing from audio`;
}

export async function narrateStoryboard(
  storyboard: Storyboard,
  options: { synthesizer: Synthesizer; outDir: string; voice?: string; onProgress?: (done: number, total: number) => void },
): Promise<Record<string, SceneNarration>> {
  const { voice, files } = sceneFiles(storyboard, options.outDir, options.voice);
  const result: Record<string, SceneNarration> = {};
  await mkdir(options.outDir, { recursive: true });

  for (const [i, file] of files.entries()) {
    options.onProgress?.(i + 1, files.length);
    const cached = await readCached(file);
    if (cached !== undefined) {
      result[file.sceneId] = cached;
      continue;
    }
    const spoken = await speakScene(file.text, voice, options.synthesizer, storyboard.pronounce);
    await writeFile(file.wavPath, encodeWav(spoken.samples, spoken.sampleRate));
    await writeFile(file.jsonPath, JSON.stringify({ audioMs: spoken.audioMs, words: spoken.words }, null, 2));
    result[file.sceneId] = { sceneId: file.sceneId, wavPath: file.wavPath, audioMs: spoken.audioMs, words: spoken.words };
  }
  return result;
}
