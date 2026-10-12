// Frame sizes for each supported aspect ratio. Safe areas are in `./safe`.

import type { Aspect } from "../storyboard/types";

// One definition of the supported aspects lives with the storyboard format.
export type { Aspect };

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FRAME_SIZES: Record<Aspect, Size> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

/** Output frame size in px: 9:16 and 16:9 are 1080p; 4:5 is the 1080x1350 feed post. */
export function frameSize(aspect: Aspect): Size {
  return FRAME_SIZES[aspect];
}

/** Whether the frame is taller than wide (9:16, 4:5). Tall aspects stack: a second block goes below, not beside. */
export function isTall(aspect: Aspect): boolean {
  const { width, height } = frameSize(aspect);
  return height > width;
}
