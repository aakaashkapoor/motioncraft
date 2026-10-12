// Layer-1 checks on scenes that bring their own narration audio: the WAV and
// words file must exist and be usable (errors), and the captions follow the
// words file, so a scene without one (approximate captions) or with words that
// are not the narration's is warned about.

import { readFile } from "node:fs/promises";
import { parseWordTimes, wordMismatch } from "../narration/audioWords";
import { sceneAudioPaths } from "../narration/sceneAudio";
import { readWavInfo } from "../narration/wavInfo";
import { fileProblem } from "../render/media";
import type { Storyboard } from "../storyboard/types";
import type { StoryboardIssue } from "./storyboard";

/** Problems with each scene's `audio` files, resolved against `mediaDir` (the storyboard's folder). */
export async function checkSceneAudio(storyboard: Storyboard, mediaDir: string = process.cwd()): Promise<StoryboardIssue[]> {
  const issues: StoryboardIssue[] = [];
  for (const scene of storyboard.scenes) {
    const { audio } = scene;
    if (audio === undefined) continue;
    const add = (severity: StoryboardIssue["severity"], message: string) => issues.push({ check: "media", severity, sceneId: scene.id, message });
    const { wavPath, wordsPath } = sceneAudioPaths(audio, mediaDir);

    const missing = await fileProblem(wavPath);
    if (missing !== undefined) add("error", `audio.file "${audio.file}" ${missing} (looked for ${wavPath})`);
    else {
      try {
        readWavInfo(new Uint8Array(await readFile(wavPath)));
      } catch (error) {
        add("error", `audio.file "${audio.file}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (wordsPath === undefined) {
      add("warn", `audio.file "${audio.file}" has no audio.words file, so captions and word cues are timed evenly over the audio and will be approximate; add a words file of [{ text, startMs, endMs }]`);
      continue;
    }
    const wordsMissing = await fileProblem(wordsPath);
    if (wordsMissing !== undefined) {
      add("error", `audio.words "${audio.words}" ${wordsMissing} (looked for ${wordsPath})`);
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(wordsPath, "utf8"));
    } catch (error) {
      add("error", `audio.words "${audio.words}" is not valid JSON (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }
    const parsed = parseWordTimes(raw);
    if (!parsed.ok) {
      add("error", `audio.words "${audio.words}" ${parsed.error}`);
      continue;
    }
    const mismatch = wordMismatch(scene.narration ?? "", parsed.words);
    if (mismatch === undefined) continue;
    const counted = (scene.narration ?? "").split(/\s+/).filter(Boolean).length === parsed.words.length;
    // Captions and cues only take measured words one per narration word (see `captionTrack`).
    const effect = counted ? "captions show the words file's words" : "captions and word cues ignore it and are timed evenly";
    add("warn", `audio.words "${audio.words}" does not match the narration: ${mismatch}; ${effect}`);
  }
  return issues;
}
