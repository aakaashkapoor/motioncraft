// The pure parts of BentoGrid: its prop rules, the grid templates (one per
// card count and area shape), each card's cell and the boxes of what it holds
// (type steps picked from the ramp so the content fits), the fills and their
// inks, and the cascade's timing. Runs in tests.

import { textColumn } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { textBoxHeight, typeSpec } from "../layout/type";
import { estimateLines } from "../layout/textFit";
import type { Aspect } from "../storyboard/types";
import { AA_CONTRAST, contrastRatio } from "../theme/contrast";
import { inkOn } from "../theme/palettes";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";

export const BENTO_KINDS = ["stat", "title", "ring", "bars", "quote"] as const;
export type BentoKind = (typeof BENTO_KINDS)[number];
/** What a card may be filled with: a palette swatch, the theme's surface, or its text colour (a dark card on a light ground). */
export const BENTO_FILLS = ["p1", "p2", "p3", "p4", "surface", "text"] as const;
export type BentoFillRole = (typeof BENTO_FILLS)[number];

export const BENTO_MIN_CARDS = 3;
export const BENTO_MAX_CARDS = 6;
export const VALUE_MAX = 8;
export const LABEL_MAX = 32;
export const TITLE_MAX = 40;
export const QUOTE_MAX = 64;

interface CardBase {
  fill?: BentoFillRole;
}
/** A big number that counts up, a label under it and an optional small line chart. */
export interface BentoStat extends CardBase {
  kind: "stat";
  value: string;
  label: string;
  trend?: number[];
}
/** A title, with an optional toggle that flips on. */
export interface BentoTitle extends CardBase {
  kind: "title";
  text: string;
  toggle?: boolean;
}
/** A progress ring that draws to `percent`, the number counting up in its hole. */
export interface BentoRing extends CardBase {
  kind: "ring";
  percent: number;
  label?: string;
}
/** 3-6 bars that grow in a cascade. */
export interface BentoBars extends CardBase {
  kind: "bars";
  values: number[];
  label?: string;
}
/** One sentence in the display serif italic, with an optional mini keyframe track. */
export interface BentoQuote extends CardBase {
  kind: "quote";
  text: string;
  track?: boolean;
}
export type BentoCard = BentoStat | BentoTitle | BentoRing | BentoBars | BentoQuote;

/** Each kind's fields besides `kind` and `fill`; `true` when required. */
const FIELDS: Record<BentoKind, Record<string, boolean>> = {
  stat: { value: true, label: true, trend: false },
  title: { text: true, toggle: false },
  ring: { percent: true, label: false },
  bars: { values: true, label: false },
  quote: { text: true, track: false },
};

/** The default fill of each kind: the reference frame's colours. */
export const DEFAULT_FILL: Record<BentoKind, BentoFillRole> = { stat: "surface", title: "p1", ring: "text", bars: "p2", quote: "p3" };

const isLine = (v: unknown, max: number) => typeof v === "string" && v.trim() !== "" && v.length <= max && !/[\r\n]/.test(v);
const isNumbers = (v: unknown, min: number, max: number) => Array.isArray(v) && v.length >= min && v.length <= max && v.every((n) => typeof n === "number" && Number.isFinite(n));

