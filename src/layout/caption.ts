// The caption band: the strip the burned-in caption owns, low in the safe area
// but above the platform UI (design v3, section C). Other components lay out
// above it so the two never collide. Also the type and page size of each
// caption style (life #4).

import type { CaptionStyle } from "../storyboard/types";
import type { Theme, TypeSpec } from "../theme/types";
import type { Aspect, Rect } from "./frame";
import { clearOfKeepOuts, safeZones } from "./safe";

export const CAPTION_MAX_LINES = 2;

/** A caption style that draws something. */
export type ShownCaptionStyle = Exclude<CaptionStyle, "off">;

/** Words per caption page: 3-6 for explainers, 1-3 very large words for punch. */
export const CAPTION_PAGE_WORDS: Record<ShownCaptionStyle, { min: number; max: number }> = {
  standard: { min: 3, max: 6 },
  punch: { min: 1, max: 3 },
};

/** A caption style's type: `standard` is the ramp's `subtitle` at bold, `punch` its `headline` at heavy. */
export function captionType(theme: Theme, aspect: Aspect, style: ShownCaptionStyle): TypeSpec {
  return style === "punch"
    ? { ...theme.type.headline[aspect], weight: theme.weights.heavy }
    : { ...theme.type.subtitle[aspect], weight: theme.weights.bold };
}

/**
 * Height of the caption band in px: two lines of caption text (the ramp's
 * `subtitle`) plus the plate's padding, over room for a page to rise in from
 * (`motion.caption.risePx`), so an entering page never dips out of the band.
 */
export function captionBandHeight(theme: Theme, aspect: Aspect): number {
  const { size, lineHeight } = theme.type.subtitle[aspect];
  return Math.ceil(CAPTION_MAX_LINES * size * lineHeight + 2 * theme.spacing.xs + theme.motion.caption.risePx);
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
