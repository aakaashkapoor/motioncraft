// The shine (design v3, life #9): a diagonal band of light, transparent ->
// white -> transparent, crosses an element once on the `shine` token (800 ms,
// `(0.6, 0.6, 0, 1)`) and is gone: it never loops. The band is a share of the
// element's width and leans like a CSS `skewX`; it sets off and ends just
// clear of the element, leaning edges and all. `Shine` lays it over a box (a
// card, a window), clipped to the box's radius; `shineText` paints it through
// text (a number landing), clipped to the glyphs. Pure geometry, plus the
// drawing.

import type { CSSProperties } from "react";
import type { Size } from "../layout/frame";
import { withAlpha } from "../theme/color";
import type { Theme } from "../theme/types";
import { tween } from "./motion";

export interface ShineBand {
  /** The band's middle at the element's mid-height, in px from the element's center (negative is left of it). */
  center: number;
  /** The band's width in px. */
  width: number;
}

/** The shine is white light, whatever the theme. */
const WHITE = "#ffffff";

const radians = (deg: number) => (deg * Math.PI) / 180;
// `|| 0` turns -0 into 0.
const round = (n: number) => Math.round(n * 100) / 100 || 0;

/**
 * The band `elapsedMs` after the shine starts, over an element of `size`;
 * undefined before it starts, once it has crossed, and when the `shine` token
 * has no duration.
 */
export function shineBand(theme: Theme, size: Size, elapsedMs: number): ShineBand | undefined {
  const { shine } = theme.motion;
  if (!(shine.ms > 0) || !(elapsedMs >= 0) || elapsedMs >= shine.ms) return undefined;
  const width = size.width * shine.widthShare;
  // From the middle to where the band's leaning edge just clears the element's side.
  const reach = size.width / 2 + width / 2 + (Math.tan(radians(shine.skewDeg)) * size.height) / 2;
  return { center: -reach + 2 * reach * tween(shine, elapsedMs), width };
}

/**
 * The band as a CSS gradient over its element. The gradient's line runs at
 * 90 deg plus the lean, through the element's center, so its stripes lean
 * like the band; a width across the element is `sin` of that angle along it.
 */
export function shineGradient(theme: Theme, band: ShineBand): string {
  const { shine } = theme.motion;
  const angle = 90 + shine.skewDeg;
  const along = (x: number) => `calc(50% + ${round(x * Math.sin(radians(angle)))}px)`;
  const light = withAlpha(WHITE, shine.opacity);
  return `linear-gradient(${angle}deg, transparent ${along(band.center - band.width / 2)}, ${light} ${along(band.center)}, transparent ${along(band.center + band.width / 2)})`;
}

export interface ShineProps {
  theme: Theme;
  /** The box the shine crosses, in px. */
  size: Size;
  /** Time since the shine started, in ms. */
  elapsedMs: number;
  /** The box's corner radius in px: the band is clipped to it. */
  radius: number;
}

/** The shine over a box: lay it inside the box (which must be positioned) as its last child. */
export function Shine({ theme, size, elapsedMs, radius }: ShineProps) {
  const band = shineBand(theme, size, elapsedMs);
  if (band === undefined) return null;
  return (
    <div
      data-shine=""
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        borderRadius: radius,
        pointerEvents: "none",
        backgroundImage: shineGradient(theme, band),
      }}
    />
  );
}

/**
 * Styles that paint text of `color` with the shine over it, clipped to the
 * glyphs: for an element of `size` whose text is its own (inline, so the
 * glyphs sit inside its background). Undefined when there is no band, so the
 * text is drawn as usual.
 */
export function shineText(theme: Theme, size: Size, elapsedMs: number, color: string): CSSProperties | undefined {
  const band = shineBand(theme, size, elapsedMs);
  if (band === undefined) return undefined;
  return {
    backgroundImage: `${shineGradient(theme, band)}, linear-gradient(${color}, ${color})`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
  };
}
