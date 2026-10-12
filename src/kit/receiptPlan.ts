// The Receipt's vocabulary: its props, their validation, the lines it prints
// in order, when each prints, and where the card goes. Pure.

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea } from "../layout/caption";
import { isTall, type Rect } from "../layout/frame";
import { AVG_CHAR_EM } from "../layout/textFit";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { maxCardWidth } from "./Card";
import { formatChartValue, type ChartValueFormat } from "./chart";

export interface ReceiptItem {
  label: string;
  amount: number;
  /** A small line under the label, e.g. "no croutons". */
  note?: string;
}

export interface ReceiptRow {
  label: string;
  amount: number;
}

/** What a receipt shows; `ReceiptProps` adds the kit's props. */
export interface ReceiptData extends ChartValueFormat {
  /** The merchant line at the top, centered. */
  title?: string;
  /** 1-12 items. */
  items: ReceiptItem[];
  /** 0-4 rows between the items and the total, e.g. Subtotal, Tax, Tip. */
  summary?: ReceiptRow[];
  /** The bold total; its label defaults to "Total". */
  total: { label?: string; amount: number };
  /** Degrees the card leans, -4..4. Default -2. */
  tilt?: number;
  /** The index of an item drawn with the accent marker band. */
  highlight?: number;
}

export const RECEIPT_MAX_ITEMS = 12;
export const RECEIPT_MAX_SUMMARY = 4;
export const RECEIPT_MAX_TILT = 4;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isAmount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;

function rowErrors(rows: unknown[], path: string, note: boolean): string[] {
  return rows.flatMap((raw, i) => {
    const row = isObject(raw) ? raw : {};
    const errors: string[] = [];
    if (typeof row.label !== "string" || row.label.trim() === "") errors.push(`${path}[${i}].label must be a non-empty string`);
    if (!isAmount(row.amount)) errors.push(`${path}[${i}].amount must be a finite number >= 0`);
    if (note && row.note !== undefined && typeof row.note !== "string") errors.push(`${path}[${i}].note must be a string`);
    return errors;
  });
}

/** Problems with a Receipt's props; `[]` when they are fine. */
export function receiptErrors(props: Record<string, unknown>): string[] {
  const { title, items, summary, total, tilt, highlight, prefix, suffix, decimals } = props;
  const errors: string[] = [];
  if (title !== undefined && typeof title !== "string") errors.push("title must be a string");
  if (!Array.isArray(items) || items.length < 1 || items.length > RECEIPT_MAX_ITEMS) {
    errors.push(`items must have 1-${RECEIPT_MAX_ITEMS} items, got ${Array.isArray(items) ? items.length : typeof items}`);
  }
  if (Array.isArray(items)) errors.push(...rowErrors(items, "items", true));
  if (summary !== undefined) {
    if (!Array.isArray(summary) || summary.length > RECEIPT_MAX_SUMMARY) {
      errors.push(`summary must have 0-${RECEIPT_MAX_SUMMARY} rows, got ${Array.isArray(summary) ? summary.length : typeof summary}`);
    }
    if (Array.isArray(summary)) errors.push(...rowErrors(summary, "summary", false));
  }
  if (!isObject(total)) errors.push("total must be { label?, amount }");
  else {
    if (!isAmount(total.amount)) errors.push("total.amount must be a finite number >= 0");
    if (total.label !== undefined && (typeof total.label !== "string" || total.label.trim() === "")) errors.push("total.label must be a non-empty string");
  }
  if (tilt !== undefined && (typeof tilt !== "number" || !(Math.abs(tilt) <= RECEIPT_MAX_TILT))) {
    errors.push(`tilt must be a number of degrees from -${RECEIPT_MAX_TILT} to ${RECEIPT_MAX_TILT}, got ${JSON.stringify(tilt)}`);
  }
  const count = Array.isArray(items) ? items.length : 0;
  if (highlight !== undefined && (typeof highlight !== "number" || !Number.isInteger(highlight) || highlight < 0 || highlight >= count)) {
    errors.push(`highlight must be an item index from 0 to ${count - 1}, got ${JSON.stringify(highlight)}`);
  }
  if (prefix !== undefined && typeof prefix !== "string") errors.push("prefix must be a string");
  if (suffix !== undefined && typeof suffix !== "string") errors.push("suffix must be a string");
  if (decimals !== undefined && (typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0 || decimals > 4)) {
    errors.push(`decimals must be a whole number from 0 to 4, got ${JSON.stringify(decimals)}`);
  }
  return errors;
}

