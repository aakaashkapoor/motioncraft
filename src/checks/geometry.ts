// Rectangle helpers shared by the overflow and safe-area checks.

import type { Rect } from "../layout/frame";

/** Sub-pixel slack, so anti-aliased edges and rounding never fail a check. */
export const TOLERANCE_PX = 1;

/** How far `inner` sticks out of `outer` on each side, in px (0 when inside). */
export interface Excess {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function excess(outer: Rect, inner: Rect): Excess {
  return {
    top: Math.max(0, outer.y - inner.y),
    right: Math.max(0, inner.x + inner.width - (outer.x + outer.width)),
    bottom: Math.max(0, inner.y + inner.height - (outer.y + outer.height)),
    left: Math.max(0, outer.x - inner.x),
  };
}

/** True when `inner` lies inside `outer`, give or take `tolerance` px. */
export function contains(outer: Rect, inner: Rect, tolerance = TOLERANCE_PX): boolean {
  const e = excess(outer, inner);
  return Math.max(e.top, e.right, e.bottom, e.left) <= tolerance;
}

/** Names the sides `inner` sticks out of, e.g. "bottom by 120px, right by 4px". */
export function describeExcess(outer: Rect, inner: Rect, tolerance = TOLERANCE_PX): string {
  const e = excess(outer, inner);
  return (Object.entries(e) as [keyof Excess, number][])
    .filter(([, px]) => px > tolerance)
    .map(([side, px]) => `${side} by ${Math.round(px)}px`)
    .join(", ");
}

/** Smallest rectangle around all of `rects`, or undefined for none. */
export function union(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
