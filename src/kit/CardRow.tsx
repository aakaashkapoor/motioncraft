// 2-6 cards: in one row when the area is wide enough (the 16:9 content area);
// otherwise a vertical stack (up to 3) or a 2-column grid (4-6), as in 9:16 or
// a narrow Section slot. Cards lift in one after another (design v3, life #8),
// the cascade done in about the first 1.2 s; once they have all landed, an
// optional `highlight` card pops in the accent, or the highlight moves along
// the cards and comes to rest on the last (the owner's reference: "the accent
// lands on step 5"). The card it rests on shines once.

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { safeZones } from "../layout/safe";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import {
  CARD_TITLE_STEPS,
  CardFace,
  cardContentWidth,
  cardEntrance,
  cardHeight,
  cardMetrics,
  cardWordsFit,
  isLabelCard,
  type CardData,
  type CardMetrics,
  type CardOrientation,
} from "./Card";
import { useSceneTime } from "./frameContext";
import { arrive, cascadeStep, exitOpacity } from "./motion";
import { highlightLevel, highlightShineMs, highlightStops, type HighlightSpec } from "./progression";
import type { KitProps } from "./types";

export interface CardRowProps extends KitProps {
  /** 2-6 cards, in arrival order. */
  cards: CardData[];
  /**
   * A card to light up in the accent once they have all landed (its index),
   * or the highlight moving along them, `{ from, to, stepMs }`, coming to rest on `to`.
   */
  highlight?: HighlightSpec;
}

export const MIN_CARDS = 2;
export const MAX_CARDS = 6;

/** A row needs each card at least this wide, in em of the ramp's `subtitle` step. */
const MIN_ROW_CARD_EM = 4.5;

/** The [start, end] of each card's entrance, in ms from the scene's start: an `enter` cascade from the lead. */
export function cardRowTiming(theme: Theme, count: number): Array<[number, number]> {
  const { leadMs, enter } = theme.motion;
  const step = cascadeStep(theme, count);
  return Array.from({ length: count }, (_, i) => [leadMs + i * step, leadMs + i * step + enter.ms]);
}

export interface CardRowLayout {
  orientation: CardOrientation;
  metrics: CardMetrics;
  /** Card boxes in px, relative to the area's top-left corner. */
  cells: Rect[];
}

/**
 * Lays the cards out in `slot` (the content area when there is none), all the
 * same size, the block on the frame's optical center (see `blockCenterY`). One
 * row when the area is landscape and every card gets at least
 * `MIN_ROW_CARD_EM` of width; otherwise a stack or a grid, at most the primary
 * width. A stack of label cards takes that whole width; a stack with
 * subtitles hugs its widest card. Uses the largest title size at which every
 * card fits its cell with no word broken; if none fits, the smallest, and the
 * layer-1 checks report the overflow.
 */
export function cardRowLayout(theme: Theme, aspect: Aspect, cards: readonly CardData[], slot?: Rect): CardRowLayout {
  if (!Array.isArray(cards) || cards.length < MIN_CARDS || cards.length > MAX_CARDS) {
    throw new Error(`CardRow: needs ${MIN_CARDS}-${MAX_CARDS} cards, got ${Array.isArray(cards) ? cards.length : typeof cards}`);
  }
  const area = slot ?? contentArea(theme, aspect);
  const gap = theme.spacing.md;
  const n = cards.length;
  const rowCell = (area.width - (n - 1) * gap) / n;
  const wide = area.width > area.height && rowCell >= MIN_ROW_CARD_EM * theme.type.subtitle[aspect].size;
  const cols = wide ? n : n <= 3 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const orientation: CardOrientation = cols === 1 ? "row" : "column";
  const maxWidth = Math.min(area.width, safeZones(aspect, theme.safe).primaryWidth);
  const hug = cols === 1 && !cards.every(isLabelCard);
  // In a row of few cards, keep each from stretching past a third of the width.
  const widthFor = (m: CardMetrics) => {
    if (wide) return Math.min((area.width - (n - 1) * gap) / n, (area.width - 2 * gap) / 3);
    const cell = (maxWidth - (cols - 1) * gap) / cols;
    return hug ? Math.min(cell, Math.max(...cards.map((card) => cardContentWidth(theme, card, m)))) : cell;
  };
  const room = (area.height - (rows - 1) * gap) / rows;

  const tallest = (m: CardMetrics) => Math.max(...cards.map((card) => cardHeight(theme, card, widthFor(m), m)));
  const candidates = CARD_TITLE_STEPS.map((step) => cardMetrics(theme, aspect, step, orientation));
  const fits = (m: CardMetrics) => tallest(m) <= room && cards.every((card) => cardWordsFit(theme, card, widthFor(m), m));
  const metrics = candidates.find(fits) ?? candidates.at(-1)!;
  const width = widthFor(metrics);
  const height = Math.min(room, tallest(metrics));

  const blockWidth = cols * width + (cols - 1) * gap;
  const blockHeight = rows * height + (rows - 1) * gap;
  const block = placeBlock(area, { width: blockWidth, height: blockHeight }, blockCenterY(theme, aspect, slot));
  const left = block.x - area.x;
  const top = block.y - area.y;
  const cells = cards.map((_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    // A lone card in the last grid row sits centered under the others.
    const inRow = Math.min(cols, n - r * cols);
    const shift = ((cols - inRow) * (width + gap)) / 2;
    return { x: left + shift + c * (width + gap), y: top + r * (height + gap), width, height };
  });
  return { orientation, metrics, cells };
}

export function CardRow({ progress, theme, aspect, area: slot, cards, highlight }: CardRowProps) {
  const area = slot ?? contentArea(theme, aspect);
  const layout = cardRowLayout(theme, aspect, cards, slot);
  const time = useSceneTime(progress);
  const timing = cardRowTiming(theme, cards.length);
  const exit = exitOpacity(theme, time, theme.motion.enter.ms);
  const stops = highlightStops(theme, highlight, cards.length, timing.at(-1)![1], time);

  return (
    <div style={{ position: "absolute", left: area.x, top: area.y, width: area.width, height: area.height, opacity: exit }}>
      {cards.map((card, i) => {
        const cell = layout.cells[i]!;
        const entrance = cardEntrance(arrive(theme, time.ms, timing[i]![0]), theme);
        return (
          <div
            key={i}
            data-card={i}
            data-block="CardRow"
            style={{ position: "absolute", left: cell.x, top: cell.y, width: cell.width, height: cell.height, ...entrance.style }}
          >
            <CardFace
              theme={theme}
              metrics={layout.metrics}
              highlight={highlightLevel(theme, stops, i, time.ms)}
              lift={entrance.lift}
              shineMs={highlightShineMs(stops, i, time.ms)}
              size={cell}
              {...card}
            />
          </div>
        );
      })}
    </div>
  );
}
