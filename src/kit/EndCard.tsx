// The calm end card from the owner's reference: a logo mark and the product
// name, one line under it, the accent line under that, and a card carried in
// below (the prompt card, again). Everything is centered on the frame and the
// block on its optical center. In 16:9 the mark sits beside the name; in tall aspects (9:16, 4:5)
// above it, so the name can stay large. The mark is an icon tile or the
// brand's own image (`logo`). An optional call to action (`cta`) sits under
// the lines: a pill on the accent and a small note under it.
//
// The mark pops in on the scene's lead and a shine crosses an icon tile once;
// the name, the line and the accent line land as whole lines a line's stagger
// apart; the pill pops in once they have landed and the note fades in after
// it; the card plays its own entrance after that. Then it holds.

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import { isTall, type Rect } from "../layout/frame";
import { AVG_CHAR_EM } from "../layout/textFit";
import { glyphPad, textBoxHeight, typeCss, TYPE_FIT_ATTRIBUTE } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { accentInk, headlineColor } from "../theme/roles";
import type { Theme, TypeSpec } from "../theme/types";
import { BrandMark } from "./BrandMark";
import { ctaErrors, ctaSize, ctaTiming, placeCta, type EndCardCta } from "./endCardCta";
import { MotionDelay, useSceneTime } from "./frameContext";
import { linePose, wordLeaving } from "./headlineMotion";
import { logoErrors } from "./mediaSource";
import { arrive, exitOpacity, fade, pulse } from "./motion";
import { nestedComponent, type SectionContent } from "./Section";
import type { KitProps } from "./types";

export interface EndCardProps extends KitProps {
  /** The product name, beside (16:9) or under (9:16) the logo mark. */
  name: string;
  /** One line under the name. */
  line?: string;
  /** A line in the accent under that. */
  accent?: string;
  /** The logo mark's icon (see `ICON_NAMES`). Default "play". */
  icon?: string;
  /** The brand's own image (.png, .jpg, .jpeg, .svg or .webp), relative to the storyboard, drawn contained in the mark box instead of the icon. */
  logo?: string;
  /** A call to action under the lines: the label in a pill, the note small under it. */
  cta?: EndCardCta;
  /** A component carried in below, e.g. the prompt card (`PromptCard` with `typed: false`). */
  card?: SectionContent;
}

export interface EndCardCtaLayout {
  pill: Rect;
  /** Half the pill's height. */
  radius: number;
  spec: TypeSpec;
  /** Whether the label was shrunk below the ramp to fit the pill. */
  fitted: boolean;
  note?: Rect;
  noteSpec: TypeSpec;
}

export interface EndCardLayout {
  direction: "row" | "column";
  /** The mark and the name together (its width an estimate: they are drawn as one centered group). */
  brand: Rect;
  /** The mark's side, in px. */
  markSize: number;
  /** The name's ramp step. */
  name: TypeSpec;
  /** The line's and the accent line's step: `subtitle`. */
  lineSpec: TypeSpec;
  line?: Rect;
  accent?: Rect;
  /** The call to action's pill and note, and their type. */
  cta?: EndCardCtaLayout;
  /** The card's slot, passed to it as its `area`. */
  card?: Rect;
}

/** Problems with an EndCard's props (its own prop check); empty if fine. */
export function endCardErrors(props: Record<string, unknown>): string[] {
  return [...logoErrors(props.logo, props.icon), ...ctaErrors(props.cta)];
}

/** Name steps to try, largest first. */
const NAME_ROLES = ["hero", "display", "headline"] as const;
/** The mark is this share of the name's size across. */
const MARK_EM = 0.95;
/** The card's slot takes this share of the area's height, or as much of it as is left (no less than the least share). */
const CARD_SHARE = 0.32;
const CARD_LEAST_SHARE = 0.2;

type Parts = { line?: unknown; accent?: unknown; cta?: unknown; card?: unknown };

