// Reading the type ramp: a step's spec, its size, the sizes on the ramp, and
// the CSS for a spec. The ramp lives in the theme (`theme.type`); sizes are
// already set per aspect there, so nothing here scales them.

import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { TYPE_ROLES } from "../theme/types";
import type { Aspect } from "./frame";

/**
 * Marks text that a component shrank below its ramp step on purpose, to fit
 * its box (a terminal's or a code window's mono). The type-scale check allows
 * any size inside it.
 */
export const TYPE_FIT_ATTRIBUTE = "data-type-fit";

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
