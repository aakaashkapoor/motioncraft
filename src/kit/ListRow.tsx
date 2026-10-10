// One row of a list drawn as a card (the owner's reference: list rows are
// wide white cards, a round chip at the left and the text beside it). It
// lifts in like a card (see `cardEntrance`): the `li` carries the rise and the
// fade, its face the card look, with the shadow growing as it lifts. When the
// highlight lands on it, the face pops (`pop`) and wears the accent ring; the
// list fills its chip with the accent. The shine crosses the row the highlight
// comes to rest on, once. Also the width a list of such rows takes.

import type { ReactNode } from "react";
import { contentArea, textColumn } from "../layout/caption";
import type { Rect, Size } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { accentRing, liftShadow, popScale, type CardEntrance } from "./Card";
import { Shine } from "./shine";

/** In 16:9 a list's rows reach the two-thirds line of the 12-column grid (design v3, section C), as the reference's wide rows. */
const WIDE_LIST_SHARE = 2 / 3;

/** Px around a row's content and between its rows. */
export interface ListRowMetrics {
  /** Padding above and below the content. */
  padY: number;
  /** Padding left and right of the content. */
  padX: number;
  border: number;
  /** Between the chip and the text. */
  gap: number;
  /** Between one row and the next. */
  rowGap: number;
}

export function listRowMetrics(theme: Theme): ListRowMetrics {
  const { sm, md } = theme.spacing;
  return { padY: sm, padX: md, border: theme.hairline, gap: md, rowGap: sm };
}

/**
 * The width of a list's rows in `area`: the text column (in 9:16, so the
 * rows fill the frame), out to the two-thirds line in 16:9, less a margin on
 * each side for a row to pop into (see `popScale`).
 */
export function listRowsWidth(theme: Theme, aspect: Aspect, area: Rect): number {
  const column = Math.min(area.width, textColumn(theme, aspect).width);
  const width = aspect === "16:9" ? Math.min(column, Math.round(contentArea(theme, aspect).width * WIDE_LIST_SHARE)) : column;
  return width - 2 * Math.ceil((width * (theme.motion.pop.scale - 1)) / 2);
}

/** The height in px of a row whose chip is `chip` px and whose text is `text` px tall. */
export function listRowHeight(theme: Theme, chip: number, text: number): number {
  const { padY, border } = listRowMetrics(theme);
  return Math.max(chip, text) + 2 * (padY + border);
}

/** The width in px left for a row's text beside a chip `chip` px wide, in a row `width` px wide. */
export function listRowTextWidth(theme: Theme, width: number, chip: number): number {
  const { padX, border, gap } = listRowMetrics(theme);
  return Math.max(1, width - 2 * (padX + border) - chip - gap);
}

export interface ListRowProps {
  theme: Theme;
  /** The row lifting in (see `cardEntrance`). */
  entrance: CardEntrance;
  /** How lit the row is (see `highlightLevel`); may overshoot while it pops. */
  level: number;
  /** Time since the row's shine set off, in ms; no shine when undefined. */
  shineMs?: number;
  /** The row's size in px, for the shine. */
  size: Size;
  /** How the chip and the text line up across the row. */
  align: "center" | "flex-start";
  /** Attributes for the `li`, e.g. `{ "data-feature": 2 }`. */
  attributes?: Record<string, string | number>;
  /** The chip and the text. */
  children: ReactNode;
}

export function ListRow({ theme, entrance, level, shineMs, size, align, attributes, children }: ListRowProps) {
  const { colors } = theme;
  const { padY, padX, border, gap } = listRowMetrics(theme);
  const ring = accentRing(theme, Math.min(1, Math.max(0, level)));
  const shadow = liftShadow(theme, entrance.lift);
  return (
    <li {...attributes} style={entrance.style}>
      <div
        data-row-face=""
        style={{
          position: "relative",
          boxSizing: "border-box",
          padding: `${padY}px ${padX}px`,
          backgroundColor: colors.surface,
          border: `${border}px solid ${colors.border}`,
          borderRadius: theme.radius.md,
          boxShadow: ring === "" ? shadow : `${shadow}, ${ring}`,
          transform: `scale(${popScale(theme, level)})`,
          display: "flex",
          alignItems: align,
          gap,
        }}
      >
        {children}
        {shineMs !== undefined && <Shine theme={theme} size={size} elapsedMs={shineMs} radius={theme.radius.md} />}
      </div>
    </li>
  );
}
