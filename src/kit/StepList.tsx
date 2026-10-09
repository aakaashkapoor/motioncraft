// A list of 2-6 steps with an optional title, on the frame's optical center
// above the caption band (or centered in its slot), no wider than the text
// column. Each item has a numbered or accent-dot marker. The title rises in on
// the scene's lead; the items follow it in turn, fading in and sliding from the
// left, the cascade done in about the first 1.2 s. An optional highlighted item
// is drawn in the accent color.

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import { estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { accentInk } from "../theme/roles";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { useSceneTime } from "./frameContext";
import { arrive, cascadeStep, exitOpacity, fade, tween } from "./motion";
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
  /** Horizontal travel of the slide-in, in px. Reserved on both sides of the list so items never leave the area. */
  slide: number;
}

function layoutFor(theme: Theme, aspect: Aspect, itemStep: ItemStep): StepLayout {
  const { type, weights } = theme;
  const item = type[itemStep][aspect];
  const number = { ...type[MARKER_STEP[itemStep]][aspect], weight: weights.bold };
  return { itemStep, item, number, markerSize: Math.round(item.size * MARKER_EM), slide: theme.spacing.md };
}

/** Estimated height in px of the list's title and items at `layout`. */
function estimateListHeight(theme: Theme, aspect: Aspect, width: number, title: string | undefined, items: string[], layout: StepLayout): number {
  const { spacing } = theme;
  const textWidth = width - 2 * layout.slide - layout.markerSize - spacing.md;
  let height = 0;
  if (title !== undefined) {
    height += estimateTextHeight(title, width - 2 * layout.slide, theme.type.title[aspect]) + spacing.lg;
  }
  for (const item of items) {
    height += Math.max(layout.markerSize, estimateTextHeight(item, textWidth, layout.item));
  }
  return height + spacing.md * Math.max(0, items.length - 1);
}

/**
 * The largest item size at which the title and items fit in `area` (by
 * default the content area, above the caption band). If none fits, the
 * smallest: the list then overflows visibly and the layer-1 checks report it.
 */
export function stepListLayout(theme: Theme, aspect: Aspect, title: string | undefined, items: string[], area = contentArea(theme, aspect)): StepLayout {
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
            color: theme.colors.accentText,
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
        <div style={{ width: dot, height: dot, borderRadius: "50%", backgroundColor: theme.colors.accent }} />
      )}
    </div>
  );
}

/** An item sliding in from the left as it fades in (see `arrive`). */
function itemMotion(theme: Theme, ms: number, start: number, slide: number) {
  const { move, opacity } = arrive(theme, ms, start);
  return { opacity, offset: Math.round((move - 1) * slide * 100) / 100 };
}

export function StepList({ progress, theme, aspect, area: slot, items, title, highlight, marker = "number" }: StepListProps) {
  const area = slot ?? contentArea(theme, aspect);
  const width = Math.min(area.width, textColumn(theme, aspect).width);
  const layout = stepListLayout(theme, aspect, title, items, { ...area, width });
  const height = estimateListHeight(theme, aspect, width, title, items, layout);
  const box = placeBlock(area, { width, height }, blockCenterY(theme, aspect, slot));
  const time = useSceneTime(progress);
  const { ms } = time;
  const { leadMs, fx, enter } = theme.motion;
  const exit = exitOpacity(theme, time, enter.ms);
  const titleOpacity = fade(fx, ms - leadMs);
  const titleRise = Math.round((1 - tween(theme.motion["text.in"], ms - leadMs)) * theme.spacing.lg * 100) / 100;
  const timing = stepListTiming(theme, items.length, title !== undefined);
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
      <div data-block="StepList" style={{ maxWidth: width - 2 * layout.slide }}>
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
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: spacing.md }}>
          {items.map((item, i) => {
            const { opacity, offset } = itemMotion(theme, ms, timing[i]![0], layout.slide);
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
                    color: i === highlight ? accentInk(theme) : colors.text,
                    // Center a single line on the marker; further lines run below it.
                    paddingTop: Math.max(0, (layout.markerSize - layout.item.size * layout.item.lineHeight) / 2),
                    fontFamily: fonts.body,
                    ...typeCss(layout.item),
                    fontWeight: i === highlight ? theme.weights.bold : layout.item.weight,
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