function cardErrors(card: unknown, i: number): string[] {
  const at = `cards[${i}]`;
  if (typeof card !== "object" || card === null || Array.isArray(card)) return [`${at} must be an object`];
  const c = card as Record<string, unknown>;
  if (!(BENTO_KINDS as readonly unknown[]).includes(c.kind)) return [`${at}.kind must be one of ${BENTO_KINDS.join(", ")} (got ${JSON.stringify(c.kind)})`];
  const kind = c.kind as BentoKind;
  const errors: string[] = [];
  const fields = FIELDS[kind];
  for (const key of Object.keys(c)) if (key !== "kind" && key !== "fill" && !(key in fields)) errors.push(`${at}: a ${kind} card has no \`${key}\` (it takes ${Object.keys(fields).join(", ")}, fill)`);
  for (const [key, required] of Object.entries(fields)) if (required && c[key] === undefined) errors.push(`${at}: a ${kind} card needs \`${key}\``);
  if (c.fill !== undefined && !(BENTO_FILLS as readonly unknown[]).includes(c.fill)) errors.push(`${at}.fill must be one of ${BENTO_FILLS.join(", ")} (got ${JSON.stringify(c.fill)})`);
  if (c.value !== undefined && !isLine(c.value, VALUE_MAX)) errors.push(`${at}.value must be 1-${VALUE_MAX} characters, like "+212%"`);
  if (c.label !== undefined && !isLine(c.label, LABEL_MAX)) errors.push(`${at}.label must be one line of 1-${LABEL_MAX} characters`);
  if (c.trend !== undefined && !isNumbers(c.trend, 2, 12)) errors.push(`${at}.trend must be 2-12 numbers`);
  if (c.text !== undefined && !isLine(c.text, kind === "quote" ? QUOTE_MAX : TITLE_MAX)) errors.push(`${at}.text must be one line of 1-${kind === "quote" ? QUOTE_MAX : TITLE_MAX} characters`);
  if (c.toggle !== undefined && typeof c.toggle !== "boolean") errors.push(`${at}.toggle must be true or false`);
  if (c.track !== undefined && typeof c.track !== "boolean") errors.push(`${at}.track must be true or false`);
  if (c.percent !== undefined && (typeof c.percent !== "number" || !Number.isFinite(c.percent) || c.percent < 0 || c.percent > 100)) errors.push(`${at}.percent must be a number from 0 to 100`);
  if (c.values !== undefined && (!isNumbers(c.values, 3, 6) || (c.values as number[]).some((n) => n < 0) || !(c.values as number[]).some((n) => n > 0))) {
    errors.push(`${at}.values must be 3-6 numbers, none below 0 and at least one above`);
  }
  return errors;
}

/** What is wrong with BentoGrid props; empty when they are fine. */
export function bentoGridErrors(props: Record<string, unknown>): string[] {
  const { cards } = props;
  if (!Array.isArray(cards)) return ["`cards` must be a list of 3-6 cards"];
  if (cards.length < BENTO_MIN_CARDS || cards.length > BENTO_MAX_CARDS) return [`\`cards\` must hold ${BENTO_MIN_CARDS}-${BENTO_MAX_CARDS} cards (got ${cards.length})`];
  return cards.flatMap(cardErrors);
}

// ---- Colour ----

/** Without a palette (or without that swatch), a role falls back to a theme colour and its ink. */
const FALLBACK: Record<"p1" | "p2" | "p3" | "p4", (c: Theme["colors"]) => { color: string; ink: string }> = {
  p1: (c) => ({ color: c.accent, ink: c.accentText }),
  p2: (c) => ({ color: c.surfaceAlt, ink: c.text }),
  p3: (c) => ({ color: c.text, ink: c.ground }),
  p4: (c) => ({ color: c.surface, ink: c.text }),
};

/** A fill role's colour and the ink drawn on it: a swatch's own `onPn`, the text on a surface, the ground on a text-coloured card. Always AA. */
export function bentoFill(theme: Theme, fill: BentoFillRole): { color: string; ink: string } {
  const { colors } = theme;
  let pair: { color: string; ink: string };
  if (fill === "surface") pair = { color: colors.surface, ink: colors.text };
  else if (fill === "text") pair = { color: colors.text, ink: colors.ground };
  else {
    const palette = colors.palette;
    const color = palette?.[fill];
    const ink = palette?.[`on${fill.toUpperCase()}` as "onP1"];
    pair = color !== undefined && ink !== undefined ? { color, ink } : FALLBACK[fill](colors);
  }
  return contrastRatio(pair.ink, pair.color) >= AA_CONTRAST ? pair : { color: pair.color, ink: inkOn(pair.color, colors) };
}

// ---- Templates ----

/** The area's shape picks the template family: wide (16:9), square (4:5) or tall (9:16), and the same for slots. */
export type BentoShape = "wide" | "square" | "tall";

export function bentoShape(area: Pick<Rect, "width" | "height">): BentoShape {
  const ratio = area.width / area.height;
  return ratio >= 1.5 ? "wide" : ratio <= 0.85 ? "tall" : "square";
}

/** A cell on the template's grid: column, row and spans. */
interface GridCell {
  col: number;
  row: number;
  cols: number;
  rows: number;
}
interface Template {
  cols: number;
  rows: number;
  cells: GridCell[];
}

const c = (col: number, row: number, cols = 1, rows = 1): GridCell => ({ col, row, cols, rows });

