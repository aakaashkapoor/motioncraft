// The calm end card from the owner's reference: a logo mark and the product
// name, one line under it, the accent line under that, and a card carried in
// below (the prompt card, again). Everything is centered on the frame and the
// block on its optical center. In 16:9 the mark sits beside the name; in 9:16
// above it, so the name can stay large.
//
// The mark pops in on the scene's lead and a shine crosses it once; the name,
// the line and the accent line land as whole lines a line's stagger apart;
// the card plays its own entrance once they have landed. Then it holds.

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { AVG_CHAR_EM } from "../layout/textFit";
import { glyphPad, textBoxHeight, typeCss } from "../layout/type";
import { Icon } from "../icons";
import type { Aspect } from "../storyboard/types";
import { accentInk, headlineColor } from "../theme/roles";
import type { Theme, TypeSpec } from "../theme/types";
import { MotionDelay, useSceneTime } from "./frameContext";
import { linePose, wordLeaving } from "./headlineMotion";
import { arrive, exitOpacity } from "./motion";
import { nestedComponent, type SectionContent } from "./Section";
import { Shine } from "./shine";
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
  /** A component carried in below, e.g. the prompt card (`PromptCard` with `typed: false`). */
  card?: SectionContent;
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
  /** The card's slot, passed to it as its `area`. */
  card?: Rect;
}

/** Name steps to try, largest first. */
const NAME_ROLES = ["hero", "display", "headline"] as const;
/** The mark is this share of the name's size across. */
const MARK_EM = 0.95;
/** The card's slot takes this share of the area's height. */
const CARD_SHARE = 0.32;

type Parts = { line?: unknown; accent?: unknown; card?: unknown };

/** Where each part goes inside `slot` (the content area by default). Pure. */
export function endCardLayout(theme: Theme, aspect: Aspect, text: { name: string; line?: string; accent?: string; card?: boolean }, slot?: Rect): EndCardLayout {
  const area = slot ?? contentArea(theme, aspect);
  const { spacing, type } = theme;
  const direction = aspect === "16:9" ? "row" : "column";
  const lineSpec = type.subtitle[aspect];
  const markFor = (spec: TypeSpec) => Math.round(spec.size * MARK_EM);
  const nameWidth = (spec: TypeSpec) => Math.ceil([...text.name].length * spec.size * AVG_CHAR_EM);
  const brandWidth = (spec: TypeSpec) => (direction === "row" ? markFor(spec) + spacing.sm + nameWidth(spec) : Math.max(markFor(spec), nameWidth(spec)));
  const nameHeight = (spec: TypeSpec) => Math.ceil(spec.size * spec.lineHeight) + 2 * glyphPad(spec);
  const brandHeight = (spec: TypeSpec) => (direction === "row" ? Math.max(markFor(spec), nameHeight(spec)) : markFor(spec) + spacing.xs + nameHeight(spec));
  const lineHeight = (value: string | undefined) => textBoxHeight(value, area.width, lineSpec);
  const textHeight = (spec: TypeSpec) =>
    brandHeight(spec) + (text.line === undefined ? 0 : spacing.sm + lineHeight(text.line)) + (text.accent === undefined ? 0 : spacing.xxs + lineHeight(text.accent));
  const cardHeight = text.card ? Math.floor(area.height * CARD_SHARE) : 0;
  const total = (spec: TypeSpec) => textHeight(spec) + (text.card ? spacing.lg + cardHeight : 0);
  const specs = NAME_ROLES.map((role) => type[role][aspect]);
  const name = specs.find((spec) => brandWidth(spec) <= area.width && total(spec) <= area.height) ?? specs.at(-1)!;

  const block = placeBlock(area, { width: area.width, height: total(name) }, blockCenterY(theme, aspect, slot));
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
  const card = text.card ? { x: area.x, y: y + spacing.lg, width: area.width, height: cardHeight } : undefined;
  return { direction, brand, markSize: markFor(name), name, lineSpec, ...(line && { line }), ...(accent && { accent }), ...(card && { card }) };
}

export interface EndCardTiming {
  /** When each part starts to land, in ms from the scene's start. */
  mark: number;
  name: number;
  line: number;
  accent: number;
  /** How long the card's clock is held back: it arrives once the lines have landed. */
  card: number;
}

/** The mark on the scene's lead, then each line a line's stagger after the one before, then the card. */
export function endCardTiming(theme: Theme, parts: Parts = {}): EndCardTiming {
  const { leadMs, pop } = theme.motion;
  const textIn = theme.motion["text.in"];
  const step = textIn.lineStaggerMs * 2;
  const mark = leadMs;
  const name = mark + step;
  const line = name + (parts.line === undefined ? 0 : step);
  const accent = line + (parts.accent === undefined ? 0 : step);
  // The card follows the lines like one more line, once the mark has popped.
  return { mark, name, line, accent, card: Math.max(accent + step, mark + pop.ms) };
}

const at = (rect: Rect) => ({ position: "absolute" as const, left: rect.x, top: rect.y, width: rect.width, height: rect.height });

export function EndCard({ progress, theme, aspect, area, name, line, accent, icon = "play", card }: EndCardProps) {
  const box = area ?? contentArea(theme, aspect);
  const layout = endCardLayout(theme, aspect, { name, line, accent, card: card !== undefined }, area);
  const timing = endCardTiming(theme, { line, accent, card });
  const time = useSceneTime(progress);
  const { colors, fonts, radius } = theme;
  const Card = card === undefined ? undefined : nestedComponent("EndCard", card);
  const leaving = wordLeaving(theme, 0, 1, time.leftMs);
  const lands = (spec: TypeSpec, start: number) => {
    const pose = linePose(theme, spec.size * spec.lineHeight, time.ms - start, leaving);
    return { opacity: pose.opacity, transform: `translateY(${pose.y}px)` };
  };
  const textStyle = (spec: TypeSpec) => ({ margin: 0, boxSizing: "border-box" as const, padding: `${glyphPad(spec)}px 0`, ...typeCss(spec), textAlign: "center" as const });
  // The mark pops in (`pop`, a little past full size and back) and the shine crosses it once it has.
  const markIn = arrive(theme, time.ms, timing.mark, theme.motion.pop);
  const { markSize, brand, direction } = layout;

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
        <div
          data-block="EndCard"
          data-end-part="mark"
          style={{
            flex: "none",
            width: markSize,
            height: markSize,
            borderRadius: radius.md,
            backgroundColor: colors.accent,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: markIn.opacity * (1 - leaving),
            transform: `scale(${Math.round(Math.max(0, markIn.move) * 1000) / 1000})`,
          }}
        >
          <Icon name={icon} size={Math.round(markSize * 0.5)} color={colors.surface} />
          <Shine theme={theme} size={{ width: markSize, height: markSize }} elapsedMs={time.ms - timing.mark - theme.motion.pop.ms} radius={radius.md} />
        </div>
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
      {Card !== undefined && layout.card !== undefined && (
        <MotionDelay ms={timing.card}>
          <Card {...card!.props} progress={progress} theme={theme} aspect={aspect} area={layout.card} />
        </MotionDelay>
      )}
    </div>
  );
}
