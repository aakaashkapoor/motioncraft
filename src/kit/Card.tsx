// A card: an icon in a circle, a title, an optional subtitle and an optional
// step number, on a surface with the theme radius, a hairline border and the
// soft long card shadow. Highlighted, it pops (`pop`) and lights up in the
// accent: an accent ring and chips (subtle), or an accent fill (bold).
//
// A label card (a title alone) is centered: icon above, text centered. A card
// with a subtitle keeps its text left-aligned but hugs its content, and its
// content sits centered in the card, so nothing hugs one edge with an empty
// half (design v3, section C). A step card follows the owner's reference: the
// number chip leads at the top-left, the text follows, and the icon closes at
// the bottom-left (beside the text: at the right end).
//
// Cards lift in (design v3, life #8): from below and a little small, their
// shadow growing as they rise (see `cardEntrance`).
//
// `CardFace` draws one card into a given box (CardRow lays several out);
// `Card` is the scene component: one card on the frame's optical center.

import { Icon } from "../icons";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea } from "../layout/caption";
import type { Rect, Size } from "../layout/frame";
import { safeZones } from "../layout/safe";
import { AVG_CHAR_EM, charsPerLine, estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { mixColors, withAlpha } from "../theme/color";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { useSceneTime } from "./frameContext";
import { arrive, exitOpacity } from "./motion";
import { highlightLevel, highlightShineMs, highlightStops } from "./progression";
import { Shine } from "./shine";
import type { KitProps } from "./types";

export interface CardData {
  /** An icon name (see `ICON_NAMES`). */
  icon?: string;
  title: string;
  subtitle?: string;
  /** A step number, in a chip at the card's top-left. */
  step?: number;
}

/** `column`: icon above the text. `row`: icon left of the text, for wide, short cards. */
export type CardOrientation = "column" | "row";

/** Type and sizes in px for one card. */
export interface CardMetrics {
  orientation: CardOrientation;
  /** The title's ramp step, always in the `title` step's weight. */
  title: TypeSpec;
  /** The subtitle's ramp step, a step below the title's, in the regular weight. */
  subtitle: TypeSpec;
  /** The step number's ramp step, in the bold weight. */
  number: TypeSpec;
  /** Diameter of the icon circle. */
  badge: number;
  iconSize: number;
  /** Diameter of the step-number chip. */
  stepSize: number;
  padding: number;
  border: number;
}

/** Title steps to try, largest first. */
export const CARD_TITLE_STEPS = ["title", "subtitle", "body", "label"] as const satisfies readonly TypeRole[];
export type CardTitleStep = (typeof CARD_TITLE_STEPS)[number];
/** The subtitle's step under each title step. */
const SUBTITLE_STEP: Record<CardTitleStep, TypeRole> = { title: "body", subtitle: "body", body: "label", label: "label" };
/** Tint of a calm icon circle: the accent at this opacity. */
const TINT_OPACITY = 0.14;

export function cardMetrics(theme: Theme, aspect: Aspect, titleStep: CardTitleStep, orientation: CardOrientation): CardMetrics {
  const { type, weights } = theme;
  const title = { ...type[titleStep][aspect], weight: type.title[aspect].weight };
  // The reference sets secondary lines in the regular weight: the title carries the weight.
  const subtitle = { ...type[SUBTITLE_STEP[titleStep]][aspect], weight: weights.regular };
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

/**
 * True when the card's step chip leads its content (then the text, then the
 * icon): a step card with a subtitle, or any step card with the icon beside
 * the text. A label card above its icon keeps its content centered and the
 * chip in its top-left corner.
 */
const stepLeads = (card: Pick<CardData, "step" | "subtitle">, m: CardMetrics): boolean =>
  card.step !== undefined && (m.orientation === "row" || !isLabelCard(card));

/** Estimated width in px of one line of `text` in `spec`: generous, like the height estimates. */
const lineWidth = (text: string, spec: TypeSpec) => Math.ceil(text.length * spec.size * AVG_CHAR_EM);

/**
 * The width in px `card` needs to show its title and its subtitle each on one
 * line: the width of a card that hugs its content, before any maximum.
 */
export function cardContentWidth(theme: Theme, card: CardData, m: CardMetrics): number {
  const { md, xs } = theme.spacing;
  let text = lineWidth(card.title, m.title);
  if (card.subtitle !== undefined) text = Math.max(text, lineWidth(card.subtitle, m.subtitle));
  const icon = card.icon === undefined ? 0 : m.badge;
  const row = m.orientation === "row";
  let width: number;
  if (stepLeads(card, m)) {
    width = row ? m.stepSize + md + text + (icon > 0 ? md + icon : 0) : Math.max(m.stepSize, text, icon);
  } else {
    width = row ? text + (icon > 0 ? icon + md : 0) : Math.max(text, icon);
    if (card.step !== undefined) width += m.stepSize + xs;
  }
  return width + 2 * (m.padding + m.border);
}

/** Width in px left for the title and subtitle in a card of `width`: beside the icon, they share the row with it and the step chip. */
function textWidth(card: CardData, width: number, m: CardMetrics, theme: Theme): number {
  let w = width - 2 * (m.padding + m.border);
  if (m.orientation === "row" && card.step !== undefined) w -= m.stepSize + theme.spacing.md;
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
  const { xs, xxs } = theme.spacing;
  const tw = textWidth(card, width, m, theme);
  let text = estimateTextHeight(card.title, tw, m.title);
  if (card.subtitle !== undefined) text += xxs + estimateTextHeight(card.subtitle, tw, m.subtitle);
  const icon = card.icon === undefined ? 0 : m.badge;
  const step = card.step === undefined ? 0 : m.stepSize;
  let body: number;
  if (m.orientation === "row") body = Math.max(text, icon, step);
  else if (stepLeads(card, m)) body = step + xs + text + (icon > 0 ? xs + icon : 0);
  else {
    const top = icon > 0 ? icon : step;
    body = top + (top > 0 ? xs : 0) + text;
  }
  return Math.ceil(body + 2 * (m.padding + m.border));
}

/** The card shadow at `lift` (0 setting off, 1 landed): from the `lift` token's small shadow to the theme's card shadow. */
export function liftShadow(theme: Theme, lift: number): string {
  const { cardShadow, colors } = theme;
  const { shadowY, shadowBlur } = theme.motion.lift;
  const t = Math.min(1, Math.max(0, lift));
  const y = Math.round((shadowY + (cardShadow.y - shadowY) * t) * 100) / 100;
  const blur = Math.round((shadowBlur + (cardShadow.blur - shadowBlur) * t) * 100) / 100;
  return `0 ${y}px ${blur}px ${withAlpha(colors.shadow, cardShadow.opacity)}`;
}

/** The scale of an item `level` lit (see `highlightLevel`): 1 calm, the `pop` token's scale lit. */
export function popScale(theme: Theme, level: number): number {
  return Math.round((1 + (theme.motion.pop.scale - 1) * level) * 10000) / 10000;
}

/** The accent ring of an item `lit` (0..1): 2 hairlines wide when fully lit. */
export function accentRing(theme: Theme, lit: number): string {
  return lit > 0 ? `0 0 0 ${Math.round(2 * theme.hairline * lit * 100) / 100}px ${theme.colors.accent}` : "";
}

export interface CardFaceProps extends CardData {
  theme: Theme;
  metrics: CardMetrics;
  /** How lit the card is (see `highlightLevel`): 0 calm, 1 lit; may overshoot while it pops. */
  highlight?: number;
  /** How far the card has lifted in (see `cardEntrance`): its shadow grows with it. Default 1, landed. */
  lift?: number;
  /** Time since the card's shine set off, in ms; no shine when undefined. Needs `size`. */
  shineMs?: number;
  /** The card's size in px, for the shine. */
  size?: Size;
}

/** One card filling its parent box, its content centered in it. */
export function CardFace({ theme, metrics: m, icon, title, subtitle, step, highlight = 0, lift = 1, shineMs, size }: CardFaceProps) {
  const { colors, fonts, spacing } = theme;
  const lit = Math.min(1, Math.max(0, highlight));
  const on = lit >= 0.5;
  const bold = theme.accentIntensity === "bold";
  const fill = bold ? mixColors(colors.surface, colors.accent, lit) : colors.surface;
  const text = bold && on ? colors.accentText : colors.text;
  const muted = bold && on ? colors.accentText : colors.textMuted;
  const ring = accentRing(theme, lit);
  const row = m.orientation === "row";
  const label = isLabelCard({ subtitle });
  const leads = stepLeads({ step, subtitle }, m);
  // A lit chip fills with the accent; on a bold card, already in the accent, it turns the accent's ink instead.
  const chipFill = on ? (bold ? colors.accentText : colors.accent) : undefined;
  const chipInk = on ? (bold ? colors.accent : colors.accentText) : undefined;

  const chip = step !== undefined && (
    <div
      data-card-step=""
      style={{
        ...(leads ? { flex: "none" } : { position: "absolute", top: m.padding, left: m.padding }),
        width: m.stepSize,
        height: m.stepSize,
        borderRadius: "50%",
        backgroundColor: chipFill ?? colors.surfaceAlt,
        color: chipInk ?? colors.text,
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
  );

  const badge = icon !== undefined && (
    <div
      data-card-icon=""
      style={{
        flex: "none",
        // A step card's icon closes it: at the bottom-left, below the text.
        ...(leads && !row ? { marginTop: "auto" } : {}),
        width: m.badge,
        height: m.badge,
        borderRadius: "50%",
        backgroundColor: chipFill ?? withAlpha(colors.accent, TINT_OPACITY),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={m.iconSize} color={chipInk ?? colors.accent} />
    </div>
  );

  const words = (
    <div data-card-text="" style={{ minWidth: 0, textAlign: label && !row ? "center" : "left", ...(leads && row ? { flex: 1 } : {}) }}>
      <div
        data-card-title=""
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
          data-card-subtitle=""
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
  );

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
        boxShadow: ring === "" ? liftShadow(theme, lift) : `${liftShadow(theme, lift)}, ${ring}`,
        transform: `scale(${popScale(theme, highlight)})`,
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
          // Led by its chip, a step card's content spans the card, so the chips of a row line up.
          ...(leads ? { width: "100%", alignSelf: "stretch" } : {}),
        }}
      >
        {leads && chip}
        {!leads && badge}
        {words}
        {leads && badge}
      </div>
      {!leads && chip}
      {shineMs !== undefined && size !== undefined && <Shine theme={theme} size={size} elapsedMs={shineMs} radius={theme.radius.md} />}
    </div>
  );
}

/** A card lifting in: its style (opacity and transform) and how far it has lifted, for its shadow (see `CardFace`). */
export interface CardEntrance {
  style: { opacity: number; transform: string };
  lift: number;
}

/**
 * A card or row arriving (see `arrive`): it rises from `lift.risePx` below
 * and grows from `lift.fromScale` with `move` (0 -> 1, may overshoot), and
 * fades in with `opacity`.
 */
export function cardEntrance({ move, opacity }: { move: number; opacity: number }, theme: Theme): CardEntrance {
  const { risePx, fromScale } = theme.motion.lift;
  const rise = Math.round((1 - move) * risePx * 100) / 100;
  const scale = Math.round((fromScale + (1 - fromScale) * move) * 1000) / 1000;
  return { style: { opacity, transform: `translateY(${rise}px) scale(${scale})` }, lift: move };
}

export interface CardProps extends KitProps, CardData {
  /** Pops the card in the accent once it has landed, and shines it once. */
  highlighted?: boolean;
}

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
 * A single card lifting in: a label card at the full card width, one with a
 * subtitle hugging its content. The icon sits above the text, or beside it at
 * a step where there is no room above. On the frame's optical center, or
 * centered in its slot. Highlighted, it pops in the accent once it has landed
 * and the shine crosses it once.
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
  const time = useSceneTime(progress);
  const { leadMs, enter } = theme.motion;
  const exit = exitOpacity(theme, time, enter.ms);
  const entrance = cardEntrance(arrive(theme, time.ms, leadMs), theme);
  const stops = highlightStops(theme, highlighted ? 0 : undefined, 1, leadMs + enter.ms);

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
          ...entrance.style,
        }}
      >
        <CardFace
          theme={theme}
          metrics={metrics}
          highlight={highlightLevel(theme, stops, 0, time.ms)}
          lift={entrance.lift}
          shineMs={highlightShineMs(stops, 0, time.ms)}
          size={{ width, height }}
          {...card}
        />
      </div>
    </div>
  );
}
