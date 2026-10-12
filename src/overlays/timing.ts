// When an overlay shows. It spans the runs of consecutive scenes it is listed
// on; it fades in and out over `OVERLAY_FADE_MS` only where a run starts or
// ends, so a transition between two of its scenes does not touch it. The first
// frame of the video and the last are never faded: the thumbnail shows it, and
// the video ends on it.

import type { Timeline } from "../engine/timeline";
import type { StoryboardOverlay } from "../storyboard/types";
import { OVERLAY_FADE_MS } from "./layout";

/** A run of consecutive scenes: frames `startFrame` up to, not including, `endFrame`. */
export interface OverlayRange {
  startFrame: number;
  endFrame: number;
}

/** The runs of consecutive scenes `overlay` shows on, in frames. */
export function overlayRanges(overlay: Pick<StoryboardOverlay, "scenes">, sceneIds: readonly string[], timeline: Timeline): OverlayRange[] {
  const ranges: OverlayRange[] = [];
  let open: OverlayRange | undefined;
  sceneIds.forEach((id, i) => {
    const scene = timeline.scenes[i]!;
    if (overlay.scenes !== undefined && !overlay.scenes.includes(id)) {
      open = undefined;
      return;
    }
    const endFrame = Math.min(timeline.totalFrames, scene.startFrame + scene.frames);
    if (open === undefined) ranges.push((open = { startFrame: scene.startFrame, endFrame }));
    else open.endFrame = endFrame;
  });
  return ranges;
}

/** The overlay's opacity at `frame`: 0 outside its ranges, 1 inside except in the fade at a range's edges. */
export function overlayOpacity(ranges: readonly OverlayRange[], frame: number, timeline: Timeline): number {
  const range = ranges.find((r) => frame >= r.startFrame && frame < r.endFrame);
  if (range === undefined) return 0;
  const ms = (frame * 1000) / timeline.fps;
  const fadeIn = range.startFrame === 0 ? 1 : (ms - (range.startFrame * 1000) / timeline.fps) / OVERLAY_FADE_MS;
  const fadeOut = range.endFrame >= timeline.totalFrames ? 1 : ((range.endFrame * 1000) / timeline.fps - ms) / OVERLAY_FADE_MS;
  return Math.max(0, Math.min(1, fadeIn, fadeOut));
}
