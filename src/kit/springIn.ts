// A theme spring played over a window of scene progress, for kit components
// that only know `progress` (not frames). Pure.

import { spring, type SpringPreset } from "../engine/spring";

/** Resolution of the stretched spring curve; the result does not depend on it. */
const STEPS = 120;
const FPS = 30;

/**
 * The spring's value, 0 -> 1, as `progress` crosses `[start, start + length]`:
 * 0 before, the preset's settle curve (stretched to the window) inside, exactly
 * 1 after. Bouncy presets overshoot 1 inside the window.
 */
export function springIn(progress: number, start: number, length: number, preset: SpringPreset): number {
  if (progress <= start) return 0;
  if (progress >= start + length) return 1;
  return spring({ frame: ((progress - start) / length) * STEPS, fps: FPS, config: preset, durationInFrames: STEPS });
}