/** Every template, by family and card count. Cells are in reading order; the wide ones go to the cards that want width. */
const TEMPLATES: Record<BentoShape, Record<number, Template>> = {
  wide: {
    3: { cols: 4, rows: 2, cells: [c(0, 0, 2, 2), c(2, 0, 2), c(2, 1, 2)] },
    4: { cols: 4, rows: 2, cells: [c(0, 0, 2, 2), c(2, 0), c(3, 0), c(2, 1, 2)] },
    5: { cols: 4, rows: 2, cells: [c(0, 0, 2), c(2, 0), c(3, 0), c(0, 1), c(1, 1, 3)] },
    6: { cols: 4, rows: 2, cells: [c(0, 0, 2), c(2, 0), c(3, 0), c(0, 1), c(1, 1), c(2, 1, 2)] },
  },
  square: {
    3: { cols: 3, rows: 2, cells: [c(0, 0, 2, 2), c(2, 0), c(2, 1)] },
    4: { cols: 3, rows: 2, cells: [c(0, 0, 2), c(2, 0), c(0, 1), c(1, 1, 2)] },
    5: { cols: 3, rows: 2, cells: [c(0, 0, 2), c(2, 0), c(0, 1), c(1, 1), c(2, 1)] },
    6: { cols: 3, rows: 3, cells: [c(0, 0, 2), c(2, 0, 1, 2), c(0, 1), c(1, 1), c(0, 2), c(1, 2, 2)] },
  },
  tall: {
    3: { cols: 2, rows: 2, cells: [c(0, 0, 2), c(0, 1), c(1, 1)] },
    4: { cols: 2, rows: 3, cells: [c(0, 0, 2), c(0, 1), c(1, 1), c(0, 2, 2)] },
    5: { cols: 2, rows: 3, cells: [c(0, 0, 2), c(0, 1), c(1, 1), c(0, 2), c(1, 2)] },
    6: { cols: 2, rows: 4, cells: [c(0, 0, 2), c(0, 1), c(1, 1), c(0, 2), c(1, 2), c(0, 3, 2)] },
  },
};

/** Which cards want the widest cells first: a sentence, then a big number, then a title. */
const WIDTH_PRIORITY: Record<BentoKind, number> = { quote: 0, stat: 1, title: 2, bars: 3, ring: 4 };

// ---- Card contents ----

/** A box inside a card, in px from the card's top left. */
export type Part = Rect;

export interface StatParts {
  kind: "stat";
  value: Part;
  valueSpec: TypeSpec;
  label: Part;
  labelSpec: TypeSpec;
  chart?: Part;
}
export interface TitleParts {
  kind: "title";
  text: Part;
  textSpec: TypeSpec;
  toggle?: Part;
}
export interface RingParts {
  kind: "ring";
  ring: Part;
  number: Part;
  numberSpec: TypeSpec;
  label?: Part;
  labelSpec: TypeSpec;
}
export interface BarsParts {
  kind: "bars";
  bars: Part;
  label?: Part;
  labelSpec: TypeSpec;
}
export interface QuoteParts {
  kind: "quote";
  text: Part;
  textSpec: TypeSpec;
  track?: Part;
}
export type CardParts = StatParts | TitleParts | RingParts | BarsParts | QuoteParts;

export interface BentoCardLayout {
  /** The card's index in `cards`. */
  index: number;
  kind: BentoKind;
  /** The card's box, inside the grid's box. */
  cell: Rect;
  radius: number;
  /** Every box the card draws into, inside `cell` (for the checks in tests). */
  parts: Part[];
  content: CardParts;
}