/** Where each part goes inside `slot` (the content area by default). Pure. */
export function endCardLayout(
  theme: Theme,
  aspect: Aspect,
  text: { name: string; line?: string; accent?: string; cta?: EndCardCta; card?: boolean },
  slot?: Rect,
): EndCardLayout {
  const area = slot ?? contentArea(theme, aspect);
  const { spacing, type } = theme;
  const direction = !isTall(aspect) ? "row" : "column";
  const lineSpec = type.subtitle[aspect];
  const markFor = (spec: TypeSpec) => Math.round(spec.size * MARK_EM);
  const nameWidth = (spec: TypeSpec) => Math.ceil([...text.name].length * spec.size * AVG_CHAR_EM);
  const brandWidth = (spec: TypeSpec) => (direction === "row" ? markFor(spec) + spacing.sm + nameWidth(spec) : Math.max(markFor(spec), nameWidth(spec)));
  const nameHeight = (spec: TypeSpec) => Math.ceil(spec.size * spec.lineHeight) + 2 * glyphPad(spec);
  const brandHeight = (spec: TypeSpec) => (direction === "row" ? Math.max(markFor(spec), nameHeight(spec)) : markFor(spec) + spacing.xs + nameHeight(spec));
  const lineHeight = (value: string | undefined) => textBoxHeight(value, area.width, lineSpec);
  const textHeight = (spec: TypeSpec) =>
    brandHeight(spec) + (text.line === undefined ? 0 : spacing.sm + lineHeight(text.line)) + (text.accent === undefined ? 0 : spacing.xxs + lineHeight(text.accent));
  // The pill keeps clear of the right rail: the text column on the frame, the slot's width in a Section.
  const cta = text.cta === undefined ? undefined : ctaSize(theme, aspect, text.cta, slot === undefined ? textColumn(theme, aspect).width : area.width);
  const ctaHeight = cta === undefined ? 0 : spacing.md + cta.height;
  const fullCard = text.card ? Math.floor(area.height * CARD_SHARE) : 0;
  const total = (spec: TypeSpec, cardHeight = fullCard) => textHeight(spec) + ctaHeight + (text.card ? spacing.lg + cardHeight : 0);
  const specs = NAME_ROLES.map((role) => type[role][aspect]);
  const fits = specs.find((spec) => brandWidth(spec) <= area.width && total(spec) <= area.height);
  const name = fits ?? specs.at(-1)!;
  // When even the smallest name leaves too little room (a call to action and a card), the card gives way.
  const leastCard = Math.floor(area.height * CARD_LEAST_SHARE);
  const cardHeight = fits !== undefined || !text.card ? fullCard : Math.max(leastCard, Math.min(fullCard, area.height - total(name, 0)));

  const block = placeBlock(area, { width: area.width, height: total(name, cardHeight) }, blockCenterY(theme, aspect, slot));
  const mid = area.x + area.width / 2;
  const centered = (width: number, y: number, height: number): Rect => ({ x: mid - width / 2, y, width, height });
  const brand = centered(brandWidth(name), block.y, brandHeight(name));
  let y = brand.y + brand.height;
  const next = (value: string | undefined, gap: number): Rect | undefined => {
    if (value === undefined) return undefined;
    const rect = { x: area.x, y: y + gap, width: area.width, height: lineHeight(value) };
    y = rect.y + rect.height;
    return rect;
  };
  const line = next(text.line, spacing.sm);
  const accent = next(text.accent, spacing.xxs);
  let ctaLayout: EndCardCtaLayout | undefined;
  if (cta !== undefined) {
    const placed = placeCta(cta, mid, y + spacing.md, spacing);
    ctaLayout = { ...placed, radius: placed.pill.height / 2, spec: cta.spec, fitted: cta.fitted, noteSpec: cta.noteSpec };
    y += ctaHeight;
  }
  const card = text.card ? { x: area.x, y: y + spacing.lg, width: area.width, height: cardHeight } : undefined;
  return {
    direction,
    brand,
    markSize: markFor(name),
    name,
    lineSpec,
    ...(line && { line }),
    ...(accent && { accent }),
    ...(ctaLayout && { cta: ctaLayout }),
    ...(card && { card }),
  };
}

export interface EndCardTiming {
  /** When each part starts to land, in ms from the scene's start. */
  mark: number;
  name: number;
  line: number;
  accent: number;
  /** The pill pops in once the last line has landed; the note fades in after it. Both equal `accent` without a `cta`. */
  cta: number;
  note: number;
  /** How long the card's clock is held back: it arrives once the lines (and the call to action) have landed. */
  card: number;
}

/** The mark on the scene's lead, then each line a line's stagger after the one before, then the pill and its note, then the card. */
export function endCardTiming(theme: Theme, parts: Parts = {}): EndCardTiming {
  const { leadMs, pop } = theme.motion;
  const textIn = theme.motion["text.in"];
  const step = textIn.lineStaggerMs * 2;
  const mark = leadMs;
  const name = mark + step;
  const line = name + (parts.line === undefined ? 0 : step);
  const accent = line + (parts.accent === undefined ? 0 : step);
  if (parts.cta === undefined) {
    // The card follows the lines like one more line, once the mark has popped.
    return { mark, name, line, accent, cta: accent, note: accent, card: Math.max(accent + step, mark + pop.ms) };
  }
  const cta = ctaTiming(accent + textIn.ms);
  return { mark, name, line, accent, ...cta, card: Math.max(cta.note + step, mark + pop.ms) };
}

const at = (rect: Rect) => ({ position: "absolute" as const, left: rect.x, top: rect.y, width: rect.width, height: rect.height });

