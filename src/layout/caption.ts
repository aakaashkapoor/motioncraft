// The caption band: the strip the burned-in caption owns, low in the safe area
// but above the platform UI (design v3, section C). Other components lay out
// above it so the two never collide.

import type { Theme } from "../theme/types";
import type { Aspect, Rect } from "./frame";
import { clearOfKeepOuts, safeZones } from "./safe";

export const CAPTION_MAX_LINES = 2;

/** Height of the caption band in px: two lines of caption text (the ramp's `subtitle`) plus the plate's padding. */
export function captionBandHeight(theme: Theme, aspect: Aspect): number {
  const { size, lineHeight } = theme.type.subtitle[aspect];
  return Math.ceil(CAPTION_MAX_LINES * size * lineHeight + 2 * theme.spacing.xs);
}

/**
 * The caption band's rectangle: it ends at the profile's caption bottom and is
 * centered on the frame, narrowed to keep clear of the right rail.
 */
export function captionBand(theme: Theme, aspect: Aspect): Rect {
  const zones = safeZones(aspect, theme.safe);
  const height = captionBandHeight(theme, aspect);
  const y = zones.captionBottom - height;
  const { x, width } = clearOfKeepOuts(aspect, zones, zones.area, y, zones.captionBottom);
  return { x, y, width, height };
}

/** The safe area's text column above the caption band and a gap: where scene content goes. */
export function contentArea(theme: Theme, aspect: Aspect): Rect {
  const { area } = safeZones(aspect, theme.safe);
  const band = captionBand(theme, aspect);
  return { ...area, height: band.y - theme.spacing.md - area.y };
}

/**
 * The content area narrowed the same on both sides so that no line of
 * centered text in it reaches the right rail: the widest a free-standing text
 * block may be (x 180-900 in `shorts`).
 */
export function textColumn(theme: Theme, aspect: Aspect): Rect {
  const area = contentArea(theme, aspect);
  return clearOfKeepOuts(aspect, safeZones(aspect, theme.safe), area, area.y, area.y + area.height);
}
