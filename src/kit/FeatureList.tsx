// 2-6 feature rows, each an icon in a soft accent-tinted circle beside a line
// of text, with an optional title, on the frame's optical center (or centered
// in its slot), no wider than the text column. The title rises in on the
// scene's lead; the rows spring in after it one by one, sliding from the left,
// the cascade done in about the first 1.2 s.

import { Icon } from "../icons";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { withAlpha } from "../theme/color";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { useSceneTime } from "./frameContext";
import { arrive, cascadeStep, exitOpacity, fade, tween } from "./motion";
import type { KitProps } from "./types";

export interface FeatureItem {
  /** An icon name (see `ICON_NAMES`). */
  icon: string;
  text: string;
}

export interface FeatureListProps extends KitProps {
  /** 2-6 rows, in order. */
  items: FeatureItem[];
  title?: string;
}

/** Row text steps to try, largest first. */
const ROW_STEPS: readonly TypeRole[] = ["subtitle", "body", "label"];
/** Icon circle diameter as a multiple of the row font size. */
const CIRCLE_EM = 1.7;
/** Icon size as a fraction of the circle. */
const ICON_SCALE = 0.55;
/** Tint of the icon circle: the accent at this opacity. */
const TINT = 0.14;

/**
 * The [start, end] of each row's entrance, in ms from the scene's start: an
 * `enter` cascade from the lead, one step behind the title when there is one.
 */
export function featureListTiming(theme: Theme, count: number, titled = false): Array<[number, number]> {
  const { leadMs, enter } = theme.motion;
  const first = titled ? 1 : 0;
  const step = cascadeStep(theme, count + first);
  return Array.from({ length: count }, (_, i) => {
    const start = leadMs + (i + first) * step;
    return [start, start + enter.ms];
  });
}

interface FeatureLayout {
  text: TypeSpec;
  circle: number;
  /** Horizontal travel of the slide-in, reserved on both sides so rows never leave the area. */
  slide: number;
}

function layoutFor(theme: Theme, aspect: Aspect, step: TypeRole): FeatureLayout {
  const text = theme.type[step][aspect];
  return { text, circle: Math.round(text.size * CIRCLE_EM), slide: theme.spacing.md };
}

function estimateHeight(theme: Theme, aspect: Aspect, width: number, title: string | undefined, items: FeatureItem[], l: FeatureLayout): number {
  const { spacing } = theme;
  const inner = width - 2 * l.slide;
  let height = 0;
  if (title !== undefined) {
    height += estimateTextHeight(title, inner, theme.type.title[aspect]) + spacing.lg;
  }
  for (const item of items) {
    height += Math.max(l.circle, estimateTextHeight(item.text, inner - l.circle - spacing.md, l.text));
  }
  return height + spacing.md * Math.max(0, items.length - 1);
}

/** The largest text size at which the list fits; if none does, the smallest (the checks report it). */
function featureListLayout(theme: Theme, aspect: Aspect, title: string | undefined, items: FeatureItem[], area: Rect): FeatureLayout {
  const layouts = ROW_STEPS.map((step) => layoutFor(theme, aspect, step));
  return layouts.find((l) => estimateHeight(theme, aspect, area.width, title, items, l) <= area.height) ?? layouts.at(-1)!;
}

export function FeatureList({ progress, theme, aspect, area: slot, items, title }: FeatureListProps) {
  const area = slot ?? contentArea(theme, aspect);
  const width = Math.min(area.width, textColumn(theme, aspect).width);
  const layout = featureListLayout(theme, aspect, title, items, { ...area, width });
  const height = estimateHeight(theme, aspect, width, title, items, layout);
  const box = placeBlock(area, { width, height }, blockCenterY(theme, aspect, slot));
  const time = useSceneTime(progress);
  const { ms } = time;
  const { leadMs, fx, enter } = theme.motion;
  const exit = exitOpacity(theme, time, enter.ms);
  const titleOpacity = fade(fx, ms - leadMs);
  const titleRise = Math.round((1 - tween(theme.motion["text.in"], ms - leadMs)) * theme.spacing.lg * 100) / 100;
  const timing = featureListTiming(theme, items.length, title !== undefined);
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
      <div data-block="FeatureList" style={{ maxWidth: width - 2 * layout.slide }}>
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
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: spacing.md }}>
          {items.map((item, i) => {
            const { move, opacity } = arrive(theme, ms, timing[i]![0]);
            const offset = Math.round((move - 1) * layout.slide * 100) / 100;
            return (
              <li
                key={i}
                data-feature={i}
                style={{
                  opacity,
                  transform: `translateX(${offset}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: spacing.md,
                }}
              >
                <div
                  data-feature-icon=""
                  style={{
                    flex: "none",
                    width: layout.circle,
                    height: layout.circle,
                    borderRadius: "50%",
                    backgroundColor: withAlpha(colors.accent, TINT),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={item.icon} size={Math.round(layout.circle * ICON_SCALE)} color={colors.accent} />
                </div>
                <span
                  style={{
                    color: colors.text,
                    fontFamily: fonts.body,
                    ...typeCss(layout.text),
                    minWidth: 0,
                    overflowWrap: "break-word",
                  }}
                >
                  {item.text}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
