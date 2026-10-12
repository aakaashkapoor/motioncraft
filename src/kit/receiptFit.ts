// Where the Receipt's card goes and the sizes it is set in, tilt included
// (design v3, section C, "fill the frame"). In 9:16 the card spans the primary
// width with slim side margins, so its rows can take the body step; in every
// aspect the card is sized and placed so its ROTATED bounding box stays inside
// its slot (the content area by default). Pure.

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea } from "../layout/caption";
import { isTall, type Rect, type Size } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { maxCardWidth } from "./Card";
import { formatChartValue } from "./chart";
import { fitsOneLine, receiptLines, rowLabelWidth, type ReceiptData } from "./receiptPlan";

export interface ReceiptFit {
  /** The card, paper and torn edges, in frame px, before the tilt. */
  box: Rect;
  /** Item, summary and title rows. */
  row: TypeSpec;
  /** An item's note. */
  note: TypeSpec;
  /** The total row: bold and larger. */
  total: TypeSpec;
  /** True when even the smallest step did not fit and the text was shrunk below the ramp to fit. */
  shrunk: boolean;
  /** The paper's padding left and right of the text. */
  padX: number;
  /** The paper's padding above and below the text. */
  padY: number;
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

/** The size of the axis-aligned box a `size` rect covers once turned `deg` degrees. */
export function turnedSize(size: Size, deg: number): Size {
  const rad = (Math.abs(deg) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { width: size.width * cos + size.height * sin, height: size.height * cos + size.width * sin };
}

/** The tallest card `width` wide whose turned box fits `height`. */
const tallestFor = (width: number, height: number, deg: number) => {
  const rad = (Math.abs(deg) * Math.PI) / 180;
  return (height - width * Math.sin(rad)) / Math.cos(rad);
};

/**
 * The card for `data` inside `slot` (the content area by default), tilted
 * `tilt` degrees: the largest step whose card, turned, fits the slot with
 * every label whole (failing that, the largest that fits); a long receipt in
 * a short slot tightens its padding, then shrinks below the ramp. The turned
 * card is centered on the block's center line and kept inside the slot.
 */
export function receiptFit(
  theme: Theme,
  aspect: Aspect,
  data: Pick<ReceiptData, "title" | "items" | "summary" | "total" | "prefix" | "suffix" | "decimals">,
  slot: Rect | undefined,
  tilt: number,
): ReceiptFit {
  const area = slot ?? contentArea(theme, aspect);
  const { spacing, weights } = theme;
  const tall = isTall(aspect);
  // 9:16: slim sides so the body step fits the primary width; 16:9 as it always was.
  const padX = tall ? spacing.sm : spacing.md;
  const roomyY = tall ? spacing.lg : spacing.md;
  const tooth = spacing.xs;
  const divider = spacing.sm;
  const lines = receiptLines(data);
  const lineHeight = (spec: TypeSpec) => spec.size * spec.lineHeight;
  const format = { prefix: data.prefix ?? "$", suffix: data.suffix ?? "", decimals: data.decimals ?? 2 };

  const layoutAt = (width: number) => {
    const inner = width - 2 * padX;
    const maxHeight = tallestFor(width, area.height, tilt);
    /** Every line's label fits beside its amount (see `rowLabelWidth`), and the title on its own. */
    const widthFits = ({ row, total }: { row: TypeSpec; total: TypeSpec }) =>
      lines.every((line) => {
        if (line.kind === "divider") return true;
        if (line.kind === "title") return fitsOneLine(line.label, inner, row);
        const spec = line.kind === "total" ? total : row;
        return fitsOneLine(line.label, rowLabelWidth(theme, inner, formatChartValue(line.amount, format), spec), spec);
      });
    const sized = (step: (typeof STEPS)[number], padY: number, scale = 1) => {
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
      return { row, note, total, padY, shrunk: scale < 1, height: Math.ceil(2 * tooth + 2 * padY + body + air) };
    };
    const fitting = (padY: number) => STEPS.map((step) => sized(step, padY)).filter((step) => step.height <= maxHeight);
    // Roomy padding first; a long receipt in a short slot tightens it before giving up a step's size.
    const steps = fitting(roomyY).length > 0 ? fitting(roomyY) : fitting(padX);
    let fit = steps.find(widthFits) ?? steps[0];
    if (fit === undefined) {
      // The text's share of the height grows with its size; the edges, padding and dividers do not (1 px for rounding).
      const smallest = STEPS.at(-1)!;
      const fixed = sized(smallest, padX, 0).height;
      const scale = Math.max(MIN_SHRINK, Math.min(1, (maxHeight - 1 - fixed) / (sized(smallest, padX).height - fixed)));
      fit = sized(smallest, padX, Math.floor(scale * 1000) / 1000);
    }
    return fit;
  };

  let width = tall ? maxCardWidth(theme, aspect, area) : Math.min(area.width, WIDE_MAX_WIDTH);
  let fit = layoutAt(width);
  // A tilted card is wider than itself: narrow it until its turned box fits the slot's width.
  const turnedWidth = () => turnedSize({ width, height: fit.height }, tilt).width;
  if (turnedWidth() > area.width) {
    const rad = (Math.abs(tilt) * Math.PI) / 180;
    width = Math.floor((area.width - fit.height * Math.sin(rad)) / Math.cos(rad));
    fit = layoutAt(width);
  }
  const turned = turnedSize({ width, height: fit.height }, tilt);
  const bounds = placeBlock(area, turned, blockCenterY(theme, aspect, slot));
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const box = { x: cx - width / 2, y: cy - fit.height / 2, width, height: fit.height };
  return { box, row: fit.row, note: fit.note, total: fit.total, shrunk: fit.shrunk, padX, padY: fit.padY, tooth, divider };
}
