// 2-6 feature rows, each an icon in a soft accent-tinted circle beside a line
// of text, with an optional title, centered in its area (the content area by
// default). Rows spring in one after another, rising and sliding from the left.

import { interpolate } from "../engine/easing";
import { Icon } from "../icons";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { withAlpha } from "../theme/color";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { themeEasing } from "./motion";
import { springIn } from "./springIn";
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

const TITLE_ENTER = 0.2;
const EXIT = 0.1;
const ROW_ENTER = 0.25;
/** By this point every row is fully in. */
const ROWS_DONE = 0.65;

/** Row text steps to try, largest first. */
const ROW_STEPS: readonly TypeRole[] = ["subtitle", "body", "label"];
/** Icon circle diameter as a multiple of the row font size. */
const CIRCLE_EM = 1.7;
/** Icon size as a fraction of the circle. */
const ICON_SCALE = 0.55;
/** Tint of the icon circle: the accent at this opacity. */
const TINT = 0.14;

/** The [start, end] of each row's entrance, as fractions of the scene. */
export function featureListTiming(count: number): Array<[number, number]> {
  const gap = count > 1 ? (ROWS_DONE - ROW_ENTER) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => [i * gap, i * gap + ROW_ENTER]);
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
  const layout = featureListLayout(theme, aspect, title, items, area);
  const easing = themeEasing(theme);
  const exit = interpolate(progress, [1 - EXIT, 1], [1, 0], { easing });
  const titleIn = interpolate(progress, [0, TITLE_ENTER], [0, 1], { easing });
  const timing = featureListTiming(items.length);
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
              opacity: titleIn,
              transform: `translateY(${(1 - titleIn) * spacing.lg}px)`,
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
            const [start, end] = timing[i]!;
            const s = springIn(progress, start, end - start, theme.motion.springs.enter);
            const offset = Math.round((s - 1) * layout.slide * 100) / 100;
            return (
              <li
                key={i}
                data-feature={i}
                style={{
                  opacity: Math.min(1, Math.max(0, s)),
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
