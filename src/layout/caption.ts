// The caption band: the strip the burned-in caption owns, low in the safe area
// but above the platform UI (design v3, section C). Other components lay out
// above it so the two never collide; a storyboard with no captions gives the
// band back to the content. Also the type and page size of each
// caption style (life #4).

import type { CaptionStyle, Storyboard } from "../storyboard/types";
import type { Theme, TypeSpec } from "../theme/types";
import type { Aspect, Rect } from "./frame";
import { clearOfKeepOuts, safeZones } from "./safe";

export const CAPTION_MAX_LINES = 2;

/** A caption style that draws something. */
export type ShownCaptionStyle = Exclude<CaptionStyle, "off">;

/** Words per caption page: 3-6 for explainers, 1-3 very large words for punch and pill, which page alike. */
export const CAPTION_PAGE_WORDS: Record<ShownCaptionStyle, { min: number; max: number }> = {
  standard: { min: 3, max: 6 },
  punch: { min: 1, max: 3 },
  pill: { min: 1, max: 3 },
};

/** A caption style's type: `standard` is the ramp's `subtitle` at bold, `punch` its `headline` at heavy, `pill` its `headline` at bold. */
export function captionType(theme: Theme, aspect: Aspect, style: ShownCaptionStyle): TypeSpec {
  if (style === "standard") return { ...theme.type.subtitle[aspect], weight: theme.weights.bold };
  return { ...theme.type.headline[aspect], weight: style === "punch" ? theme.weights.heavy : theme.weights.bold };
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

/**
 * A theme that knows whether its storyboard draws captions. The flag rides on
 * the theme so every layout helper sees it without a new argument; absent
 * means shown, so a plain theme lays out as it always has.
 */
export type CaptionedTheme = Theme & { captionsShown?: boolean };

/** Whether the storyboard ever draws a caption: captions are not `off` and some scene is narrated. */
export function captionsShown(storyboard: Pick<Storyboard, "captionStyle"> & { scenes: readonly { narration?: string }[] }): boolean {
  return storyboard.captionStyle !== "off" && storyboard.scenes.some((scene) => scene.narration !== undefined);
}

/** `theme` marked with whether captions are shown, for `contentArea` and `textColumn`. */
export function withCaptionsShown(theme: Theme, shown: boolean): CaptionedTheme {
  return (theme as CaptionedTheme).captionsShown === shown ? theme : { ...theme, captionsShown: shown };
}

/**
 * Where scene content goes: the safe area's text column above the caption
 * band and a gap, or, when the storyboard draws no captions, down to the
 * lowest the profile lets content sit (the safe area's or the caption's
 * bottom) less the same gap.
 */
export function contentArea(theme: Theme, aspect: Aspect): Rect {
  const zones = safeZones(aspect, theme.safe);
  const { area } = zones;
  const bottom = (theme as CaptionedTheme).captionsShown === false ? Math.min(area.y + area.height, zones.captionBottom) : captionBand(theme, aspect).y;
  return { ...area, height: bottom - theme.spacing.md - area.y };
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
