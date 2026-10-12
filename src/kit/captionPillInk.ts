// The pill caption's letters as the pill comes and goes. The page is drawn in
// the page color and again in the text-on-accent color, clipped to the pill's
// box (`pillClip`): a letter is never a mix of the two (a mix is a mid tone,
// and so is a pill half faded in over a dark band), and one the pill's edge
// crosses is light on one side and dark on the other. The pill's fade starts
// where the on-pill ink already reads on it. Pure.

import type { Rect } from "../layout/frame";
import { mixColors } from "../theme/color";
import { AA_CONTRAST, contrastRatio } from "../theme/contrast";
import { pillBox, pillInsets, type PillState } from "./captionPill";

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

/**
 * A clip rectangle as insets from a word's box, in px (negative reaches out),
 * like CSS `inset()`. `left` is from the box's right edge instead when
 * `fromEnd`: the pill's left edge on the word before it is known only as its
 * distance past that word's end, whatever width the word really drew at.
 */
export interface PillClip {
  top: number;
  right: number;
  bottom: number;
  left: number;
  fromEnd?: true;
}

/**
 * The pill's box in the coordinates of word `k`'s own box, as the clip of the
 * word's on-pill ink (the top layer: the same letters in the text-on-accent
 * color, shown only where the pill is). For the word the pill is on it is
 * exactly the pill's drawn insets. For the word it is leaving, on the same
 * line, it is the same box seen from that word: its left edge a word gap past
 * that word's end, so the clip stays on the drawn pill whatever the estimate's
 * error. Undefined where the pill is not over the word (or not there yet), so
 * no ink is drawn; also for a word on the line above the pill's, which the pill
 * only brushes with its padding and whose place the estimate cannot vouch for.
 */
export function pillClip(boxes: readonly Rect[], state: PillState, pad: { x: number; y: number }, k: number): PillClip | undefined {
  if (state.opacity <= 0 || (k !== state.word && k !== state.from)) return undefined;
  const insets = pillInsets(boxes, state, pad);
  if (k === state.word) return insets;
  // Once the pill has arrived it is off the word it left, whatever the estimate says of the words' places.
  if (state.move >= 1 || state.from === state.word) return undefined;
  const from = boxes[k]!;
  const to = boxes[state.word]!;
  if (from.y !== to.y) return undefined;
  const gap = to.x - (from.x + from.width);
  const left = gap + insets.left;
  return left >= 0 ? undefined : { top: insets.top, right: insets.right - gap - to.width, bottom: insets.bottom, left, fromEnd: true };
}

/** `clip` as a CSS `clip-path` with the pill's rounded ends. */
export function pillClipPath(clip: PillClip, radius: number): string {
  const left = clip.fromEnd === true ? `calc(100% + ${clip.left}px)` : `${clip.left}px`;
  return `inset(${clip.top}px ${clip.right}px ${clip.bottom}px ${left} round ${radius}px)`;
}
