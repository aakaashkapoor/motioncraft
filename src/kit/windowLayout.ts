// Shared sizing for the window components: the chrome's metrics, the window's
// box in its area (the content area by default), and the largest mono size at which content fits.

import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";

/** Advance width of one mono character, in em (Source Code Pro and Geist Mono are 0.6; a little spare). */
export const MONO_ADVANCE = 0.62;
/** The smallest mono size tried, as a fraction of the theme's mono size. */
const MIN_MONO_SCALE = 0.55;
/** Each smaller mono size tried is this fraction of the one before. */
const MONO_STEP = 0.92;
/** In 16:9 a window takes this share of the content area's width; in 9:16 all of it. Never more than its area. */
const WIDE_WIDTH = 0.8;

/** Title bar height, as a multiple of the label type size. */
const TITLE_BAR_EM = 2;

export interface WindowMetrics {
  /** Height of the title bar, in px. */
  barHeight: number;
  /** Padding around a window's own content (terminal, code), in px. */
  padding: number;
  /** Border width on each side, in px. */
  border: number;
}

export function windowMetrics(theme: Theme, aspect: Aspect): WindowMetrics {
  return {
    barHeight: Math.round(theme.type.label[aspect].size * TITLE_BAR_EM),
    padding: aspect === "9:16" ? theme.spacing.md : Math.round(theme.spacing.md * 1.25),
    border: theme.hairline,
  };
}

/** Width of a window in `area` and of the content inside its padding, in px. */
export function windowWidth(theme: Theme, aspect: Aspect, area: Rect = contentArea(theme, aspect)): { width: number; inner: number } {
  const full = contentArea(theme, aspect);
  const width = Math.min(Math.round(area.width), Math.round(aspect === "9:16" ? full.width : full.width * WIDE_WIDTH));
  const { padding, border } = windowMetrics(theme, aspect);
  return { width, inner: width - 2 * padding - 2 * border };
}

/** The tallest content that fits inside a window in `area`, in px. */
export function maxInnerHeight(theme: Theme, aspect: Aspect, area: Rect = contentArea(theme, aspect)): number {
  const { barHeight, padding, border } = windowMetrics(theme, aspect);
  return area.height - barHeight - 2 * padding - 2 * border;
}

/** The window's box for content `innerHeight` tall, centered in `area`. */
export function windowBox(theme: Theme, aspect: Aspect, innerHeight: number, area: Rect = contentArea(theme, aspect)): Rect {
  const { barHeight, padding, border } = windowMetrics(theme, aspect);
  const { width } = windowWidth(theme, aspect, area);
  const height = Math.min(area.height, Math.ceil(innerHeight + barHeight + 2 * padding + 2 * border));
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  };
}

/**
 * The largest mono size, stepping down from the theme's, at which `fits`
 * holds. If none does, the smallest: the content then overflows visibly and
 * the layer-1 checks report it.
 */
export function fitMonoSize(theme: Theme, aspect: Aspect, fits: (size: number) => boolean): number {
  const base = theme.type.mono[aspect].size;
  let size = base;
  while (size * MONO_STEP >= base * MIN_MONO_SCALE && !fits(size)) size = Math.round(size * MONO_STEP);
  return size;
}
