// Reading the type ramp: a step's spec, its size, the sizes on the ramp, the
// CSS for a spec, and the box text set in a spec needs. The ramp lives in the
// theme (`theme.type`); sizes are already set per aspect there, so nothing
// here scales them.

import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { TYPE_ROLES } from "../theme/types";
import type { Aspect } from "./frame";
import { estimateTextHeight } from "./textFit";

/**
 * Marks text that a component shrank below its ramp step on purpose, to fit
 * its box (a terminal's or a code window's mono). The type-scale check allows
 * any size inside it.
 */
export const TYPE_FIT_ATTRIBUTE = "data-type-fit";

/**
 * Marks an element whose text is split into pieces for motion (a word drawn
 * one element per character). The checks measure it as one text, as faint as
 * its faintest piece, and skip the pieces.
 */
export const TEXT_PIECES_ATTRIBUTE = "data-text-pieces";

/** A step of the theme's ramp at an aspect. */
export function typeSpec(theme: Theme, role: TypeRole, aspect: Aspect): TypeSpec {
  return theme.type[role][aspect];
}

/** A step's font size in px at an aspect. */
export function fontSize(theme: Theme, role: TypeRole, aspect: Aspect): number {
  return theme.type[role][aspect].size;
}

/** Every step of the ramp at an aspect, largest first, mono last. */
export function rampSteps(theme: Theme, aspect: Aspect): Array<{ role: TypeRole; size: number }> {
  return TYPE_ROLES.map((role) => ({ role, size: theme.type[role][aspect].size }));
}

/** The distinct font sizes on the ramp at an aspect, largest first. */
export function rampSizes(theme: Theme, aspect: Aspect): number[] {
  return [...new Set(rampSteps(theme, aspect).map((step) => step.size))];
}

export interface TypeCss {
  fontSize: number;
  fontWeight: number;
  letterSpacing: string;
  lineHeight: number;
}

/** The CSS for a ramp spec: size, weight, tracking and line height. */
export function typeCss(spec: TypeSpec): TypeCss {
  return { fontSize: spec.size, fontWeight: spec.weight, letterSpacing: `${spec.tracking}em`, lineHeight: spec.lineHeight };
}

/** Height of a glyph box in em. A tighter line height is shorter, so glyphs poke out of the line box. */
const GLYPH_BOX_EM = 1.4;

/** Room in px kept above and below tightly set text so its glyphs stay inside its box. */
export function glyphPad(spec: TypeSpec): number {
  return Math.ceil(Math.max(0, (GLYPH_BOX_EM - spec.lineHeight) / 2) * spec.size);
}

/** Estimated height of `text` set in `spec` and wrapped to `width`, with its glyph padding above and below; 0 without text. */
export function textBoxHeight(text: string | undefined, width: number, spec: TypeSpec, charEm?: number): number {
  return text === undefined ? 0 : estimateTextHeight(text, width, { size: spec.size, lineHeight: spec.lineHeight, charEm }) + 2 * glyphPad(spec);
}