/** One printed line of the receipt, top to bottom. */
export type ReceiptLine =
  | { kind: "title"; label: string }
  | { kind: "item"; label: string; amount: number; note?: string; index: number }
  | { kind: "divider" }
  | { kind: "summary"; label: string; amount: number }
  | { kind: "total"; label: string; amount: number };

/** The lines in print order: the title, the items, a divider, the summary, a divider and the total. */
export function receiptLines({ title, items, summary = [], total }: Pick<ReceiptData, "title" | "items" | "summary" | "total">): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  if (title !== undefined && title.trim() !== "") lines.push({ kind: "title", label: title });
  items.forEach((item, index) => lines.push({ kind: "item", label: item.label, amount: item.amount, ...(item.note === undefined ? {} : { note: item.note }), index }));
  if (summary.length > 0) {
    lines.push({ kind: "divider" });
    for (const row of summary) lines.push({ kind: "summary", label: row.label, amount: row.amount });
  }
  lines.push({ kind: "divider" });
  lines.push({ kind: "total", label: total.label ?? "Total", amount: total.amount });
  return lines;
}

/** Mono glyphs all advance about `AVG_CHAR_EM`; this much spare room absorbs a font that runs a little wide. */
const FIT_SLACK = 0.95;

/** Whether `text` set in `spec` (mono) fits on one line of `width` px. */
export function fitsOneLine(text: string, width: number, spec: TypeSpec): boolean {
  return [...text].length * AVG_CHAR_EM * spec.size <= width * FIT_SLACK;
}

/** Room for a row's label in a paper `inner` px wide: less the row's inset, the gap and its amount. */
export function rowLabelWidth(theme: Theme, inner: number, amount: string, spec: TypeSpec): number {
  const { xxs, sm } = theme.spacing;
  return inner - 2 * xxs - sm - [...amount].length * AVG_CHAR_EM * spec.size;
}

/** When the card and each line arrive, in scene ms. */
export interface ReceiptTiming {
  /** The card starts to arrive (on `enter`). */
  card: number;
  /** Each line starts to feed out, top to bottom. */
  lines: number[];
  /** The total starts to feed out. */
  total: number;
  /** The total is out and pops. */
  landed: number;
  /** Everything has landed: the total's pop is over. */
  settled: number;
}

/** Lines start feeding once the card is this far into its arrival, in ms. */
const PRINT_LEAD_MS = 200;
/** The last pop is over by about this long into the scene, so a long receipt prints tighter. */
const PRINT_DONE_MS = 2200;

/** A line takes `fx` to feed out (a clip from the top), then the total pops on `pop`. */
export function receiptTiming(theme: Theme, lineCount: number): ReceiptTiming {
  const { leadMs, enter, fx, pop } = theme.motion;
  const first = leadMs + PRINT_LEAD_MS;
  const room = Math.max(0, PRINT_DONE_MS - first - fx.ms - pop.ms);
  const step = lineCount <= 1 ? 0 : Math.min(enter.staggerMs, room / (lineCount - 1));
  const lines = Array.from({ length: Math.max(1, lineCount) }, (_, i) => Math.round(first + i * step));
  const total = lines.at(-1)!;
  return { card: leadMs, lines, total, landed: total + fx.ms, settled: Math.max(leadMs + enter.ms, total + fx.ms + pop.ms) };
}

export interface ReceiptLayout {
  /** The card, paper and torn edges, in frame px (before the tilt). */
  box: Rect;
  /** Item, summary and title rows. */
  row: TypeSpec;
  /** An item's note. */
  note: TypeSpec;
  /** The total row: bold and larger. */
  total: TypeSpec;
  /** True when even the smallest step did not fit and the text was shrunk below the ramp to fit. */
  shrunk: boolean;
  padding: number;
  /** Height of one torn edge's teeth. */
  tooth: number;
  /** Height of a divider line, with its room above and below. */
  divider: number;
}

