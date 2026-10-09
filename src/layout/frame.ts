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

/** Output frame size in px. Both formats are 1080p. */
export function frameSize(aspect: Aspect): Size {
  return aspect === "9:16" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}
