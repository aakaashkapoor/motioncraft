// Geometry for `Arrow`: where its ends are (frame points, or sides of anchored
// elements) and the quadratic curve between them. Pure, so it is easy to test.

import type { Rect } from "../layout/frame";

export interface Point {
  x: number;
  y: number;
}

export const ARROW_SIDES = ["top", "right", "bottom", "left", "center"] as const;
export type ArrowSide = (typeof ARROW_SIDES)[number];

/** An end attached to an element rendered in the same scene, by its `shareId`. */
export interface ArrowAnchor {
  anchor: string;
  /** Which edge the arrow meets. Default: the edge facing the other end. */
  side?: ArrowSide;
}

/** A point in frame coordinates (px), or an anchored element. */
export type ArrowEnd = Point | ArrowAnchor;

/** Boxes of the scene's anchorable elements, in frame px, by `shareId`. */
export type AnchorBoxes = Readonly<Record<string, Rect>>;

const isAnchor = (end: ArrowEnd): end is ArrowAnchor => typeof (end as ArrowAnchor).anchor === "string";

const center = (box: Rect): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** The middle of `side` of `box`, pushed `gap` px outward (the center stays put). */
export function anchorPoint(box: Rect, side: ArrowSide, gap: number): Point {
  const c = center(box);
  switch (side) {
    case "top":
      return { x: c.x, y: box.y - gap };
    case "bottom":
      return { x: c.x, y: box.y + box.height + gap };
    case "left":
      return { x: box.x - gap, y: c.y };
    case "right":
      return { x: box.x + box.width + gap, y: c.y };
    case "center":
      return c;
  }
}

/** The side of `box` that faces `toward`, by the dominant axis. */
function facingSide(box: Rect, toward: Point): ArrowSide {
  const c = center(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

function lookup(end: ArrowAnchor, boxes: AnchorBoxes): Rect {
  const box = Object.hasOwn(boxes, end.anchor) ? boxes[end.anchor] : undefined;
  if (box === undefined) {
    const known = Object.keys(boxes);
    throw new Error(`Arrow: no element with shareId "${end.anchor}" in this scene (known: ${known.length ? known.join(", ") : "none"})`);
  }
  if (end.side !== undefined && !ARROW_SIDES.includes(end.side)) {
    throw new Error(`Arrow: side must be one of ${ARROW_SIDES.join(", ")}, got "${String(end.side)}"`);
  }
  return box;
}

function checkPoint(end: Point): Point {
  if (!Number.isFinite(end.x) || !Number.isFinite(end.y)) {
    throw new Error(`Arrow: a point needs finite x and y, got ${JSON.stringify(end)}`);
  }
  return end;
}

/** Both ends as frame points. Anchored ends sit `gap` px off the element's edge. */
export function resolveArrowEnds(from: ArrowEnd, to: ArrowEnd, boxes: AnchorBoxes, gap: number): { start: Point; end: Point } {
  const fromBox = isAnchor(from) ? lookup(from, boxes) : undefined;
  const toBox = isAnchor(to) ? lookup(to, boxes) : undefined;
  // Where each end aims when it picks a facing side: the other end's center.
  const aim = (end: ArrowEnd, box: Rect | undefined): Point => (box !== undefined ? center(box) : checkPoint(end as Point));
  const place = (end: ArrowEnd, box: Rect | undefined, other: Point): Point => {
    if (box === undefined) return checkPoint(end as Point);
    return anchorPoint(box, (end as ArrowAnchor).side ?? facingSide(box, other), gap);
  };
  return { start: place(from, fromBox, aim(to, toBox)), end: place(to, toBox, aim(from, fromBox)) };
}

export interface ArrowGeometry {
  /** SVG path data: one quadratic segment. */
  d: string;
  /** Arc length in px. */
  length: number;
  start: Point;
  end: Point;
  control: Point;
  /** The point halfway along the curve (t = 0.5), where a label goes. */
  mid: Point;
  /** The head's chevron: one wing, the tip (on `end`), the other wing. */
  head: [Point, Point, Point];
}

/** Segments used to measure a curve's length. Fixed, so results are deterministic. */
const LENGTH_SEGMENTS = 256;

const round = (n: number) => Math.round(n * 100) / 100;

function quadAt(p0: Point, c: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y };
}

/**
 * A quadratic curve from `start` to `end`. `curve` 0 is straight; otherwise the
 * control point sits `curve` x the chord length off the midpoint, to the left of
 * travel for positive values (up, for an arrow running right) and to the right
 * for negative ones. The curve's peak is half that far out. `headSize` is how
 * far back from the tip the head's wings reach.
 */
export function arrowGeometry(start: Point, end: Point, curve: number, headSize: number): ArrowGeometry {
  if (!Number.isFinite(curve)) throw new Error(`Arrow: curve must be a finite number, got ${curve}`);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chord = Math.hypot(dx, dy);
  if (chord === 0) throw new Error(`Arrow: both ends are at the same point (${start.x}, ${start.y})`);

  // Left of travel in screen coordinates (y down).
  const normal = { x: dy / chord, y: -dx / chord };
  const control = {
    x: (start.x + end.x) / 2 + normal.x * curve * chord,
    y: (start.y + end.y) / 2 + normal.y * curve * chord,
  };

  let length = 0;
  let previous = start;
  for (let i = 1; i <= LENGTH_SEGMENTS; i++) {
    const next = quadAt(start, control, end, i / LENGTH_SEGMENTS);
    length += Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
  }

  // The tangent at the end runs from the control point to the tip.
  const tx = end.x - control.x;
  const ty = end.y - control.y;
  const tangent = Math.hypot(tx, ty);
  const ux = tx / tangent;
  const uy = ty / tangent;
  const wing = (s: number): Point => ({ x: end.x - ux * headSize - uy * headSize * s, y: end.y - uy * headSize + ux * headSize * s });

  const d = `M ${round(start.x)} ${round(start.y)} Q ${round(control.x)} ${round(control.y)} ${round(end.x)} ${round(end.y)}`;
  return { d, length, start, end, control, mid: quadAt(start, control, end, 0.5), head: [wing(-1), end, wing(1)] };
}