export interface BentoGridLayout {
  /** The grid's box, in frame px. */
  box: Rect;
  shape: BentoShape;
  gap: number;
  /** In cascade (reading) order. */
  cards: BentoCardLayout[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Average glyph widths in em: the heavy display numerals, the italic serif, the labels' sans. */
const NUMERAL_EM = 0.62;
/** Narrower and wider marks among the numerals, in em. */
const NUMERAL_MARK_EM: Record<string, number> = { ",": 0.3, ".": 0.3, ":": 0.3, " ": 0.3, "%": 0.88, "+": 0.62 };
const SERIF_EM = 0.45;
const LABEL_EM = 0.48;

/** The narrowest keyframe track drawn beside a sentence. */
const TRACK_MIN_PX = 300;

const STAT_STEPS: TypeRole[] = ["numeral", "hero", "display", "headline", "title", "subtitle", "body"];
const TITLE_STEPS: TypeRole[] = ["display", "headline", "title", "subtitle", "body", "label"];
const RING_STEPS: TypeRole[] = ["display", "headline", "title", "subtitle", "body", "label"];
const QUOTE_STEPS: TypeRole[] = ["headline", "title", "subtitle", "body", "label"];

/** The width of a number set in heavy display numerals in `spec`. */
const numeralWidth = (text: string, spec: TypeSpec) => Math.ceil([...text].reduce((sum, ch) => sum + (NUMERAL_MARK_EM[ch] ?? NUMERAL_EM) + spec.tracking, 0) * spec.size);
/** The height of one line in `spec`, glyph room included. */
const lineHeight = (spec: TypeSpec) => textBoxHeight("x", 1e6, spec);
/** The first step, largest first, that passes `fits`; else the smallest. */
function pickStep(theme: Theme, aspect: Aspect, steps: TypeRole[], fits: (spec: TypeSpec) => boolean): TypeSpec {
  for (const role of steps) {
    const spec = typeSpec(theme, role, aspect);
    if (fits(spec)) return spec;
  }
  return typeSpec(theme, steps.at(-1)!, aspect);
}

/** The card's padding: roomier on a big card. */
function cardPadding(theme: Theme, cell: Rect): number {
  const short = Math.min(cell.width, cell.height);
  return short >= 400 ? theme.spacing.lg : short >= 260 ? theme.spacing.md : theme.spacing.sm;
}

function statParts(theme: Theme, aspect: Aspect, card: BentoStat, inner: Rect, withChart = card.trend !== undefined): StatParts {
  const gap = theme.spacing.xs;
  const labelSpec = typeSpec(theme, "label", aspect);
  const chartSide = withChart && inner.width / inner.height >= 1.6;
  const textWidth = chartSide ? r2(inner.width * 0.6) : inner.width;
  const labelH = textBoxHeight(card.label, textWidth, labelSpec, LABEL_EM);
  const chartMin = withChart && !chartSide ? theme.spacing.xl + gap : 0;
  const valueSpec = pickStep(theme, aspect, STAT_STEPS, (spec) => numeralWidth(card.value, spec) <= textWidth && lineHeight(spec) + gap + labelH + chartMin <= inner.height);
  // A small number is worse than no chart: under the chart, the number keeps at least the title step.
  if (chartMin > 0 && valueSpec.size < typeSpec(theme, "title", aspect).size) return statParts(theme, aspect, card, inner, false);
  const valueH = lineHeight(valueSpec);
  const value = { x: inner.x, y: inner.y, width: textWidth, height: valueH };
  // Without a chart under it, the label sits at the foot of the card.
  const labelY = withChart ? inner.y + valueH + gap : inner.y + inner.height - labelH;
  const label = { x: inner.x, y: r2(labelY), width: textWidth, height: labelH };
  let chart: Part | undefined;
  if (withChart) {
    if (chartSide) {
      const width = r2(inner.width - textWidth - theme.spacing.md);
      const height = r2(Math.min(inner.height, width * 0.6));
      chart = { x: r2(inner.x + inner.width - width), y: r2(inner.y + inner.height - height), width, height };
    } else {
      const top = label.y + labelH + gap;
      const height = r2(Math.min(inner.y + inner.height - top, inner.height * 0.45));
      if (height >= theme.spacing.lg) chart = { x: inner.x, y: r2(inner.y + inner.height - height), width: inner.width, height };
    }
  }
  return { kind: "stat", value, valueSpec, label, labelSpec, ...(chart && { chart }) };
}

function titleParts(theme: Theme, aspect: Aspect, card: BentoTitle, inner: Rect): TitleParts {
  const gap = theme.spacing.xs;
  const toggleH = card.toggle === true ? Math.round(Math.max(40, Math.min(72, inner.height * 0.22, inner.width * 0.18))) : 0;
  const room = inner.height - (toggleH > 0 ? toggleH + gap : 0);
  const textSpec = pickStep(theme, aspect, TITLE_STEPS, (spec) => estimateLines(card.text, inner.width, spec.size) <= 3 && textBoxHeight(card.text, inner.width, spec) <= room);
  const text = { x: inner.x, y: inner.y, width: inner.width, height: Math.min(room, textBoxHeight(card.text, inner.width, textSpec)) };
  const toggle = toggleH > 0 ? { x: inner.x, y: inner.y + inner.height - toggleH, width: Math.round(toggleH * 1.8), height: toggleH } : undefined;
  return { kind: "title", text, textSpec, ...(toggle && { toggle }) };
}

function ringParts(theme: Theme, aspect: Aspect, card: BentoRing, inner: Rect): RingParts {
  const gap = theme.spacing.xs;
  const labelSpec = typeSpec(theme, "label", aspect);
  // A labelled ring on a wide card sits to the right of its label; otherwise it is centred over it.
  const side = card.label !== undefined && inner.width / inner.height >= 1.4;
  let ring: Part;
  let label: Part | undefined;
  if (side) {
    const d = r2(Math.min(inner.height, inner.width * 0.55));
    ring = { x: r2(inner.x + inner.width - d), y: r2(inner.y + (inner.height - d) / 2), width: d, height: d };
    if (card.label !== undefined) {
      const width = r2(inner.width - d - gap);
      const height = textBoxHeight(card.label, width, labelSpec, LABEL_EM);
      label = { x: inner.x, y: r2(inner.y + inner.height - height), width, height };
    }
  } else {
    const labelH = card.label === undefined ? 0 : textBoxHeight(card.label, inner.width, labelSpec, LABEL_EM);
    const d = r2(Math.min(inner.width, inner.height - (labelH > 0 ? labelH + gap : 0)));
    ring = { x: r2(inner.x + (inner.width - d) / 2), y: labelH > 0 ? inner.y : r2(inner.y + (inner.height - d) / 2), width: d, height: d };
    if (card.label !== undefined) label = { x: inner.x, y: r2(inner.y + inner.height - labelH), width: inner.width, height: labelH };
  }
  const text = `${card.percent}%`;
  const hole = ring.width * 0.64;
  const numberSpec = pickStep(theme, aspect, RING_STEPS, (spec) => numeralWidth(text, spec) <= hole && lineHeight(spec) <= hole);
  const nh = Math.min(hole, lineHeight(numberSpec));
  const number = { x: r2(ring.x + (ring.width - hole) / 2), y: r2(ring.y + (ring.height - nh) / 2), width: r2(hole), height: r2(nh) };
  return { kind: "ring", ring, number, numberSpec, labelSpec, ...(label && { label }) };
}

function barsParts(theme: Theme, aspect: Aspect, card: BentoBars, inner: Rect): BarsParts {
  const gap = theme.spacing.xs;
  const labelSpec = typeSpec(theme, "label", aspect);
  const labelH = card.label === undefined ? 0 : textBoxHeight(card.label, inner.width, labelSpec, LABEL_EM);
  const label = card.label === undefined ? undefined : { x: inner.x, y: inner.y, width: inner.width, height: labelH };
  const top = labelH > 0 ? inner.y + labelH + gap : inner.y;
  const bars = { x: inner.x, y: r2(top), width: inner.width, height: r2(inner.y + inner.height - top) };
  return { kind: "bars", bars, labelSpec, ...(label && { label }) };
}

function quoteParts(theme: Theme, aspect: Aspect, card: BentoQuote, inner: Rect): QuoteParts {
  const gap = theme.spacing.md;
  // Beside the sentence only where the track still gets room for its keyframes.
  const beside = card.track === true && inner.width / inner.height >= 2 && inner.width * 0.36 >= TRACK_MIN_PX;
  const trackW = beside ? r2(Math.max(160, inner.width * 0.36)) : inner.width;
  const trackH = card.track === true ? (beside ? r2(Math.min(inner.height, trackW * 0.45)) : Math.round(Math.max(48, Math.min(96, inner.height * 0.25)))) : 0;
  const textW = beside ? r2(inner.width - trackW - gap) : inner.width;
  const room = beside || trackH === 0 ? inner.height : inner.height - trackH - theme.spacing.xs;
  const fits = (spec: TypeSpec) => estimateLines(card.text, textW, spec.size, SERIF_EM) <= 4 && textBoxHeight(card.text, textW, spec, SERIF_EM) <= room;
  const textSpec = pickStep(theme, aspect, QUOTE_STEPS, fits);
  const textH = Math.min(room, textBoxHeight(card.text, textW, textSpec, SERIF_EM));
  // Centred in the card, or above the track under it.
  const text = { x: inner.x, y: beside || trackH === 0 ? r2(inner.y + (inner.height - textH) / 2) : inner.y, width: textW, height: textH };
  let track: Part | undefined;
  if (card.track === true) {
    track = beside
      ? { x: r2(inner.x + inner.width - trackW), y: r2(inner.y + (inner.height - trackH) / 2), width: trackW, height: trackH }
      : { x: inner.x, y: r2(inner.y + inner.height - trackH), width: inner.width, height: trackH };
  }
  return { kind: "quote", text, textSpec, ...(track && { track }) };
}

function cardContent(theme: Theme, aspect: Aspect, card: BentoCard, inner: Rect): CardParts {
  switch (card.kind) {
    case "stat":
      return statParts(theme, aspect, card, inner);
    case "title":
      return titleParts(theme, aspect, card, inner);
    case "ring":
      return ringParts(theme, aspect, card, inner);
    case "bars":
      return barsParts(theme, aspect, card, inner);
    case "quote":
      return quoteParts(theme, aspect, card, inner);
  }
}

function partsOf(content: CardParts): Part[] {
  const { kind: _, ...rest } = content;
  return Object.entries(rest)
    .filter(([key, v]) => !key.endsWith("Spec") && v !== undefined)
    .map(([, v]) => v as Part);
}

/**
 * The grid: in the slot, or as a scene's main block in the text column (in
 * 9:16 it keeps clear of the button rail); a template by card count and the
 * area's shape; the widest cells to the cards that want width (a quote, then
 * a stat, then a title); each card's content sized from the ramp to fit.
 */
export function bentoGridLayout(theme: Theme, aspect: Aspect, cards: BentoCard[], slot?: Rect): BentoGridLayout {
  const box = slot ?? textColumn(theme, aspect);
  const shape = bentoShape(box);
  const template = TEMPLATES[shape][cards.length];
  if (template === undefined) throw new Error(`BentoGrid: no layout for ${cards.length} cards`);
  const gap = theme.spacing.sm;
  const colW = (box.width - (template.cols - 1) * gap) / template.cols;
  const rowH = (box.height - (template.rows - 1) * gap) / template.rows;
  const cells = template.cells.map((g) => ({
    x: r2(g.col * (colW + gap)),
    y: r2(g.row * (rowH + gap)),
    width: r2(g.cols * colW + (g.cols - 1) * gap),
    height: r2(g.rows * rowH + (g.rows - 1) * gap),
  }));
  // Widest cells first (reading order on ties), to cards by how much they want width (their order on ties).
  const byArea = cells.map((_, i) => i).sort((a, b) => cells[b]!.width * cells[b]!.height - cells[a]!.width * cells[a]!.height || cells[b]!.width - cells[a]!.width || a - b);
  const byWant = cards.map((_, i) => i).sort((a, b) => WIDTH_PRIORITY[cards[a]!.kind] - WIDTH_PRIORITY[cards[b]!.kind] || a - b);
  const cardAt = new Map(byArea.map((cell, k) => [cell, byWant[k]!]));
  return {
    box,
    shape,
    gap,
    cards: cells.map((cell, i) => {
      const index = cardAt.get(i)!;
      const card = cards[index]!;
      const pad = cardPadding(theme, cell);
      const inner = { x: pad, y: pad, width: cell.width - 2 * pad, height: cell.height - 2 * pad };
      const content = cardContent(theme, aspect, card, inner);
      const radius = Math.min(cell.width, cell.height) >= 260 ? theme.radius.lg : theme.radius.md;
      return { index, kind: card.kind, cell, radius, parts: partsOf(content), content };
    }),
  };
}

// ---- Timing ----

/** Cards arrive this far apart. */
export const CASCADE_STEP_MS = 70;
/** A card's own motion starts this long after it starts to arrive: as it lands. */
const LAND_MS = 300;
/** Everything inside the cards is done by this scene ms. */
export const SETTLED_MS = 1500;

export interface BentoTiming {
  /** When each card (in cascade order) starts to arrive. */
  starts: number[];
  /** When its own motion (count, ring, bars, toggle, keyframes) starts. */
  inner: number[];
  /** How long that motion lasts: the count token, shortened to end by `SETTLED_MS`. */
  innerMs: number[];
}

export function bentoTiming(theme: Theme, count: number): BentoTiming {
  const starts = Array.from({ length: count }, (_, i) => theme.motion.leadMs + i * CASCADE_STEP_MS);
  const inner = starts.map((s) => s + LAND_MS);
  const innerMs = inner.map((s) => Math.min(theme.motion.count.ms, SETTLED_MS - s));
  return { starts, inner, innerMs };
}
