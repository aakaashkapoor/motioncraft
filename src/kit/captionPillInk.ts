// The pill caption's letters as the pill comes and goes. A word is either the
// page color or the text-on-accent color, never a mix: a mix is a mid tone,
// and so is a pill half faded in over a dark band, so mid-fade the word would
// vanish. A word is lit where the pill is under its middle, and the pill's
// fade starts where the lit word already reads on it. Pure.

import type { Rect } from "../layout/frame";
import { mixColors } from "../theme/color";
import { AA_CONTRAST, contrastRatio } from "../theme/contrast";
import { pillBox, type PillState } from "./captionPill";

/** Opacity steps searched for the fade's start. */
const STEPS = 100;

/**
 * The least opacity at which `ink` reads (`min` contrast) on an `accent` pill
 * laid over `behind`; 1 if it only reads, if at all, once the pill is solid.
 */
export function pillReadableOpacity(accent: string, behind: string, ink: string, min: number = AA_CONTRAST): number {
  for (let i = 0; i < STEPS; i++) {
    const opacity = i / STEPS;
    if (contrastRatio(ink, mixColors(behind, accent, opacity)) >= min) return opacity;
  }
  return 1;
}

/** The pill's drawn opacity for its fade (0..1): nothing at 0, then from `from` up to solid. */
export function pillFadeOpacity(fade: number, from: number): number {
  if (fade <= 0) return 0;
  return Math.min(1, from + (1 - from) * fade);
}

/** Whether the pill (see `pillBox`) is under the middle of word `k`'s box. */
export function pillCovers(boxes: readonly Rect[], state: PillState, pad: { x: number; y: number }, k: number): boolean {
  if (state.opacity <= 0 || (k !== state.word && k !== state.from)) return false;
  const pill = pillBox(boxes, state, pad);
  const box = boxes[k]!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  return x >= pill.x && x <= pill.x + pill.width && y >= pill.y && y <= pill.y + pill.height;
}
