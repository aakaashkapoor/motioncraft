// Flowing connectors (design v3, life #11). Once a connector has drawn, an
// accent dot travels it, one trip per `flow` token (1.4 s, expo in-out). It
// fades in where the line starts and out where it lands, so each new trip sets
// off without a jump. Along a chain of connectors (`FlowDiagram`) the dot takes
// them in turn and the node it reaches glows: nodes light one after another,
// never all at once. Pure timing, plus the dot itself.

import { mixColors } from "../theme/color";
import type { Theme } from "../theme/types";
import type { Point } from "./arrowGeometry";
import { curveEasing, fade } from "./motion";

export interface FlowDot {
  /** Which trip this is, from 0. */
  trip: number;
  /** How far along its line the dot is, as a fraction of the line's length. */
  along: number;
  /** In as the dot sets off, out as it lands. */
  opacity: number;
}

/** The dot `elapsedMs` after its line has drawn; undefined before then, or when the `flow` token has no duration. */
export function flowDot(theme: Theme, elapsedMs: number): FlowDot | undefined {
  const { flow } = theme.motion;
  const fast = theme.motion["fx.fast"];
  if (!(elapsedMs >= 0) || !(flow.ms > 0)) return undefined;
  const trip = Math.floor(elapsedMs / flow.ms);
  const ms = elapsedMs % flow.ms;
  const opacity = Math.min(fade(fast, ms), 1 - fade(fast, ms - (flow.ms - fast.ms)));
  return { trip, along: curveEasing(flow.curve)(ms / flow.ms), opacity };
}

/**
 * How lit each of `nodeCount` nodes in a chain is, 0..1, `elapsedMs` after the
 * flow starts. Trip k runs from node k to node k + 1, round again after the
 * last arrow. The node the dot leaves dims as it pulls away and the next one
 * brightens as it closes in, so the light travels with the dot and at most
 * one node is lit. The chain's ends fade with the dot, so the light goes back
 * to the start without a flash.
 */
export function flowGlow(theme: Theme, nodeCount: number, elapsedMs: number): number[] {
  const glow = Array.from({ length: nodeCount }, () => 0);
  const dot = flowDot(theme, elapsedMs);
  if (dot === undefined || nodeCount < 2) return glow;
  const arrows = nodeCount - 1;
  const from = dot.trip % arrows;
  const along = Math.min(1, Math.max(0, dot.along));
  glow[from] = Math.max(0, 1 - 2 * along) * (from === 0 ? dot.opacity : 1);
  glow[from + 1] = Math.max(0, 2 * along - 1) * (from + 1 === arrows ? dot.opacity : 1);
  return glow;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The flowing dot at `at` (px in the enclosing SVG): an accent dot in a disc of
 * its glow. The disc is the glow's tint of the ground, opaque, so it cuts the
 * line it rides on: on an accent line, an accent dot alone would not show.
 */
export function FlowDotMark({ theme, at, opacity }: { theme: Theme; at: Point; opacity: number }) {
  const { flow } = theme.motion;
  const { accent, ground } = theme.colors;
  const r = flow.dotPx / 2;
  return (
    <g data-flow-dot="" transform={`translate(${round(at.x)} ${round(at.y)})`} opacity={round(opacity)}>
      <circle r={r + flow.glowPx} fill={mixColors(ground, accent, flow.glowOpacity)} />
      <circle r={r} fill={accent} />
    </g>
  );
}
