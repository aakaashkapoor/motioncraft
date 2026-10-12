// Where an overlay's pill sits: a corner of the safe area, clear of the
// platform's keep-outs and of the caption band. Pure; the page draws what this
// says. A scene's header makes room for a pill in a top corner (see
// `sceneAreaUnderOverlays`), so the pill itself never moves.

import { captionBand } from "../layout/caption";
import type { Aspect, Rect } from "../layout/frame";
import { clearOfKeepOuts, safeZones } from "../layout/safe";
import { AVG_CHAR_EM } from "../layout/textFit";
import type { OverlayCorner } from "../storyboard/types";
import type { Theme } from "../theme/types";

/** Uppercase caps are a little wider than the average glyph the text-fit estimate assumes; spaces and narrow letters make up for the rest. */
const CAPS_EM = AVG_CHAR_EM + 0.02;

/** The pill's surface at this opacity. */
export const OVERLAY_PILL_ALPHA = 0.85;
/** Fade at the start and end of an overlay's scene range, in ms. */
export const OVERLAY_FADE_MS = 200;

/**
 * The room an overlay's pill has in its corner: the safe area above the caption
 * band, for the rows `height` px deep at the top or bottom, narrowed the same
 * on both sides to clear any keep-out in those rows.
 */
export function overlayRegion(theme: Theme, aspect: Aspect, corner: OverlayCorner, height: number): Rect {
  const zones = safeZones(aspect, theme.safe);
  const floor = captionBand(theme, aspect).y - theme.spacing.md;
  const top = corner.startsWith("top") ? zones.area.y : floor - height;
  const column = clearOfKeepOuts(aspect, zones, zones.area, top, top + height);
  return { x: column.x, y: top, width: column.width, height };
}

/**
 * How far a pill keeps from a scene's header text: a full gap beside it, since
 * a tag and an eyebrow side by side on one row closer than that read as one
 * line, and a line gap above or below it.
 */
export function overlayClearance(theme: Theme): { x: number; y: number } {
  return { x: theme.spacing.lg, y: theme.spacing.xs };
}

/** `rect` grown by `by` on every side. */
export function grownBy(rect: Rect, by: { x: number; y: number }): Rect {
  return { x: rect.x - by.x, y: rect.y - by.y, width: rect.width + 2 * by.x, height: rect.height + 2 * by.y };
}

/** The pill's padding in px. */
export function overlayPadding(theme: Theme): { x: number; y: number } {
  return { x: theme.spacing.sm, y: theme.spacing.xs };
}

/** An estimate of the pill's size for `text`; the page lets the real text decide, anchored at the corner. */
export function overlaySize(theme: Theme, aspect: Aspect, text: string): { width: number; height: number } {
  const { size, lineHeight, tracking } = theme.type.eyebrow[aspect];
  const pad = overlayPadding(theme);
  return { width: Math.ceil(text.length * size * (CAPS_EM + tracking) + 2 * pad.x), height: Math.ceil(size * lineHeight + 2 * pad.y) };
}

/** The pill's estimated box in frame px, tucked into `corner` of its region. */
export function overlayBox(theme: Theme, aspect: Aspect, text: string, corner: OverlayCorner): Rect {
  const { width, height } = overlaySize(theme, aspect, text);
  const region = overlayRegion(theme, aspect, corner, height);
  const x = corner.endsWith("left") ? region.x : region.x + region.width - width;
  return { x, y: region.y, width, height };
}
