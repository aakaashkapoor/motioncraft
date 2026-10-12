// Annotate's `circle` mark: a hand-drawn loop just inside its mark box that
// goes round a little more than once, like a pen loop. Its radius wanders, but
// the wander fades to nothing at both ends, so the start and the overshoot
// both lie on one ellipse and close the loop, with no tail inside or outside
// it (a spiral there read as a stray stroke). Same seeded wander as the other
// marks (see `markStroke` in annotatePlan.ts). Pure.

import { random, type Seed } from "../engine/random";
import type { Theme, TypeSpec } from "../theme/types";
import type { AnnotateStroke } from "./annotatePlan";

/** The loop goes round a little more than once ... */
const CIRCLE_TURNS = 1.08;
/** ... from its upper left. */
const CIRCLE_FROM_TURN = -0.375;
/** Its radius wanders this share either way (annotatePlan's connector leaves from inside the box by this). */
const WOBBLE_RANGE = 0.07;
const SEGMENTS = 64;

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places + 0;

/** A slow, seeded wander in -1..1 along a stroke (`t` 0..1): two sines at random phases. */
function wander(seed: Seed, key: string, t: number): number {
  const p1 = random(`${seed}:${key}:1`);
  const p2 = random(`${seed}:${key}:2`);
  return 0.6 * Math.sin(2 * Math.PI * (1.3 * t + p1)) + 0.4 * Math.sin(2 * Math.PI * (2.7 * t + p2));
}

/** The loop's stroke width in px. */
function circleThickness(theme: Theme): number {
  return Math.max(3, theme.motion.mark.underlinePx * 0.6);
}

/** The ellipse the loop is drawn on, in a mark box `width` x `height` px: its wander stays inside the box. */
export function circleEllipse(theme: Theme, width: number, height: number): { cx: number; cy: number; rx: number; ry: number } {
  const thick = circleThickness(theme);
  return { cx: width / 2, cy: height / 2, rx: (width - thick) / 2 / (1 + WOBBLE_RANGE), ry: (height - thick) / 2 / (1 + WOBBLE_RANGE) };
}

/** The loop in a mark box `width` x `height` px: never a perfectly round one, and closed where it ends. */
export function circleMarkStroke(theme: Theme, width: number, height: number, _spec: TypeSpec, seed: Seed): AnnotateStroke {
  const thick = round(circleThickness(theme));
  const { cx, cy, rx, ry } = circleEllipse(theme, width, height);
  const pts = Array.from({ length: SEGMENTS + 1 }, (_, i) => {
    const t = i / SEGMENTS;
    const angle = 2 * Math.PI * (CIRCLE_FROM_TURN + CIRCLE_TURNS * t);
    // Widest mid-stroke, none at the ends: both ends sit on the ellipse.
    const r = 1 + WOBBLE_RANGE * Math.sin(Math.PI * t) * wander(seed, "c", t);
    return [round(cx + rx * r * Math.cos(angle)), round(cy + ry * r * Math.sin(angle))] as const;
  });
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  return { d, length: round(length), width: thick };
}
