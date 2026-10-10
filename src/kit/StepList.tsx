// A list of 2-6 steps with an optional title, on the frame's optical center
// above the caption band (or centered in its slot), no wider than the text
// column. Each step is a row card (see `ListRow`) with a numbered chip or an
// accent dot. The title rises in on the scene's lead; the rows lift in after it
// one by one (design v3, life #8), the cascade done in about the first 1.2 s.
// An optional `highlight` lands on a step once they have all landed, or moves
// along them and comes to rest on the last (the owner's reference: "the accent
// lands on step 5"): the step it is on pops, its chip fills with the accent and
// its text turns the accent; the others stay calm. The step it rests on shines once.

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea } from "../layout/caption";
import { estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { mixColors } from "../theme/color";
import { accentInk } from "../theme/roles";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { cardEntrance } from "./Card";
import { useSceneTime } from "./frameContext";
import { ListRow, listRowHeight, listRowMetrics, listRowsWidth, listRowTextWidth } from "./ListRow";
import { arrive, cascadeStep, exitOpacity, fade, tween } from "./motion";
import { highlightLevel, highlightShineMs, highlightStops, type HighlightSpec } from "./progression";
import type { KitProps } from "./types";

export interface StepListProps extends KitProps {
  /** 2-6 steps, in order. */
  items: string[];
  title?: string;
  /**
   * A step to light up in the accent once they have all landed (its index),
   * or the highlight moving along them, `{ from, to, stepMs }`, coming to rest on `to`.
   */
  highlight?: HighlightSpec;
  /** "number" (default) for numbered chips, "dot" for accent dots. */
  marker?: "number" | "dot";
}

/** Item steps to try, largest first. */
const ITEM_STEPS = ["subtitle", "body", "label"] as const satisfies readonly TypeRole[];
type ItemStep = (typeof ITEM_STEPS)[number];
/** The step of the number in a marker, a notch below the item's so it sits inside the circle. */
const MARKER_STEP: Record<ItemStep, TypeRole> = { subtitle: "label", body: "label", label: "eyebrow" };
/** Marker diameter as a multiple of the item font size. */
const MARKER_EM = 1.25;
/** Dot diameter as a fraction of the marker. */
const DOT_SCALE = 0.4;

/**
 * The [start, end] of each item's entrance, in ms from the scene's start: an
 * `enter` cascade from the lead, one step behind the title when there is one.
 */
export function stepListTiming(theme: Theme, count: number, titled = false): Array<[number, number]> {
  const { leadMs, enter } = theme.motion;
  const first = titled ? 1 : 0;
  const step = cascadeStep(theme, count + first);
  return Array.from({ length: count }, (_, i) => {
    const start = leadMs + (i + first) * step;
    return [start, start + enter.ms];
  });
}

interface StepLayout {
  itemStep: ItemStep;
  item: TypeSpec;
  /** The marker's number, in the bold weight. */
  number: TypeSpec;
  markerSize: number;
}

function layoutFor(theme: Theme, aspect: Aspect, itemStep: ItemStep): StepLayout {
  const { type, weights } = theme;
  const item = type[itemStep][aspect];
  const number = { ...type[MARKER_STEP[itemStep]][aspect], weight: weights.bold };
  return { itemStep, item, number, markerSize: Math.round(item.size * MARKER_EM) };
}

/** Estimated height in px of each item's row, `width` px wide, at `layout`. */
function rowHeights(theme: Theme, width: number, items: string[], layout: StepLayout): number[] {
  const textWidth = listRowTextWidth(theme, width, layout.markerSize);
  return items.map((item) => listRowHeight(theme, layout.markerSize, estimateTextHeight(item, textWidth, layout.item)));
}

/** Estimated height in px of the list's title and rows, `width` px wide, at `layout`. */
function estimateListHeight(theme: Theme, aspect: Aspect, width: number, title: string | undefined, items: string[], layout: StepLayout): number {
  const { spacing } = theme;
  const titleHeight = title === undefined ? 0 : estimateTextHeight(title, width, theme.type.title[aspect]) + spacing.lg;
  const rows = rowHeights(theme, width, items, layout);
  return titleHeight + rows.reduce((sum, h) => sum + h, 0) + listRowMetrics(theme).rowGap * Math.max(0, items.length - 1);
}

/**
 * The largest item size at which the title and rows fit in `area` (by
 * default the content area, above the caption band). If none fits, the
 * smallest: the list then overflows visibly and the layer-1 checks report it.
 */
export function stepListLayout(theme: Theme, aspect: Aspect, title: string | undefined, items: string[], area = contentArea(theme, aspect)): StepLayout {
  const width = listRowsWidth(theme, aspect, area);
  const layouts = ITEM_STEPS.map((step) => layoutFor(theme, aspect, step));
  return layouts.find((layout) => estimateListHeight(theme, aspect, width, title, items, layout) <= area.height) ?? layouts.at(-1)!;
}

function Marker({ index, kind, layout, theme, on }: { index: number; kind: "number" | "dot"; layout: StepLayout; theme: Theme; on: boolean }) {
  const { markerSize } = layout;
  const { colors } = theme;
  const dot = Math.round(markerSize * DOT_SCALE);
  return (
    <div
      style={{
        flex: "none",
        width: markerSize,
        height: markerSize,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {kind === "number" ? (
        <div
          data-step-chip=""
          style={{
            width: markerSize,
            height: markerSize,
            borderRadius: "50%",
            // Calm, a pale chip; lit, it fills with the accent.
            backgroundColor: on ? colors.accent : colors.surfaceAlt,
            color: on ? colors.accentText : colors.text,
            fontFamily: theme.fonts.body,
            ...typeCss(layout.number),
            fontVariantNumeric: "tabular-nums",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {index + 1}
        </div>
      ) : (
        <div style={{ width: dot, height: dot, borderRadius: "50%", backgroundColor: colors.accent }} />
      )}
    </div>
  );
}

/** The text of a step `lit` (0..1): from the text colour to the accent's ink. */
function stepInk(theme: Theme, lit: number): string {
  if (lit <= 0) return theme.colors.text;
  return lit >= 1 ? accentInk(theme) : mixColors(theme.colors.text, accentInk(theme), lit);
}

export function StepList({ progress, theme, aspect, area: slot, items, title, highlight, marker = "number" }: StepListProps) {
  const area = slot ?? contentArea(theme, aspect);
  const width = listRowsWidth(theme, aspect, area);
  const layout = stepListLayout(theme, aspect, title, items, area);
  const height = estimateListHeight(theme, aspect, width, title, items, layout);
  const box = placeBlock(area, { width, height }, blockCenterY(theme, aspect, slot));
  const heights = rowHeights(theme, width, items, layout);
  const time = useSceneTime(progress);
  const { ms } = time;
  const { leadMs, fx, enter } = theme.motion;
  const exit = exitOpacity(theme, time, enter.ms);
  const titleOpacity = fade(fx, ms - leadMs);
  const titleRise = Math.round((1 - tween(theme.motion["text.in"], ms - leadMs)) * theme.spacing.lg * 100) / 100;
  const timing = stepListTiming(theme, items.length, title !== undefined);
  const stops = highlightStops(theme, highlight, items.length, timing.at(-1)![1], time);
  const { colors, fonts, spacing } = theme;

  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        opacity: exit,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div data-block="StepList" style={{ width, maxWidth: width }}>
        {title !== undefined && (
          <h2
            style={{
              margin: 0,
              marginBottom: spacing.lg,
              opacity: titleOpacity,
              transform: `translateY(${titleRise}px)`,
              fontFamily: fonts.display,
              ...typeCss(theme.type.title[aspect]),
              color: colors.text,
              overflowWrap: "break-word",
              textWrap: "balance",
            }}
          >
            {title}
          </h2>
        )}
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: listRowMetrics(theme).rowGap }}>
          {items.map((item, i) => {
            const level = highlightLevel(theme, stops, i, ms);
            const lit = Math.min(1, Math.max(0, level));
            const on = lit >= 0.5;
            return (
              <ListRow
                key={i}
                theme={theme}
                entrance={cardEntrance(arrive(theme, ms, timing[i]![0]), theme)}
                level={level}
                shineMs={highlightShineMs(stops, i, ms)}
                size={{ width, height: heights[i]! }}
                align="flex-start"
              >
                <Marker index={i} kind={marker} layout={layout} theme={theme} on={on} />
                <span
                  data-step-text=""
                  style={{
                    color: stepInk(theme, lit),
                    // Center a single line on the marker; further lines run below it.
                    paddingTop: Math.max(0, (layout.markerSize - layout.item.size * layout.item.lineHeight) / 2),
                    fontFamily: fonts.body,
                    ...typeCss(layout.item),
                    fontWeight: on ? theme.weights.bold : layout.item.weight,
                    minWidth: 0,
                    overflowWrap: "break-word",
                  }}
                >
                  {item}
                </span>
              </ListRow>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
