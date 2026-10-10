// Lift out (the owner's reference): an element leaves its window at a given
// ms and settles as a floating card beside it, and stays there. The card is
// drawn at its final place and moved back over the element it lifts from, so
// at the start it covers that element exactly; then its position, scale and
// shadow go home with the `enter` spring while the place it left dims to a
// ghost. Both ends are anchored by their bottom-left corner, which a window's
// bottom-aligned list knows exactly (heights are estimates). A `shareId` on
// the card carries it into the next scene with the shared-element morph. Pure.

import type { Size } from "../layout/frame";
import { withAlpha } from "../theme/color";
import type { Theme } from "../theme/types";
import { tween } from "./motion";

/** Where a card's bottom-left corner is, in px. */
export interface LiftPlace {
  x: number;
  bottom: number;
}

export interface LiftEnds {
  /** Over the element it lifts from, at scale 1. */
  from: LiftPlace;
  /** Where it settles. */
  to: LiftPlace;
  /** Its scale once settled (see `liftScale`). */
  scale: number;
}

export interface LiftPose {
  /** True from the lift's start: the card is drawn and the element it left is a ghost. */
  lifted: boolean;
  /** Offset from the settled place, in px, for a transform with its origin at the bottom-left corner. */
  dx: number;
  dy: number;
  scale: number;
  /** How far the lifted shadow has grown, 0..1 (see `liftShadow`). */
  shadow: number;
  /** Opacity of the element left behind in the window. */
  ghost: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000 || 0;

/** The lifting card `ms` into the scene, for a lift that starts at `atMs`. */
export function liftPose(theme: Theme, ms: number, atMs: number, { from, to, scale }: LiftEnds): LiftPose {
  const { enter, liftOut: lift } = theme.motion;
  const lifted = ms >= atMs;
  const move = lifted ? tween(enter, ms - atMs) : 0;
  return {
    lifted,
    dx: round((from.x - to.x) * (1 - move)),
    dy: round((from.bottom - to.bottom) * (1 - move)),
    scale: round(1 + (scale - 1) * move),
    shadow: Math.min(1, Math.max(0, move)),
    ghost: lifted ? lift.ghostOpacity : 1,
  };
}

/** The scale a card of `size` settles at in `room`: the lift token's, or less so it fits. */
export function liftScale(theme: Theme, size: Size, room: Size): number {
  return Math.min(theme.motion.liftOut.scale, room.width / size.width, room.height / size.height);
}

/** The card's shadow, `amount` (0..1) of the way to the lift token's. */
export function liftShadow(theme: Theme, amount: number): string {
  if (amount <= 0) return "none";
  const { liftOut: lift } = theme.motion;
  const k = Math.min(1, amount);
  return `0 ${round(lift.shadowYPx * k)}px ${round(lift.shadowBlurPx * k)}px ${withAlpha(theme.colors.shadow, theme.cardShadow.opacity)}`;
}
