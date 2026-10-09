// Which frames the checks measure by default: the frames of each scene where
// its content is fully on screen, so problems during entrance and exit motion
// are seen, not hidden by the fades at the very start and end of the scene.
// Frames inside a scene transition, where two scenes overlap, are skipped.

import { soloFrames, type Timeline } from "../engine/timeline";
import type { MeasuredFrame } from "./judge";
import type { FrameMeasurement } from "./types";

/** At or above this content opacity a frame counts as fully visible. */
export const FULLY_VISIBLE = 0.99;

/** Renders and measures one frame. */
export type MeasureFrame = (frame: number) => Promise<FrameMeasurement>;

/** Opacity of the faintest text or key element on the frame; 0 if it shows none. */
export function contentOpacity(measurement: FrameMeasurement): number {
  const opacities = [...measurement.texts, ...measurement.keys].map((element) => element.opacity);
  return opacities.length === 0 ? 0 : Math.min(...opacities);
}

/**
 * For every scene, measures its first fully visible frame after the entrance,
 * its middle frame, and its last fully visible frame before the exit, stepping
 * inward from each end of the scene's solo frames (outside transitions) until
 * content opacity reaches `FULLY_VISIBLE`. The middle frame is always included, even when the scene is
 * never fully visible. Returns the chosen frames' measurements in frame order.
 */
export async function sampleVisibleFrames(timeline: Timeline, measure: MeasureFrame): Promise<MeasuredFrame[]> {
  const cache = new Map<number, FrameMeasurement>();
  const measured = async (frame: number): Promise<FrameMeasurement> => {
    let measurement = cache.get(frame);
    if (measurement === undefined) {
      measurement = await measure(frame);
      cache.set(frame, measurement);
    }
    return measurement;
  };
  const firstVisible = async (from: number, to: number, step: 1 | -1): Promise<number | undefined> => {
    for (let frame = from; frame !== to; frame += step) {
      if (contentOpacity(await measured(frame)) >= FULLY_VISIBLE) return frame;
    }
    return undefined;
  };

  const chosen = new Set<number>();
  for (let i = 0; i < timeline.scenes.length; i++) {
    const { first, last } = soloFrames(timeline, i);
    const middle = first + Math.floor((last - first) / 2);
    chosen.add(middle);
    const entered = await firstVisible(first, middle, 1);
    if (entered !== undefined) chosen.add(entered);
    const leaving = await firstVisible(last, middle, -1);
    if (leaving !== undefined) chosen.add(leaving);
  }

  const frames = [...chosen].sort((a, b) => a - b);
  const result: MeasuredFrame[] = [];
  for (const frame of frames) result.push({ frame, measurement: await measured(frame) });
  return result;
}
