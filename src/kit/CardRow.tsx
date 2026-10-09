// 2-6 cards: in one row in 16:9; in 9:16 a vertical stack (up to 3) or a
// 2-column grid (4-6). Cards spring in one after another; once they have all
// landed, an optional `highlight` card lights up in the accent.

import { interpolate } from "../engine/easing";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { CARD_TITLE_STEPS, CardFace, cardEntrance, cardHeight, cardMetrics, type CardData, type CardMetrics, type CardOrientation } from "./Card";
import { themeEasing } from "./motion";
import { springIn } from "./springIn";
import type { KitProps } from "./types";

export interface CardRowProps extends KitProps {
  /** 2-6 cards, in arrival order. */
  cards: CardData[];
  /** Index of a card to light up in the accent after the others land. */
  highlight?: number;
}

export const MIN_CARDS = 2;
export const MAX_CARDS = 6;

const EXIT = 0.1;
/** How long one card's spring takes, as a fraction of the scene. */
const CARD_ENTER = 0.25;
/** By this point every card has landed. */
const CARDS_DONE = 0.6;
/** The highlight's spring, starting once the cards have landed. */
const HIGHLIGHT_ENTER = 0.15;

/** The [start, end] of each card's entrance, as fractions of the scene. */
export function cardRowTiming(count: number): Array<[number, number]> {
  const gap = count > 1 ? (CARDS_DONE - CARD_ENTER) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => [i * gap, i * gap + CARD_ENTER]);
}

export interface CardRowLayout {
  orientation: CardOrientation;
  metrics: CardMetrics;
  /** Card boxes in px, relative to the content area's top-left corner. */
  cells: Rect[];
}

/**
 * Lays the cards out in the content area, all the same size, the block
 * centered. Uses the largest title size at which every card fits its cell; if
 * none fits, the smallest, and the layer-1 checks report the overflow.
 */
export function cardRowLayout(theme: Theme, aspect: Aspect, cards: readonly CardData[]): CardRowLayout {
  if (!Array.isArray(cards) || cards.length < MIN_CARDS || cards.length > MAX_CARDS) {
    throw new Error(`CardRow: needs ${MIN_CARDS}-${MAX_CARDS} cards, got ${Array.isArray(cards) ? cards.length : typeof cards}`);
  }
  const area = contentArea(theme, aspect);
  const gap = theme.spacing.md;
  const n = cards.length;
  const wide = aspect === "16:9";
  const cols = wide ? n : n <= 3 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const orientation: CardOrientation = cols === 1 ? "row" : "column";
  // In a row of few cards, keep each from stretching past a third of the width.
  const width = wide ? Math.min((area.width - (n - 1) * gap) / n, (area.width - 2 * gap) / 3) : (area.width - (cols - 1) * gap) / cols;
  const room = (area.height - (rows - 1) * gap) / rows;

  const tallest = (m: CardMetrics) => Math.max(...cards.map((card) => cardHeight(theme, card, width, m)));
  const candidates = CARD_TITLE_STEPS.map((step) => cardMetrics(theme, aspect, step, orientation));
  const metrics = candidates.find((m) => tallest(m) <= room) ?? candidates.at(-1)!;
  const height = Math.min(room, tallest(metrics));

  const blockWidth = cols * width + (cols - 1) * gap;
  const blockHeight = rows * height + (rows - 1) * gap;
  const left = (area.width - blockWidth) / 2;
  const top = (area.height - blockHeight) / 2;
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

export function CardRow({ progress, theme, aspect, cards, highlight }: CardRowProps) {
  const area = contentArea(theme, aspect);
  const layout = cardRowLayout(theme, aspect, cards);
  const timing = cardRowTiming(cards.length);
  const exit = interpolate(progress, [1 - EXIT, 1], [1, 0], { easing: themeEasing(theme) });
  const landed = timing.at(-1)![1];
  const lit = springIn(progress, landed, HIGHLIGHT_ENTER, theme.motion.springs.emphasis);

  return (
    <div style={{ position: "absolute", left: area.x, top: area.y, width: area.width, height: area.height, opacity: exit }}>
      {cards.map((card, i) => {
        const cell = layout.cells[i]!;
        const [start, end] = timing[i]!;
        const entrance = cardEntrance(springIn(progress, start, end - start, theme.motion.springs.enter), theme);
        return (
          <div
            key={i}
            data-card={i}
            style={{ position: "absolute", left: cell.x, top: cell.y, width: cell.width, height: cell.height, ...entrance }}
          >
            <CardFace theme={theme} metrics={layout.metrics} highlight={i === highlight ? lit : 0} {...card} />
          </div>
        );
      })}
    </div>
  );
}
