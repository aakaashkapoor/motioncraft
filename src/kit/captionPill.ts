// The pill caption style's moving pill (ported from HyperFrames
// `caption-pill-karaoke`): which word of the page it sits behind, how far it
// has slid there from the word before, and where the words of a page sit,
// estimated by character count like the paging. Pure.

import { captionBand, captionType } from "../layout/caption";
import type { Aspect, Rect } from "../layout/frame";
import { AVG_CHAR_EM } from "../layout/textFit";
import type { Theme } from "../theme/types";
import type { PageRange } from "./captionPages";
import type { TimedWord } from "./captionWords";
import { fade, tween, type Timed } from "./motion";

/** The pill reaches this far past its word, in em: up and down, and to each side. */
export const PILL_PAD_EM = { x: 0.4, y: 0.18 } as const;

/** The pill's slide from word to word, and its fade in under a page's first word: ~120 ms, cubic out. */
export const PILL_SLIDE: Timed = { ms: 120, curve: [0.33, 1, 0.68, 1] };

/** A space's width, in em, before the caption widens it. */
const SPACE_EM = 0.25;

/** How a page of pill words is set: what the word box estimate needs. */
export interface PillLayout {
  /** Font size in px. */
  size: number;
  lineHeight: number;
  /** Width the words wrap in, px. */
  lineWidth: number;
  /** What the caption adds to every space, px. */
  wordSpacing: number;
}

/** The page's padding at `size`: the pill's reach and a little more, so a pill at the page's edge stays on its band. */
export function pillPagePadding(theme: Theme, size: number): { x: number; y: number } {
  return { x: PILL_PAD_EM.x * size + theme.spacing.xxs, y: PILL_PAD_EM.y * size + theme.spacing.xxs };
}

/** The pill style's layout in the caption band at `size` (the style's type size by default). */
export function pillLayout(theme: Theme, aspect: Aspect, size?: number): PillLayout {
  const spec = captionType(theme, aspect, "pill");
  const shown = size ?? spec.size;
  const lineWidth = captionBand(theme, aspect).width - 2 * pillPagePadding(theme, shown).x;
  return { size: shown, lineHeight: spec.lineHeight, lineWidth, wordSpacing: PILL_PAD_EM.x * shown };
}

/**
 * Where each word of a page sits, estimated: wrapped greedily into lines of
 * `lineWidth`, each line centered, in px from the top left of the text.
 */
export function estimateWordBoxes(words: readonly string[], layout: PillLayout): Rect[] {
  const { size, lineHeight, lineWidth, wordSpacing } = layout;
  const gap = SPACE_EM * size + wordSpacing;
  const widths = words.map((word) => word.length * AVG_CHAR_EM * size);
  const lines: number[][] = [];
  let used = 0;
  widths.forEach((width, i) => {
    const line = lines.at(-1);
    if (line !== undefined && used + gap + width <= lineWidth) {
      line.push(i);
      used += gap + width;
    } else {
      lines.push([i]);
      used = width;
    }
  });
  const boxes: Rect[] = [];
  lines.forEach((line, row) => {
    const total = line.reduce((sum, i) => sum + widths[i]!, 0) + gap * (line.length - 1);
    let x = (lineWidth - total) / 2;
    for (const i of line) {
      boxes[i] = { x, y: row * size * lineHeight, width: widths[i]!, height: size * lineHeight };
      x += widths[i]! + gap;
    }
  });
  return boxes;
}

/** The pill on a page: behind word `word` (by place on the page), `move` (0..1) of the way there from word `from`. */
export interface PillState {
  word: number;
  from: number;
  move: number;
  opacity: number;
}

/**
 * The pill at `ms` (with the caption's lead already added): behind the last
 * word of `page` to have started, so it waits there through a pause. It slides
 * there from the word before; under a page's first word it fades in instead.
 * Undefined before the page's first word.
 */
export function pillAt(words: readonly TimedWord[], page: PageRange, ms: number): PillState | undefined {
  let held: number | undefined;
  for (let i = page.start; i < page.end; i++) if (words[i]!.startMs <= ms) held = i;
  if (held === undefined) return undefined;
  const word = held - page.start;
  const elapsed = ms - words[held]!.startMs;
  if (word === 0) return { word, from: word, move: 1, opacity: fade(PILL_SLIDE, elapsed) };
  return { word, from: word - 1, move: tween(PILL_SLIDE, elapsed), opacity: 1 };
}

/** The pill's box in the coordinates of `boxes`: its word's box padded by `pad`, on its way from the word it left. */
export function pillBox(boxes: readonly Rect[], state: PillState, pad: { x: number; y: number }): Rect {
  const padded = (box: Rect): Rect => ({ x: box.x - pad.x, y: box.y - pad.y, width: box.width + 2 * pad.x, height: box.height + 2 * pad.y });
  const from = padded(boxes[state.from]!);
  const to = padded(boxes[state.word]!);
  const mix = (a: number, b: number) => a + (b - a) * state.move;
  return { x: mix(from.x, to.x), y: mix(from.y, to.y), width: mix(from.width, to.width), height: mix(from.height, to.height) };
}

/**
 * The pill as insets from its own word's box (negative reaches out), so a
 * pill that has arrived sits exactly on the word as drawn, whatever the
 * estimate's error; only the slide's start comes from the estimate.
 */
export function pillInsets(boxes: readonly Rect[], state: PillState, pad: { x: number; y: number }): { left: number; right: number; top: number; bottom: number } {
  const from = boxes[state.from]!;
  const to = boxes[state.word]!;
  const away = 1 - state.move;
  return {
    left: -pad.x + (from.x - to.x) * away,
    right: -pad.x + (to.x + to.width - (from.x + from.width)) * away,
    top: -pad.y + (from.y - to.y) * away,
    bottom: -pad.y + (to.y + to.height - (from.y + from.height)) * away,
  };
}
