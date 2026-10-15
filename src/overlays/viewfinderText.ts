// What the viewfinder frame says and how far its ruler has filled, from the
// frame clock. Pure.

import type { Timeline } from "../engine/timeline";
import { frameSize, type Aspect } from "../layout/frame";
import type { StoryboardFrame, StoryboardScene } from "../storyboard/types";
import type { ViewfinderChars } from "./viewfinderLayout";

/** The viewfinder's opacity once it has faded in: decoration, under the scenes' own text. */
export const VIEWFINDER_ALPHA = 0.6;
/** Its fade-in at the start of the video, in ms. */
export const VIEWFINDER_FADE_MS = 300;

const pad = (n: number) => String(n).padStart(2, "0");

/** The video time at `frame` as `HH:MM:SS:FF`. */
export function timecode(frame: number, fps: number): string {
  const seconds = Math.floor(frame / fps);
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}:${pad(frame % fps)}`;
}

/** How far the ruler has filled at `frame`: the time over the video's duration, 0-1. */
export function rulerFill(frame: number, timeline: Timeline): number {
  return Math.min(1, Math.max(0, frame / timeline.totalFrames));
}

/** Where the ruler's ticks sit, 0-1: one at each scene's start, and one at the end. */
export function rulerTicks(timeline: Timeline): number[] {
  return [...timeline.scenes.map((scene) => scene.startFrame / timeline.totalFrames), 1];
}

/** The scene counter: `01 / INTRO`, the scene's index from 1 and its `frameLabel` or `id`, uppercase. */
export function sceneCounter(sceneIndex: number, scene: Pick<StoryboardScene, "id" | "frameLabel">): string {
  return `${pad(sceneIndex + 1)} / ${(scene.frameLabel ?? scene.id).toUpperCase()}`;
}

/** The spec tag: `1920 x 1080 / 60 FPS`. */
export function specTag(aspect: Aspect, fps: number): string {
  const { width, height } = frameSize(aspect);
  return `${width} x ${height} / ${fps} FPS`;
}

/** The viewfinder's opacity at `frame`: fading in over `VIEWFINDER_FADE_MS` from the first frame, then `VIEWFINDER_ALPHA`. */
export function viewfinderOpacity(frame: number, fps: number): number {
  return VIEWFINDER_ALPHA * Math.min(1, (frame * 1000) / fps / VIEWFINDER_FADE_MS);
}

/** The longest text each corner of `frameSpec`'s viewfinder shows over `scenes` (see `viewfinderLayout`); 0 for a corner it leaves empty. */
export function viewfinderChars(
  frameSpec: StoryboardFrame,
  scenes: readonly Pick<StoryboardScene, "id" | "frameLabel">[],
  aspect: Aspect,
  fps: number,
): ViewfinderChars {
  return {
    label: frameSpec.label?.length ?? 0,
    timecode: frameSpec.showTimecode === false ? 0 : timecode(0, fps).length,
    counter: Math.max(...scenes.map((scene, i) => sceneCounter(i, scene).length)),
    spec: frameSpec.showSpec === false ? 0 : specTag(aspect, fps).length,
  };
}
