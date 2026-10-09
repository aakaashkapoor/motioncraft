// Shared sizing for the window components: the chrome's metrics, the window's
// box in the content area, and the largest mono size at which content fits.

import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { fontSize } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";

/** Advance width of one mono character, in em (Geist Mono is 0.6; a little spare). */
export const MONO_ADVANCE = 0.62;
/** The smallest mono size tried, as a fraction of the theme's mono size. */
const MIN_MONO_SCALE = 0.55;
/** Each smaller mono size tried is this fraction of the one before. */
const MONO_STEP = 0.92;
/** In 16:9 a window takes this share of the content width; in 9:16 all of it. */
const WIDE_WIDTH = 0.8;

export interface WindowMetrics {
  /** Height of the title bar, in px. */
  barHeight: number;
  /** Title font size, in px. */
  titleSize: number;
  /** Diameter of a traffic light, in px. */
  lightSize: number;
  /** Padding around the window's content, in px. */
  padding: number;
}

export function windowMetrics(theme: Theme, aspect: Aspect): WindowMetrics {
  const titleSize = Math.round(fontSize(theme, "caption", aspect) * 0.8);
  return {
    barHeight: Math.round(titleSize * 2.2),
    titleSize,
    lightSize: Math.round(titleSize * 0.6),
    padding: aspect === "9:16" ? theme.spacing.md : Math.round(theme.spacing.md * 1.25),
  };
}

/** Width of a window and of the content inside its padding, in px. */
export function windowWidth(theme: Theme, aspect: Aspect): { width: number; inner: number } {
  const area = contentArea(theme, aspect);
  const width = Math.round(aspect === "9:16" ? area.width : area.width * WIDE_WIDTH);
  return { width, inner: width - 2 * windowMetrics(theme, aspect).padding };
}

/** The tallest content that fits inside a window in the content area, in px. */
export function maxInnerHeight(theme: Theme, aspect: Aspect): number {
  const { barHeight, padding } = windowMetrics(theme, aspect);
  return contentArea(theme, aspect).height - barHeight - 2 * padding;
}

/** The window's box for content `innerHeight` tall, centered in the content area. */
export function windowBox(theme: Theme, aspect: Aspect, innerHeight: number): Rect {
  const area = contentArea(theme, aspect);
  const { barHeight, padding } = windowMetrics(theme, aspect);
  const { width } = windowWidth(theme, aspect);
  const height = Math.min(area.height, Math.ceil(innerHeight + barHeight + 2 * padding));
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
