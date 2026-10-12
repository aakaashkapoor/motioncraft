// The end card's call to action: a pill button line ("Download free · iOS &
// Android") on the accent, and a small muted note under it ("Link in bio").
// Its prop check, its size and its timing. Pure.

import { isTall, type Rect } from "../layout/frame";
import { safeZones } from "../layout/safe";
import { textBoxHeight } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeSpec } from "../theme/types";

export interface EndCardCta {
  /** The pill's text, at most `CTA_LABEL_MAX` characters. */
  label: string;
  /** A small note under the pill. */
  note?: string;
}

/** The longest label the pill takes: longer ones no longer fit a 9:16 column at a readable size. */
export const CTA_LABEL_MAX = 32;
/** Average glyph width of the label (semibold, mixed case) in em: a little generous, like `AVG_CHAR_EM`. */
const CTA_CHAR_EM = 0.56;
/** The pill pops in this long after the last line lands. */
export const CTA_AFTER_LINE_MS = 250;
/** The note fades in this long after the pill starts. */
export const CTA_NOTE_DELAY_MS = 150;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Problems with a `cta` prop; empty if fine. */
export function ctaErrors(cta: unknown): string[] {
  if (cta === undefined) return [];
  if (!isObject(cta)) return ["cta must be { label, note? }"];
  const errors: string[] = [];
  const { label, note } = cta;
  if (typeof label !== "string" || label.trim() === "") errors.push("cta.label must be a non-empty string");
  else if ([...label].length > CTA_LABEL_MAX) errors.push(`cta.label must be at most ${CTA_LABEL_MAX} characters (got ${[...label].length}): "${label}"`);
  if (note !== undefined && typeof note !== "string") errors.push("cta.note must be a string");
  return errors;
}

export interface CtaSize {
  /** The pill's size; its corners are round (radius half its height). */
  pill: { width: number; height: number };
  /** The label's type: the body step, semibold, or the label step if body is too wide; smaller still if `fitted`. */
  spec: TypeSpec;
  /** Whether the label was shrunk below the ramp to fit. */
  fitted: boolean;
  /** The note's type: the label step. */
  noteSpec: TypeSpec;
  /** The note's box: as wide as the pill may be, as tall as its text, 0 without one. */
  noteWidth: number;
  noteHeight: number;
  /** Pill, gap and note together. */
  height: number;
}

/**
 * The widest the pill may be in a column `columnWidth` wide: the column, and in
 * 9:16 no wider than the primary visual; narrower by its pop, so it stays in
 * the column even at the top of the pop.
 */
export function ctaMaxWidth(theme: Theme, aspect: Aspect, columnWidth: number): number {
  const width = isTall(aspect) ? Math.min(columnWidth, safeZones(aspect, theme.safe).primaryWidth) : columnWidth;
  return Math.floor(width / theme.motion.pop.scale);
}

/** The pill's and the note's size in a column `columnWidth` wide. */
export function ctaSize(theme: Theme, aspect: Aspect, cta: EndCardCta, columnWidth: number): CtaSize {
  const { spacing, type, weights } = theme;
  const maxWidth = ctaMaxWidth(theme, aspect, columnWidth);
  const padX = spacing.md;
  const padY = spacing.xs;
  const chars = [...cta.label].length;
  const textWidth = (size: number) => Math.ceil(chars * size * CTA_CHAR_EM);
  const steps = [type.body[aspect], type.label[aspect]].map((spec) => ({ ...spec, weight: weights.semibold }));
  const fits = steps.find((spec) => textWidth(spec.size) + 2 * padX <= maxWidth);
  const smallest = steps.at(-1)!;
  const spec = fits ?? { ...smallest, size: Math.floor((maxWidth - 2 * padX) / (chars * CTA_CHAR_EM)) };
  const pill = { width: Math.min(maxWidth, textWidth(spec.size) + 2 * padX), height: 2 * Math.ceil((spec.size * spec.lineHeight) / 2) + 2 * padY };
  const noteSpec = type.label[aspect];
  const noteHeight = textBoxHeight(cta.note, maxWidth, noteSpec);
  const height = pill.height + (cta.note === undefined ? 0 : spacing.xs + noteHeight);
  return { pill, spec, fitted: fits === undefined, noteSpec, noteWidth: maxWidth, noteHeight, height };
}

/** When the pill pops in and the note fades in: `lineLandsMs` is when the last line above has landed. */
export function ctaTiming(lineLandsMs: number): { cta: number; note: number } {
  const cta = lineLandsMs + CTA_AFTER_LINE_MS;
  return { cta, note: cta + CTA_NOTE_DELAY_MS };
}

/** The pill and the note placed centered on `mid` from `top` down. */
export function placeCta(size: CtaSize, mid: number, top: number, spacing: Theme["spacing"]): { pill: Rect; note?: Rect } {
  const pill = { x: mid - size.pill.width / 2, y: top, width: size.pill.width, height: size.pill.height };
  if (size.noteHeight === 0) return { pill };
  return { pill, note: { x: mid - size.noteWidth / 2, y: top + pill.height + spacing.xs, width: size.noteWidth, height: size.noteHeight } };
}