/** In 16:9 the card is at most this wide. */
const WIDE_MAX_WIDTH = 720;
/** Receipt lines sit close, like a till's: tighter than code's mono. */
const ROW_LINE_HEIGHT = 1.3;
/** A long receipt in a short slot shrinks its smallest step at most this far. */
const MIN_SHRINK = 0.7;

/** Sizes to try, largest first (the ramp step each line takes), stepping down until the card fits its slot. */
const STEPS: ReadonlyArray<{ row: TypeRole; total: TypeRole; note: TypeRole }> = [
  { row: "body", total: "subtitle", note: "label" },
  { row: "mono", total: "body", note: "eyebrow" },
  { row: "eyebrow", total: "label", note: "eyebrow" },
];

const monoAt = (theme: Theme, aspect: Aspect, role: TypeRole, scale: number): TypeSpec => ({
  ...theme.type.mono[aspect],
  size: Math.round(theme.type[role][aspect].size * scale * 10) / 10,
  lineHeight: ROW_LINE_HEIGHT,
});

/** Where the card goes inside `slot` (the content area by default) and the sizes it is set in. */
export function receiptLayout(
  theme: Theme,
  aspect: Aspect,
  data: Pick<ReceiptData, "title" | "items" | "summary" | "total" | "prefix" | "suffix" | "decimals">,
  slot?: Rect,
): ReceiptLayout {
  const area = slot ?? contentArea(theme, aspect);
  const { spacing, weights } = theme;
  const width = !isTall(aspect) ? Math.min(area.width, WIDE_MAX_WIDTH) : maxCardWidth(theme, aspect, area);
  const padding = isTall(aspect) ? spacing.lg : spacing.md;
  const tooth = spacing.xs;
  const divider = spacing.sm;
  const lines = receiptLines(data);
  const lineHeight = (spec: TypeSpec) => spec.size * spec.lineHeight;
  const format = { prefix: data.prefix ?? "$", suffix: data.suffix ?? "", decimals: data.decimals ?? 2 };
  const inner = width - 2 * padding;
  /** Every line's label fits beside its amount (see `rowLabelWidth`), and the title on its own. */
  const widthFits = ({ row, total }: { row: TypeSpec; total: TypeSpec }) =>
    lines.every((line) => {
      if (line.kind === "divider") return true;
      if (line.kind === "title") return fitsOneLine(line.label, inner, row);
      const spec = line.kind === "total" ? total : row;
      return fitsOneLine(line.label, rowLabelWidth(theme, inner, formatChartValue(line.amount, format), spec), spec);
    });
  const sized = (step: (typeof STEPS)[number], scale = 1) => {
    const row = monoAt(theme, aspect, step.row, scale);
    const total = { ...monoAt(theme, aspect, step.total, scale), weight: weights.bold };
    const note = { ...monoAt(theme, aspect, step.note, scale), weight: weights.regular };
    const body = lines.reduce((sum, line) => {
      if (line.kind === "divider") return sum + divider;
      if (line.kind === "total") return sum + lineHeight(total);
      if (line.kind === "item" && line.note !== undefined) return sum + lineHeight(row) + lineHeight(note);
      return sum + lineHeight(row);
    }, 0);
    // The title gets a little air below it.
    const air = lines[0]?.kind === "title" ? spacing.xs : 0;
    return { row, note, total, shrunk: scale < 1, height: Math.ceil(2 * tooth + 2 * padding + body + air) };
  };
  const steps = STEPS.map((step) => sized(step)).filter((step) => step.height <= area.height);
  // The largest step that fits the slot with every label whole; failing that, the largest that fits (long labels ellipsize).
  let fit = steps.find(widthFits) ?? steps[0];
  if (fit === undefined) {
    // The text's share of the height grows with its size; the edges, padding and dividers do not (1 px for rounding).
    const smallest = STEPS.at(-1)!;
    const fixed = sized(smallest, 0).height;
    const scale = Math.max(MIN_SHRINK, Math.min(1, (area.height - 1 - fixed) / (sized(smallest).height - fixed)));
    fit = sized(smallest, Math.floor(scale * 1000) / 1000);
  }
  const box = placeBlock(area, { width, height: fit.height }, blockCenterY(theme, aspect, slot));
  return { box, row: fit.row, note: fit.note, total: fit.total, shrunk: fit.shrunk, padding, tooth, divider };
}
