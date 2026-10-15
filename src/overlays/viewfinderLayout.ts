// Where the viewfinder frame sits: its brackets at the corners of the safe
// area (narrowed the same on both sides to clear any keep-out at its top and
// bottom rows), a text row just inside the top brackets and one just inside
// the bottom ones. A row whose two texts do not fit side by side takes two
// lines, the second text flush right on the second. In a portrait frame the
// ruler takes its own line above the bottom row; in a landscape one it runs
// between the bottom row's texts. Scenes lay out between the rows, and the
// caption band lifts to clear the bottom one. Pure; the page draws what this says.

import { MONO_ADVANCE } from "../kit/windowLayout";
import { captionBand, contentArea, withCaptionsShown } from "../layout/caption";
import type { Aspect, Rect } from "../layout/frame";
import { clearOfKeepOuts, safeZones } from "../layout/safe";
import type { Theme } from "../theme/types";

/** A corner bracket's arm, in px at 1080p (both aspects are 1080 px on their short side). */
export const BRACKET_PX = 28;
/** The brackets' and the ruler's line, in px. */
export const VIEWFINDER_LINE_PX = 1.5;
/** The least room the ruler needs between the bottom row's texts in a landscape frame, in px. */
const MIN_INLINE_RULER_PX = 240;

/** The longest text each corner shows over the video, in characters. */
export interface ViewfinderChars {
  label: number;
  timecode: number;
  counter: number;
  spec: number;
}

/** The widest each corner can be: a 32-character label, `HH:MM:SS:FF`, `99 / ` and a 24-character frame label, `1080 x 1920 / 120 FPS`. */
export const WIDEST_VIEWFINDER_CHARS: ViewfinderChars = { label: 32, timecode: 11, counter: 29, spec: 21 };

export interface ViewfinderLayout {
  /** The rectangle whose corners the brackets mark. */
  box: Rect;
  /** The top text row (label, timecode) and the bottom one (scene counter, spec), each one or two lines tall. */
  top: Rect;
  bottom: Rect;
  /** The ruler's own line above the bottom row (portrait), or undefined when it runs inside the bottom row. */
  ruler?: Rect;
  /** One line of text, in px. */
  lineHeight: number;
  /** The gap between a row's two texts, in px. */
  gap: number;
  /** How far up the caption band moves so the caption sits above the bottom row, in px. */
  captionLift: number;
  /** The content area a scene lays out in: between the rows and, with captions, above the lifted caption band. */
  contentArea(captionsShown: boolean): Rect;
}

export function viewfinderLayout(theme: Theme, aspect: Aspect, chars: ViewfinderChars = WIDEST_VIEWFINDER_CHARS): ViewfinderLayout {
  const zones = safeZones(aspect, theme.safe);
  const { area } = zones;
  const spec = theme.type.eyebrow[aspect];
  const lineHeight = Math.ceil(spec.size * spec.lineHeight);
  const textWidth = (n: number) => n * spec.size * (MONO_ADVANCE + spec.tracking);
  const inset = theme.spacing.xs;
  const gap = theme.spacing.sm;
  const bottomEdge = area.y + area.height;
  // The keep-outs are cleared for the deepest the rows can be: two lines and the ruler's.
  const depth = 2 * inset + 3 * lineHeight;
  const columns = [clearOfKeepOuts(aspect, zones, area, area.y, area.y + depth), clearOfKeepOuts(aspect, zones, area, bottomEdge - depth, bottomEdge)];
  const column = columns.reduce((narrow, c) => (c.width < narrow.width ? c : narrow));
  const box = { x: column.x, y: area.y, width: column.width, height: area.height };
  const width = box.width - 2 * inset;
  const portrait = box.height > box.width;
  // Side by side only with clear air between the two, so they never read as one line.
  const lines = (a: number, b: number, reserve = 0) => (textWidth(a) + theme.spacing.xl + textWidth(b) + reserve <= width ? 1 : 2);
  const topLines = lines(chars.label, chars.timecode);
  const bottomLines = lines(chars.counter, chars.spec, portrait ? 0 : MIN_INLINE_RULER_PX + gap);
  const top = { x: box.x + inset, y: box.y + inset, width, height: topLines * lineHeight };
  const bottomHeight = bottomLines * lineHeight;
  const bottom = { x: box.x + inset, y: bottomEdge - inset - bottomHeight, width, height: bottomHeight };
  // Portrait, or a landscape bottom row too full for an inline ruler: the ruler gets its own line above the row.
  const ruler = portrait || bottomLines === 2 ? { x: bottom.x, y: bottom.y - theme.spacing.xs - Math.round(lineHeight / 2), width, height: Math.round(lineHeight / 2) } : undefined;
  const lowest = ruler?.y ?? bottom.y;
  const band = captionBand(theme, aspect);
  const captionLift = Math.max(0, band.y + band.height - (lowest - theme.spacing.xs));
  return {
    box,
    top,
    bottom,
    ...(ruler !== undefined && { ruler }),
    lineHeight,
    gap,
    captionLift,
    contentArea(captionsShown) {
      const base = contentArea(withCaptionsShown(theme, captionsShown), aspect);
      const y = Math.max(base.y, top.y + top.height + theme.spacing.md);
      const end = Math.min(base.y + base.height - (captionsShown ? captionLift : 0), lowest - theme.spacing.md);
      return { x: base.x, y, width: base.width, height: end - y };
    },
  };
}
