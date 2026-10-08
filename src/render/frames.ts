// Which frames to render as stills. Pure, so it is easy to test.

import type { Timeline } from "../engine/timeline";

/** Sorted, de-duplicated frame numbers. */
function unique(frames: Iterable<number>): number[] {
  return [...new Set(frames)].sort((a, b) => a - b);
}

/**
 * The start, middle and end frame of every scene. A short scene may share
 * frames between the three, so the result is de-duplicated.
 */
export function perSceneFrames(timeline: Timeline): number[] {
  return unique(
    timeline.scenes.flatMap(({ startFrame, frames }) => [
      startFrame,
      startFrame + Math.floor((frames - 1) / 2),
      startFrame + frames - 1,
    ]),
  );
}

/** Parses a comma-separated frame list like "0,15,30". */
export function parseFrameList(text: string): number[] {
  const parts = text.split(",").map((part) => part.trim());
  const frames = parts.map((part) => {
    if (!/^\d+$/.test(part)) throw new Error(`--frames: "${part}" is not a frame number (use e.g. 0,15,30)`);
    return Number(part);
  });
  return unique(frames);
}

/** Throws if any frame is outside the timeline. */
export function checkFrames(frames: readonly number[], timeline: Timeline): void {
  const last = timeline.totalFrames - 1;
  const bad = frames.filter((n) => !Number.isInteger(n) || n < 0 || n > last);
  if (bad.length > 0) {
    throw new Error(`frame${bad.length > 1 ? "s" : ""} ${bad.join(", ")} out of range: valid frames are 0..${last}`);
  }
}
