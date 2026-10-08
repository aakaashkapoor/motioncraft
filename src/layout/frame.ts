// Frame sizes and safe areas for each supported aspect ratio.

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

/** Margins as fractions of the frame's width (left/right) or height (top/bottom). */
interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const MARGINS: Record<Aspect, Margins> = {
  // Vertical (Shorts, Reels, TikTok): the platform draws over the frame.
  //   top 8%    (154px) - status bar, search/back buttons, "Following | For You" tabs
  //   right 12% (130px) - like / comment / share / profile button column
  //   bottom 18% (346px) - caption text, username, music ticker, progress bar
  //   left 5%   (54px)  - breathing room so text never touches the edge
  "9:16": { top: 0.08, right: 0.12, bottom: 0.18, left: 0.05 },
  // Widescreen: no overlaid UI, so a uniform 5% title-safe margin
  // (96px left/right, 54px top/bottom).
  "16:9": { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
};

/**
 * The rectangle content must stay inside. Edges are rounded inward so the
 * area never crosses into a margin.
 */
export function safeArea(aspect: Aspect): Rect {
  const { width, height } = frameSize(aspect);
  const m = MARGINS[aspect];
  const x = Math.ceil(width * m.left);
  const y = Math.ceil(height * m.top);
  const right = Math.floor(width * (1 - m.right));
  const bottom = Math.floor(height * (1 - m.bottom));
  return { x, y, width: right - x, height: bottom - y };
}
