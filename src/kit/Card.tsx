// A card: an icon in a circle, a title, an optional subtitle and an optional
// step number, on a surface with the theme radius, a hairline border and the
// soft long card shadow. Highlighted, it lights up in the accent: an accent
// ring and icon circle (subtle), or an accent fill (bold).
//
// A label card (a title alone) is centered: icon above, text centered. A card
// with a subtitle keeps its text left-aligned but hugs its content, and its
// content sits centered in the card, so nothing hugs one edge with an empty
// half (design v3, section C).
//
// `CardFace` draws one card into a given box (CardRow lays several out);
// `Card` is the scene component: one card on the frame's optical center.

import { interpolate } from "../engine/easing";
import { Icon } from "../icons";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { safeZones } from "../layout/safe";
import { AVG_CHAR_EM, charsPerLine, estimateTextHeight } from "../layout/textFit";
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

/** A card with a title alone: its content is centered, icon above the text. */
export const isLabelCard = (card: Pick<CardData, "subtitle">): boolean => card.subtitle === undefined;

/** Estimated width in px of one line of `text` in `spec`: generous, like the height estimates. */
const lineWidth = (text: string, spec: TypeSpec) => Math.ceil(text.length * spec.size * AVG_CHAR_EM);

/**
 * The width in px `card` needs to show its title and its subtitle each on one
 * line: the width of a card that hugs its content, before any maximum.
 */
export function cardContentWidth(theme: Theme, card: CardData, m: CardMetrics): number {
  let text = lineWidth(card.title, m.title);
  if (card.subtitle !== undefined) text = Math.max(text, lineWidth(card.subtitle, m.subtitle));
  const icon = card.icon === undefined ? 0 : m.badge;
  let width = m.orientation === "row" ? text + (icon > 0 ? icon + theme.spacing.md : 0) : Math.max(text, icon);
  if (card.step !== undefined) width += m.stepSize + theme.spacing.xs;
  return width + 2 * (m.padding + m.border);
}

/**
 * Width in px left for the title and subtitle in a card of `width`. Beside the
 * icon, the text also shares its row with the step number.
 */
function textWidth(card: CardData, width: number, m: CardMetrics, theme: Theme): number {
  let w = width - 2 * (m.padding + m.border);
  if (m.orientation === "row" && card.step !== undefined) w -= m.stepSize + theme.spacing.xs;
  if (m.orientation === "row" && card.icon !== undefined) w -= m.badge + theme.spacing.md;
  return Math.max(1, w);
}

const longestWord = (text: string) => Math.max(0, ...text.split(" ").map((word) => word.length));

/** True when no word of the title or subtitle has to break to fit a card `width` px wide: a broken word is hard to read. */
export function cardWordsFit(theme: Theme, card: CardData, width: number, m: CardMetrics): boolean {
  const tw = textWidth(card, width, m, theme);
  const fits = (text: string, spec: TypeSpec) => charsPerLine(tw, spec.size) >= longestWord(text);
  return fits(card.title, m.title) && (card.subtitle === undefined || fits(card.subtitle, m.subtitle));
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

/** One card filling its parent box, its content centered in it. */
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
  const label = isLabelCard({ subtitle });

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
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        data-card-content={label ? "label" : "text"}
        style={{
          display: "flex",
          flexDirection: row ? "row" : "column",
          // A label centers under its icon; longer text keeps a left edge, the icon above it.
          alignItems: row || label ? "center" : "flex-start",
          gap: row ? spacing.md : spacing.xs,
          minWidth: 0,
          maxWidth: "100%",
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
        {/* Beside the icon the text shares its row with the step number; above, the icon's row holds it. */}
        <div data-card-text="" style={{ minWidth: 0, textAlign: label && !row ? "center" : "left", paddingRight: step !== undefined && row ? m.stepSize + spacing.xs : 0 }}>
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

/** In 16:9 a lone card is at most this share of the content area's width. */
const WIDE_CARD_SHARE = 0.4;

/**
 * The widest a card gets in `area`: the primary width in 9:16 (760 in
 * `shorts`, which keeps its text off the right rail), a share of the content
 * area in 16:9, and never more than `area`.
 */
export function maxCardWidth(theme: Theme, aspect: Aspect, area: Rect): number {
  const max = aspect === "9:16" ? safeZones(aspect, theme.safe).primaryWidth : Math.round(contentArea(theme, aspect).width * WIDE_CARD_SHARE);
  return Math.min(area.width, max);
}

/**
 * A single card springing in: a label card at the full card width, one with a
 * subtitle hugging its content. The icon sits above the text, or beside it at
 * a step where there is no room above. On the frame's optical center, or
 * centered in its slot.
 */
export function Card({ progress, theme, aspect, area: slot, highlighted = false, ...card }: CardProps) {
  const area = slot ?? contentArea(theme, aspect);
  const max = maxCardWidth(theme, aspect, area);
  const widthFor = (m: CardMetrics) => (isLabelCard(card) ? max : Math.min(max, cardContentWidth(theme, card, m)));
  // Largest text first; at each step, the icon above the text before beside it.
  const candidates = CARD_TITLE_STEPS.flatMap((step) => (["column", "row"] as const).map((orientation) => cardMetrics(theme, aspect, step, orientation)));
  const fits = (m: CardMetrics) => cardHeight(theme, card, widthFor(m), m) <= area.height && cardWordsFit(theme, card, widthFor(m), m);
  const metrics = candidates.find(fits) ?? candidates.at(-1)!;
  const width = widthFor(metrics);
  // Never shorter than its content: a card too tall for its area overflows it evenly.
  const height = cardHeight(theme, card, width, metrics);
  const box = placeBlock(area, { width, height }, blockCenterY(theme, aspect, slot));
  const exit = interpolate(progress, [1 - EXIT, 1], [1, 0], { easing: themeEasing(theme) });
  const entrance = cardEntrance(springIn(progress, 0, ENTER, theme.motion.springs.enter), theme);

  return (
    <div style={{ position: "absolute", left: area.x, top: area.y, width: area.width, height: area.height, opacity: exit }}>
      <div
        data-card="0"
        data-block="Card"
        style={{
          position: "absolute",
          left: box.x - area.x,
          top: box.y - area.y,
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
