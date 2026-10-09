// A list of 2-6 steps with an optional title, centered in the safe area above
// the caption band. Each item has a numbered or accent-dot marker and appears
// in turn, fading in and sliding from the left; all are in by ~70% of the
// scene. An optional highlighted item is drawn in the accent color.

import { interpolate, type Easing } from "../engine/easing";
import { contentArea } from "../layout/caption";
import { estimateTextHeight } from "../layout/textFit";
import { fontSize } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeStep } from "../theme/types";
import { themeEasing } from "./motion";
import type { KitProps } from "./types";

export interface StepListProps extends KitProps {
  /** 2-6 steps, in order. */
  items: string[];
  title?: string;
  /** Index of an item to draw in the accent color. */
  highlight?: number;
  /** "number" (default) for numbered circles, "dot" for accent dots. */
  marker?: "number" | "dot";
}

const TITLE_ENTER = 0.2;
const EXIT = 0.1;
/** How long one item takes to come in, as a fraction of the scene. */
const ITEM_ENTER = 0.2;
/** By this point of the scene every item is fully in. */
const ITEMS_DONE = 0.65;

/** Item sizes to try, largest first. */
const ITEM_STEPS: readonly TypeStep[] = ["subtitle", "body", "caption"];
const TITLE_LINE_HEIGHT = 1.1;
const ITEM_LINE_HEIGHT = 1.25;
/** Marker diameter as a multiple of the item font size. */
const MARKER_EM = 1.25;
/** Dot diameter as a fraction of the marker. */
const DOT_SCALE = 0.4;

/** The [start, end] of each item's entrance, as fractions of the scene: staggered, all done by `ITEMS_DONE`. */
export function stepListTiming(count: number): Array<[number, number]> {
  const gap = count > 1 ? (ITEMS_DONE - ITEM_ENTER) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => [i * gap, i * gap + ITEM_ENTER]);
}

interface StepLayout {
  itemStep: TypeStep;
  itemSize: number;
  markerSize: number;
  /** Horizontal travel of the slide-in, in px. Reserved on both sides of the list so items never leave the area. */
  slide: number;
}

function layoutFor(theme: Theme, aspect: Aspect, itemStep: TypeStep): StepLayout {
  const itemSize = fontSize(theme, itemStep, aspect);
  return { itemStep, itemSize, markerSize: Math.round(itemSize * MARKER_EM), slide: theme.spacing.md };
}

/** Estimated height in px of the list's title and items at `layout`. */
function estimateListHeight(theme: Theme, aspect: Aspect, width: number, title: string | undefined, items: string[], layout: StepLayout): number {
  const { spacing } = theme;
  const textWidth = width - 2 * layout.slide - layout.markerSize - spacing.md;
  let height = 0;
  if (title !== undefined) {
    const size = fontSize(theme, "title", aspect);
    height += estimateTextHeight(title, width - 2 * layout.slide, { size, lineHeight: TITLE_LINE_HEIGHT }) + spacing.lg;
  }
  for (const item of items) {
    height += Math.max(layout.markerSize, estimateTextHeight(item, textWidth, { size: layout.itemSize, lineHeight: ITEM_LINE_HEIGHT }));
  }
  return height + spacing.md * Math.max(0, items.length - 1);
}

/**
 * The largest item size at which the title and items fit above the caption
 * band. If none fits, the smallest: the list then overflows visibly and the
 * layer-1 checks report it.
 */
export function stepListLayout(theme: Theme, aspect: Aspect, title: string | undefined, items: string[]): StepLayout {
  const area = contentArea(theme, aspect);
  const layouts = ITEM_STEPS.map((step) => layoutFor(theme, aspect, step));
  return layouts.find((layout) => estimateListHeight(theme, aspect, area.width, title, items, layout) <= area.height) ?? layouts.at(-1)!;
}

function Marker({ index, kind, layout, theme }: { index: number; kind: "number" | "dot"; layout: StepLayout; theme: Theme }) {
  const { markerSize } = layout;
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
          style={{
            width: markerSize,
            height: markerSize,
            borderRadius: "50%",
            backgroundColor: theme.colors.accent,
            color: theme.colors.background,
            fontFamily: theme.fonts.body,
            fontSize: Math.round(layout.itemSize * 0.7),
            fontWeight: 700,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {index + 1}
        </div>
      ) : (
        <div style={{ width: dot, height: dot, borderRadius: "50%", backgroundColor: theme.colors.accent }} />
      )}
    </div>
  );
}

function itemMotion(progress: number, [start, end]: [number, number], slide: number, easing: Easing) {
  return {
    opacity: interpolate(progress, [start, end], [0, 1], { easing }),
    offset: interpolate(progress, [start, end], [-slide, 0], { easing }),
  };
}

export function StepList({ progress, theme, aspect, items, title, highlight, marker = "number" }: StepListProps) {
  const area = contentArea(theme, aspect);
  const layout = stepListLayout(theme, aspect, title, items);
  const easing = themeEasing(theme);
  const exit = interpolate(progress, [1 - EXIT, 1], [1, 0], { easing });
  const titleOpacity = interpolate(progress, [0, TITLE_ENTER], [0, 1], { easing });
  const titleRise = interpolate(progress, [0, TITLE_ENTER], [theme.spacing.lg, 0], { easing });
  const timing = stepListTiming(items.length);
  const { colors, fonts, spacing } = theme;

  return (
    <div
      style={{
        position: "absolute",
        left: area.x,
        top: area.y,
        width: area.width,
        height: area.height,
        opacity: exit,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ maxWidth: area.width - 2 * layout.slide }}>
        {title !== undefined && (
          <h2
            style={{
              margin: 0,
              marginBottom: spacing.lg,
              opacity: titleOpacity,
              transform: `translateY(${titleRise}px)`,
              fontFamily: fonts.display,
              fontSize: fontSize(theme, "title", aspect),
              fontWeight: 700,
              lineHeight: TITLE_LINE_HEIGHT,
              color: colors.text,
              overflowWrap: "break-word",
            }}
          >
            {title}
          </h2>
        )}
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: spacing.md }}>
          {items.map((item, i) => {
            const { opacity, offset } = itemMotion(progress, timing[i]!, layout.slide, easing);
            return (
              <li
                key={i}
                style={{
                  opacity,
                  transform: `translateX(${offset}px)`,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: spacing.md,
                }}
              >
                <Marker index={i} kind={marker} layout={layout} theme={theme} />
                <span
                  data-step-text=""
                  style={{
                    color: i === highlight ? colors.accent : colors.text,
                    // Center a single line on the marker; further lines run below it.
                    paddingTop: Math.max(0, (layout.markerSize - layout.itemSize * ITEM_LINE_HEIGHT) / 2),
                    fontFamily: fonts.body,
                    fontSize: layout.itemSize,
                    fontWeight: i === highlight ? 700 : 500,
                    lineHeight: ITEM_LINE_HEIGHT,
                    minWidth: 0,
                    overflowWrap: "break-word",
                  }}
                >
                  {item}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
