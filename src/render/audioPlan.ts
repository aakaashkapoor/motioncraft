// Where every sound goes in the video: the narration of each scene and the
// audio of unmuted VideoClips, on the output timeline. Pure; the page mixes it
// (see `audioEncode.ts`).

import { ownValue, type Timeline } from "../engine/timeline";
import { mediaUrl, narrationFileName, narrationUrl } from "../kit/mediaSource";
import type { SceneNarration } from "../narration/types";
import type { Storyboard } from "../storyboard/types";
import type { Theme } from "../theme/types";
import type { ClipAudio } from "./media";

/** The mix and the encoded audio run at this rate, mono. */
export const SAMPLE_RATE = 48_000;
/** A clip's volume while the scene's narrator speaks. */
export const CLIP_GAIN_UNDER_NARRATION = 0.35;

/** One sound in the mix. */
export interface AudioSource {
  /** The URL the page fetches it from. */
  src: string;
  /** Where it starts on the output timeline, ms. */
  startMs: number;
  /** How long it plays in the output, ms. */
  durationMs: number;
  /** Where playback starts in the source, ms. */
  sourceStartMs: number;
  /** Playback speed. */
  rate: number;
  gain: number;
}

export interface AudioPlan {
  /** The video's length, ms. */
  durationMs: number;
  sampleRate: typeof SAMPLE_RATE;
  /** Empty: the video has no audio track. */
  sources: AudioSource[];
}

/** The audio plan for a video: narration first, then unmuted clips. (The timeline already carries the storyboard's scenes.) */
export function audioPlan(
  _storyboard: Storyboard,
  timeline: Timeline,
  theme: Theme,
  narration: Readonly<Record<string, Pick<SceneNarration, "audioMs">>>,
  clipAudio: readonly ClipAudio[],
): AudioPlan {
  const ms = (frames: number) => (frames * 1000) / timeline.fps;
  const voices: AudioSource[] = [];
  const narrated = new Set<string>();
  for (const scene of timeline.scenes) {
    const audio = ownValue(narration, scene.id);
    if (audio === undefined || audio.audioMs <= 0) continue;
    narrated.add(scene.id);
    voices.push({
      src: narrationUrl(narrationFileName(scene.id)),
      startMs: ms(scene.startFrame) + theme.motion.leadMs,
      durationMs: audio.audioMs,
      sourceStartMs: 0,
      rate: 1,
      gain: 1,
    });
  }
  const clips = clipAudio
    .filter((clip) => !clip.muted && clip.durationMs > 0)
    .map(
      (clip): AudioSource => ({
        src: mediaUrl(clip.src),
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        sourceStartMs: clip.sourceStartMs,
        rate: clip.rate,
        gain: narrated.has(clip.sceneId) ? CLIP_GAIN_UNDER_NARRATION : 1,
      }),
    );
  return { durationMs: ms(timeline.totalFrames), sampleRate: SAMPLE_RATE, sources: [...voices, ...clips] };
}
