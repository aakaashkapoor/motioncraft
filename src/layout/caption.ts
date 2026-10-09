// The caption band: the strip at the bottom of the safe area that the burned-in
// caption owns. Other components lay out above it so the two never collide.

import type { Theme } from "../theme/types";
import { safeArea, type Aspect, type Rect } from "./frame";

export const CAPTION_MAX_LINES = 2;

/** Height of the caption band in px: two lines of caption text (the ramp's `subtitle`) plus the plate's padding. */
export function captionBandHeight(theme: Theme, aspect: Aspect): number {
  const { size, lineHeight } = theme.type.subtitle[aspect];
  return Math.ceil(CAPTION_MAX_LINES * size * lineHeight + 2 * theme.spacing.xs);
}

/** The caption band's rectangle: the bottom of the safe area. */
export function captionBand(theme: Theme, aspect: Aspect): Rect {
  const safe = safeArea(aspect);
  const height = captionBandHeight(theme, aspect);
  return { x: safe.x, y: safe.y + safe.height - height, width: safe.width, height };
}

/** The safe area minus the caption band and a gap above it: where scene content goes. */
export function contentArea(theme: Theme, aspect: Aspect): Rect {
  const safe = safeArea(aspect);
  const band = captionBand(theme, aspect);
  return { ...safe, height: band.y - theme.spacing.md - safe.y };
}
