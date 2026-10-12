// Narration a scene brings as its own audio file (`audio` in the storyboard)
// instead of the voice: its length from the WAV, its word times from the words
// file or, without one, shared evenly over the audio. Paths resolve against
// the storyboard's folder.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evenWordTimes } from "../kit/captionWords";
import type { Storyboard, StoryboardScene } from "../storyboard/types";
import { parseWordTimes } from "./audioWords";
import type { SceneNarration } from "./types";
import { readWavInfo } from "./wavInfo";

/** Where a scene's audio file and words file are on disk. */
export function sceneAudioPaths(audio: NonNullable<StoryboardScene["audio"]>, mediaDir: string): { wavPath: string; wordsPath?: string } {
  return { wavPath: resolve(mediaDir, audio.file), ...(audio.words === undefined ? {} : { wordsPath: resolve(mediaDir, audio.words) }) };
}

/** A scene's narration from its audio file. Throws when a file is missing or unusable (`checkSceneAudio` says which). */
export async function loadSceneAudio(scene: StoryboardScene, mediaDir: string): Promise<SceneNarration> {
  if (scene.audio === undefined) throw new Error(`scene "${scene.id}" has no audio file`);
  const { wavPath, wordsPath } = sceneAudioPaths(scene.audio, mediaDir);
  const { audioMs } = readWavInfo(new Uint8Array(await readFile(wavPath)));
  if (wordsPath === undefined) return { sceneId: scene.id, wavPath, audioMs, words: evenWordTimes(scene.narration ?? "", 0, audioMs) };
  const parsed = parseWordTimes(JSON.parse(await readFile(wordsPath, "utf8")));
  if (!parsed.ok) throw new Error(`scene "${scene.id}": audio.words "${scene.audio.words}" ${parsed.error}`);
  return { sceneId: scene.id, wavPath, audioMs, words: parsed.words };
}

/** The narration of every scene with its own audio file. */
export async function loadAudioNarration(storyboard: Storyboard, mediaDir: string): Promise<Record<string, SceneNarration>> {
  const result: Record<string, SceneNarration> = {};
  for (const scene of storyboard.scenes) {
    if (scene.audio !== undefined) result[scene.id] = await loadSceneAudio(scene, mediaDir);
  }
  return result;
}