export function EndCard(props: EndCardProps) {
  const errors = endCardErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`EndCard: ${errors.join("; ")}`);
  const { progress, theme, aspect, area, name, line, accent, icon = "play", logo, cta, card } = props;
  const box = area ?? contentArea(theme, aspect);
  const layout = endCardLayout(theme, aspect, { name, line, accent, cta, card: card !== undefined }, area);
  const timing = endCardTiming(theme, { line, accent, cta, card });
  const time = useSceneTime(progress);
  const { colors, fonts } = theme;
  const Card = card === undefined ? undefined : nestedComponent("EndCard", card);
  const leaving = wordLeaving(theme, 0, 1, time.leftMs);
  const lands = (spec: TypeSpec, start: number) => {
    const pose = linePose(theme, spec.size * spec.lineHeight, time.ms - start, leaving);
    return { opacity: pose.opacity, transform: `translateY(${pose.y}px)` };
  };
  const textStyle = (spec: TypeSpec) => ({ margin: 0, boxSizing: "border-box" as const, padding: `${glyphPad(spec)}px 0`, ...typeCss(spec), textAlign: "center" as const });
  // The mark pops in (`pop`, a little past full size and back) and the shine crosses an icon tile once it has.
  const markIn = arrive(theme, time.ms, timing.mark, theme.motion.pop);
  const { markSize, brand, direction } = layout;
  // The pill pops in the same way, then pulses once as it settles; the note fades in under it.
  const pillIn = arrive(theme, time.ms, timing.cta, theme.motion.pop);
  const pillPulse = 1 + (theme.motion.pop.scale - 1) * pulse(theme.motion.pop, time.ms - timing.cta - theme.motion.pop.ms);
  const noteIn = fade(theme.motion.fx, time.ms - timing.note);

  return (
    <div data-end-card="" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", opacity: exitOpacity(theme, time, theme.motion["text.in"].ms) }}>
      {/* The mark and the name as one group, centered on the frame whatever the name's real width. */}
      <div
        style={{
          ...at({ x: box.x, y: brand.y, width: box.width, height: brand.height }),
          display: "flex",
          flexDirection: direction,
          alignItems: "center",
          justifyContent: "center",
          gap: direction === "row" ? theme.spacing.sm : theme.spacing.xs,
        }}
      >
        <BrandMark
          theme={theme}
          size={markSize}
          icon={icon}
          logo={logo}
          opacity={markIn.opacity * (1 - leaving)}
          scale={markIn.move}
          shineElapsedMs={time.ms - timing.mark - theme.motion.pop.ms}
          data={{ "data-block": "EndCard", "data-end-part": "mark" }}
        />
        <h1
          data-end-part="name"
          style={{ ...textStyle(layout.name), position: "relative", whiteSpace: "nowrap", fontFamily: fonts.display, color: headlineColor(theme), ...lands(layout.name, timing.name) }}
        >
          {name}
        </h1>
      </div>
      {line !== undefined && layout.line !== undefined && (
        <p data-end-part="line" style={{ ...at(layout.line), ...textStyle(layout.lineSpec), fontFamily: fonts.body, color: colors.text, ...lands(layout.lineSpec, timing.line) }}>
          {line}
        </p>
      )}
      {accent !== undefined && layout.accent !== undefined && (
        <p data-end-part="accent" style={{ ...at(layout.accent), ...textStyle(layout.lineSpec), fontFamily: fonts.body, color: accentInk(theme), ...lands(layout.lineSpec, timing.accent) }}>
          {accent}
        </p>
      )}
      {cta !== undefined && layout.cta !== undefined && (
        <div
          data-end-part="cta"
          {...(layout.cta.fitted && { [TYPE_FIT_ATTRIBUTE]: "" })}
          style={{
            ...at(layout.cta.pill),
            boxSizing: "border-box",
            borderRadius: layout.cta.radius,
            backgroundColor: colors.accent,
            color: colors.accentText,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            whiteSpace: "nowrap",
            fontFamily: fonts.body,
            ...typeCss(layout.cta.spec),
            opacity: pillIn.opacity * (1 - leaving),
            transform: `scale(${Math.round(Math.max(0, pillIn.move * pillPulse) * 1000) / 1000})`,
          }}
        >
          {cta.label}
        </div>
      )}
      {cta?.note !== undefined && layout.cta?.note !== undefined && (
        <p
          data-end-part="cta-note"
          style={{ ...at(layout.cta.note), ...textStyle(layout.cta.noteSpec), fontFamily: fonts.body, color: colors.textMuted, opacity: noteIn * (1 - leaving) }}
        >
          {cta.note}
        </p>
      )}
      {Card !== undefined && layout.card !== undefined && (
        <MotionDelay ms={timing.card}>
          <Card {...card!.props} progress={progress} theme={theme} aspect={aspect} area={layout.card} />
        </MotionDelay>
      )}
    </div>
  );
}
