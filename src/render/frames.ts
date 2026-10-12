// Which frames to render as stills. Pure, so it is easy to test.

import { soloFrames, type Timeline, type TimelineScene } from "../engine/timeline";

/** Sorted, de-duplicated frame numbers. */
function unique(frames: Iterable<number>): number[] {
  return [...new Set(frames)].sort((a, b) => a - b);
}

/** The middle frame of a scene (the earlier one when it has an even frame count). */
export function sceneMiddleFrame({ startFrame, frames }: TimelineScene): number {
  return startFrame + Math.floor((frames - 1) / 2);
}

/**
 * The start, middle and end frame of every scene. A short scene may share
 * frames between the three, so the result is de-duplicated.
 */
export function perSceneFrames(timeline: Timeline): number[] {
  return unique(
    timeline.scenes.flatMap((scene) => [scene.startFrame, sceneMiddleFrame(scene), scene.startFrame + scene.frames - 1]),
  );
}

export interface SlideFrame {
  sceneId: string;
  /** `<NN>-<sceneId>.png`, NN being the scene's place in the storyboard, from 01. */
  fileName: string;
  frame: number;
}

/**
 * The frame to render as each chosen scene's slide (every scene by default):
 * the last one before its exit begins, when everything has entered. Throws on
 * an id that is not a scene.
 */
export function slideFrames(timeline: Timeline, ids?: readonly string[]): SlideFrame[] {
  const known = timeline.scenes.map((scene) => scene.id);
  const unknown = (ids ?? []).filter((id) => !known.includes(id));
  if (unknown.length > 0) throw new Error(`--slides: no scene ${unknown.map((id) => `"${id}"`).join(", ")} (scenes: ${known.join(", ")})`);
  return timeline.scenes.flatMap((scene, index) =>
    ids === undefined || ids.length === 0 || ids.includes(scene.id)
      ? [{ sceneId: scene.id, fileName: `${String(index + 1).padStart(2, "0")}-${scene.id}.png`, frame: soloFrames(timeline, index).last }]
      : [],
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
