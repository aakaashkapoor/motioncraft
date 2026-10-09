// Safe areas (design v3, section C): where readable content may go on each
// aspect, for each safe profile. In 9:16 the platform draws its UI over the
// frame; the text column is symmetric about the frame's center line, and the
// button rail on the right is a keep-out for text, not a shift of the layout.

import { DEFAULT_SAFE_PROFILE, type SafeProfile } from "../storyboard/types";
import { frameSize, type Aspect, type Rect } from "./frame";

export interface SafeZones {
  /** Where text and key elements go: the text column, between the top and bottom margins. */
  area: Rect;
  /** Where text must not go, even inside `area`: the platform's button rail. */
  keepOut: readonly Rect[];
  /** The y a scene's main block centers on: the middle of `area`. */
  opticalCenter: number;
  /** The caption band's bottom: the lowest the caption's last line may sit. */
  captionBottom: number;
  /** Width of the primary visual (a window, a card stack), in px. */
  primaryWidth: number;
}

const rect = (x: number, y: number, right: number, bottom: number): Rect => ({ x, y, width: right - x, height: bottom - y });

interface ZoneSpec {
  area: Rect;
  keepOut: Rect[];
  captionBottom: number;
  primaryWidth: number;
}

/**
 * 1080x1920, design v3 table C.
 *   shorts: top 240, nothing readable below 1440, text column x 120-960, the
 *     like/comment/share rail at x > 900 for y 960-1600, the caption's last
 *     baseline in y 1180-1400.
 *   crosspost (TikTok + Reels + Shorts): top 290, nothing below 1240, centered
 *     text within x 200-880, the rail at x > 880 everywhere, the caption's last
 *     baseline in y 1040-1230.
 * The primary visual is 760-840 px wide in shorts; at 760 the text inside a
 * window or card stays off the rail. Crosspost has only its 680 px column.
 */
const TALL: Record<SafeProfile, ZoneSpec> = {
  shorts: { area: rect(120, 240, 960, 1440), keepOut: [rect(900, 960, 1080, 1600)], captionBottom: 1400, primaryWidth: 760 },
  crosspost: { area: rect(200, 290, 880, 1240), keepOut: [rect(880, 0, 1080, 1920)], captionBottom: 1230, primaryWidth: 680 },
};

/**
 * 1920x1080: no overlaid UI, so 96 px at the sides and 64 px at the top and
 * bottom, the same for every profile. A window takes 80% of the width. By the
 * same rule as 9:16 the optical center is the middle of the safe area, which
 * here is the frame's own center (y 540): the caption is a strip below the
 * content, not part of the composition's middle.
 */
const WIDE: ZoneSpec = { area: rect(96, 64, 1824, 1016), keepOut: [], captionBottom: 1016, primaryWidth: Math.round(1728 * 0.8) };

export function safeZones(aspect: Aspect, profile: SafeProfile = DEFAULT_SAFE_PROFILE): SafeZones {
  const spec = aspect === "9:16" ? TALL[profile] : WIDE;
  return { ...spec, opticalCenter: spec.area.y + spec.area.height / 2 };
}

/** The rectangle text and key elements must stay inside. */
export function safeArea(aspect: Aspect, profile: SafeProfile = DEFAULT_SAFE_PROFILE): Rect {
  return safeZones(aspect, profile).area;
}

/**
 * The widest part of `column` centered on the frame's center line whose band
 * from `top` to `bottom` is clear of every keep-out: the column narrowed the
 * same amount on both sides, so text set in it stays centered.
 */
export function clearOfKeepOuts(aspect: Aspect, zones: SafeZones, column: Rect, top: number, bottom: number): Rect {
  const mid = frameSize(aspect).width / 2;
  let half = Math.min(mid - column.x, column.x + column.width - mid);
  for (const k of zones.keepOut) {
    if (k.y >= bottom || k.y + k.height <= top) continue;
    half = Math.min(half, k.x >= mid ? k.x - mid : mid - (k.x + k.width));
  }
  return { x: mid - half, y: column.y, width: 2 * half, height: column.height };
}
