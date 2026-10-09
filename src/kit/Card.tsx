// A card: an icon in a circle, a title, an optional subtitle and an optional
// step number, on a surface with the theme radius, a hairline border and the
// soft long card shadow. Highlighted, it lights up in the accent: an accent
// ring and icon circle (subtle), or an accent fill (bold).
//
// `CardFace` draws one card into a given box (CardRow lays several out);
// `Card` is the scene component: one card centered in the content area.

import { interpolate } from "../engine/easing";
import { Icon } from "../icons";
import { contentArea } from "../layout/caption";
import { estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { mixColors, withAlpha } from "../theme/color";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { themeEasing } from "./motion";
import { springIn } from "./springIn";
import type { KitProps } from "./types";

export interface CardData {
  /** An icon name (see `ICON_NAMES`). */
  icon?: string;
  title: string;
  subtitle?: string;
  /** A step number shown in the card's top-right corner. */
  step?: number;
}

/** `column`: icon above the text. `row`: icon left of the text, for wide, short cards. */
export type CardOrientation = "column" | "row";

/** Type and sizes in px for one card. */
export interface CardMetrics {
  orientation: CardOrientation;
  /** The title's ramp step, always in the `title` step's weight. */
  title: TypeSpec;
  /** The subtitle's ramp step, a step below the title's. */
  subtitle: TypeSpec;
  /** The step number's ramp step, in the bold weight. */
  number: TypeSpec;
  /** Diameter of the icon circle. */
  badge: number;
  iconSize: number;
  /** Diameter of the step-number circle. */
  stepSize: number;
  padding: number;
  border: number;
}

/** Title steps to try, largest first. */
export const CARD_TITLE_STEPS = ["title", "subtitle", "body", "label"] as const satisfies readonly TypeRole[];
export type CardTitleStep = (typeof CARD_TITLE_STEPS)[number];
/** The subtitle's step under each title step. */
const SUBTITLE_STEP: Record<CardTitleStep, TypeRole> = { title: "body", subtitle: "body", body: "label", label: "label" };
/** Highlight lift: how much a lit card grows. */
const LIFT = 0.04;

export function cardMetrics(theme: Theme, aspect: Aspect, titleStep: CardTitleStep, orientation: CardOrientation): CardMetrics {
  const { type, weights } = theme;
  const title = { ...type[titleStep][aspect], weight: type.title[aspect].weight };
  const subtitle = type[SUBTITLE_STEP[titleStep]][aspect];
  const badge = Math.round(title.size * 1.6);
  return {
    orientation,
    title,
    subtitle,
    number: { ...type.label[aspect], weight: weights.bold },
    badge,
    iconSize: Math.round(badge * 0.55),
    stepSize: Math.round(subtitle.size * 1.5),
    padding: aspect === "9:16" ? theme.spacing.md : Math.round(theme.spacing.md * 0.8),
    border: theme.hairline,
  };
}

/** Width in px left for the title and subtitle in a card of `width`. */
function textWidth(card: CardData, width: number, m: CardMetrics, theme: Theme): number {
  let w = width - 2 * (m.padding + m.border);
  if (card.step !== undefined) w -= m.stepSize + theme.spacing.xs;
  if (m.orientation === "row" && card.icon !== undefined) w -= m.badge + theme.spacing.md;
  return Math.max(1, w);
}

/** Estimated height in px of `card` laid out `width` px wide. */
export function cardHeight(theme: Theme, card: CardData, width: number, m: CardMetrics): number {
  const tw = textWidth(card, width, m, theme);
  let text = estimateTextHeight(card.title, tw, m.title);
  if (card.subtitle !== undefined) {
    text += theme.spacing.xxs + estimateTextHeight(card.subtitle, tw, m.subtitle);
  }
  const top = card.icon !== undefined ? m.badge : card.step !== undefined ? m.stepSize : 0;
  const body = m.orientation === "row" ? Math.max(text, top) : top + (top > 0 ? theme.spacing.xs : 0) + text;
  return Math.ceil(body + 2 * (m.padding + m.border));
}

export interface CardFaceProps extends CardData {
  theme: Theme;
  metrics: CardMetrics;
  /** How lit the card is, 0..1 (may overshoot while springing). */
  highlight?: number;
}

/** One card filling its parent box. */
export function CardFace({ theme, metrics: m, icon, title, subtitle, step, highlight = 0 }: CardFaceProps) {
  const { colors, fonts, spacing, cardShadow } = theme;
  const lit = Math.min(1, Math.max(0, highlight));
  const on = lit >= 0.5;
  const bold = theme.accentIntensity === "bold";
  const fill = bold ? mixColors(colors.surface, colors.accent, lit) : colors.surface;
  const text = bold && on ? colors.accentText : colors.text;
  const muted = bold && on ? colors.accentText : colors.textMuted;
  const shadow = `0 ${cardShadow.y}px ${cardShadow.blur}px ${withAlpha(colors.shadow, cardShadow.opacity)}`;
  const ring = lit > 0 ? `, 0 0 0 ${Math.round(2 * theme.hairline * lit * 100) / 100}px ${colors.accent}` : "";
  const row = m.orientation === "row";

  return (
    <div
      data-card-face=""
      data-highlighted={on ? "true" : "false"}
      style={{
        position: "absolute",
        inset: 0,
        boxSizing: "border-box",
        padding: m.padding,
        backgroundColor: fill,
        border: `${m.border}px solid ${colors.border}`,
        borderRadius: theme.radius.md,
        boxShadow: shadow + ring,
        transform: `scale(${1 + LIFT * highlight})`,
        display: "flex",
        flexDirection: row ? "row" : "column",
        alignItems: row ? "center" : "flex-start",
        justifyContent: "flex-start",
        gap: row ? spacing.md : spacing.xs,
      }}
    >
      {icon !== undefined && (
        <div
          style={{
            flex: "none",
            width: m.badge,
            height: m.badge,
            borderRadius: "50%",
            backgroundColor: on ? (bold ? colors.accentText : colors.accent) : withAlpha(colors.accent, 0.14),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={m.iconSize} color={on ? (bold ? colors.accent : colors.accentText) : colors.accent} />
        </div>
      )}
      <div style={{ minWidth: 0, paddingRight: step !== undefined ? m.stepSize + spacing.xs : 0 }}>
        <div
          style={{
            color: text,
            fontFamily: fonts.display,
            ...typeCss(m.title),
            overflowWrap: "break-word",
            textWrap: "balance",
          }}
        >
          {title}
        </div>
        {subtitle !== undefined && (
          <div
            style={{
              marginTop: spacing.xxs,
              color: muted,
              fontFamily: fonts.body,
              ...typeCss(m.subtitle),
              overflowWrap: "break-word",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {step !== undefined && (
        <div
          style={{
            position: "absolute",
            top: m.padding,
            right: m.padding,
            width: m.stepSize,
            height: m.stepSize,
            boxSizing: "border-box",
            borderRadius: "50%",
            border: `${m.border}px solid ${on ? colors.accent : colors.border}`,
            backgroundColor: on ? colors.accent : fill,
            color: on ? colors.accentText : colors.textMuted,
            fontFamily: fonts.body,
            ...typeCss(m.number),
            fontVariantNumeric: "tabular-nums",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {step}
        </div>
      )}
    </div>
  );
}

/** Opacity and transform for a card entering with spring value `s` (0 -> 1, may overshoot). */
export function cardEntrance(s: number, theme: Theme): { opacity: number; transform: string } {
  const rise = Math.round((1 - s) * theme.spacing.lg * 100) / 100;
  const scale = Math.round((0.94 + 0.06 * s) * 1000) / 1000;
  return { opacity: Math.min(1, Math.max(0, s)), transform: `translateY(${rise}px) scale(${scale})` };
}

export interface CardProps extends KitProps, CardData {
  highlighted?: boolean;
}

const ENTER = 0.25;
const EXIT = 0.1;

/** A single card, centered in its area (the content area by default), springing in. */
export function Card({ progress, theme, aspect, area: slot, highlighted = false, ...card }: CardProps) {
  const area = slot ?? contentArea(theme, aspect);
  // As wide as it would be in the full content area, but never wider than its area.
  const full = contentArea(theme, aspect);
  const width = Math.min(area.width, aspect === "9:16" ? full.width : Math.round(full.width * 0.4));
  const metrics =
    CARD_TITLE_STEPS.map((step) => cardMetrics(theme, aspect, step, "column")).find(
      (m) => cardHeight(theme, card, width, m) <= area.height,
    ) ?? cardMetrics(theme, aspect, CARD_TITLE_STEPS.at(-1)!, "column");
  const height = Math.min(area.height, cardHeight(theme, card, width, metrics));
  const exit = interpolate(progress, [1 - EXIT, 1], [1, 0], { easing: themeEasing(theme) });
  const entrance = cardEntrance(springIn(progress, 0, ENTER, theme.motion.springs.enter), theme);

  return (
    <div style={{ position: "absolute", left: area.x, top: area.y, width: area.width, height: area.height, opacity: exit }}>
      <div
        data-card="0"
        style={{
          position: "absolute",
          left: (area.width - width) / 2,
          top: (area.height - height) / 2,
          width,
          height,
          ...entrance,
        }}
      >
        <CardFace theme={theme} metrics={metrics} highlight={highlighted ? 1 : 0} {...card} />
      </div>
    </div>
  );
}
