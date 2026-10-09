// Validates a storyboard's theme fields: `themeOverrides` (checked against the
// shape of a full theme), `accent` and `accentIntensity`. Colors must be hex so
// the theme can derive and check them; which colors is up to the storyboard.

import { HEX_COLOR } from "../theme/color";
import { SHOT_FILL } from "./shots";
import { lightTheme } from "../theme/light";
import { ACCENT_INTENSITIES, CURVE_NAMES, GROUND_STYLES } from "../theme/types";
import { TRANSITION_TYPES } from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/** `"a", "b" or "c"`. */
function oneOf(options: readonly string[]): string {
  const quoted = options.map((o) => `"${o}"`);
  return quoted.length < 2 ? quoted.join("") : `${quoted.slice(0, -1).join(", ")} or ${quoted.at(-1)}`;
}

/** The problem with a color value, or undefined if it is a hex color. */
export function colorError(label: string, value: unknown): string | undefined {
  return typeof value === "string" && HEX_COLOR.test(value)
    ? undefined
    : `${label} must be a hex color like "#ff6a00" (got ${describe(value)})`;
}

export function accentIntensityError(label: string, value: unknown): string | undefined {
  return ACCENT_INTENSITIES.includes(value as never) ? undefined : `${label} must be ${oneOf(ACCENT_INTENSITIES)} (got ${describe(value)})`;
}

/** Choices for string tokens that are not free text, by path. */
const ENUMS: Record<string, readonly string[]> = {
  "ground.style": GROUND_STYLES,
  accentIntensity: ACCENT_INTENSITIES,
  "motion.transition": TRANSITION_TYPES,
};

/** The v3 token for each v2 motion field, named when a storyboard still uses one. */
const RENAMED_MOTION: Record<string, string> = {
  enterMs: 'use "enter": { "ms": ... }',
  exitMs: 'use "exit": { "maxMs": ... }',
  staggerMs: 'use "enter": { "staggerMs": ... }',
  springs: 'use "enter", "pop" and "exit" with a "curve"',
};

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Tokens with a range of their own (design v3, life #1): what a shot may fill,
 * and breathing that only zooms in (1.00-1.04) and drifts at most 16 px.
 */
const RANGES: Record<string, readonly [number, number]> = {
  "motion.shot.fill": [SHOT_FILL.min, SHOT_FILL.max],
  "motion.breathe.scale": [1, 1.04],
  "motion.breathe.driftPx": [0, 16],
};

/** The problem with a whole motion curve (a name, a cubic bezier or a spring), or undefined if it is one. */
function curveError(label: string, value: unknown): string | undefined {
  const bezier =
    Array.isArray(value) && value.length === 4 && value.every(isNumber) && [value[0], value[2]].every((x) => x !== undefined && x >= 0 && x <= 1);
  const spring =
    isObject(value) &&
    Object.keys(value).sort().join() === "damping,stiffness" &&
    isNumber(value.stiffness) &&
    value.stiffness > 0 &&
    isNumber(value.damping) &&
    value.damping >= 0;
  if (CURVE_NAMES.includes(value as never) || bezier || spring) return undefined;
  return `${label} must be ${oneOf(CURVE_NAMES)}, a cubic bezier [x1, y1, x2, y2] with x1 and x2 in 0..1, or a spring { "stiffness": ..., "damping": ... } (got ${describe(value)})`;
}

function leafError(path: string, reference: unknown, value: unknown): string | undefined {
  const label = `themeOverrides.${path}`;
  const key = path.split(".").at(-1)!;
  if (typeof reference === "boolean") return typeof value === "boolean" ? undefined : `${label} must be true or false (got ${describe(value)})`;
  if (typeof reference === "number") {
    const range = RANGES[path];
    if (range !== undefined) {
      const [min, max] = range;
      return isNumber(value) && value >= min && value <= max ? undefined : `${label} must be a number from ${min} to ${max} (got ${describe(value)})`;
    }
    if (path === "ground.seed") return Number.isInteger(value) ? undefined : `${label} must be an integer (got ${describe(value)})`;
    if (path === "ground.grain") {
      return isNumber(value) && value >= 0 && value <= 1 ? undefined : `${label} must be an opacity from 0 to 1 (got ${describe(value)})`;
    }
    if (key === "size" || key === "stiffness") {
      return isNumber(value) && value > 0 ? undefined : `${label} must be a positive number (got ${describe(value)})`;
    }
    // Durations, shares, scales and damping: never negative.
    if (path.startsWith("motion.")) return isNumber(value) && value >= 0 ? undefined : `${label} must be a number >= 0 (got ${describe(value)})`;
    return isNumber(value) ? undefined : `${label} must be a number (got ${describe(value)})`;
  }
  if (path.startsWith("colors.")) return colorError(label, value);
  const choices = ENUMS[path];
  if (choices !== undefined) return choices.includes(value as string) ? undefined : `${label} must be ${oneOf(choices)} (got ${describe(value)})`;
  return typeof value === "string" && value.trim() !== "" ? undefined : `${label} must be a non-empty string (got ${describe(value)})`;
}

/** Theme fields a storyboard sets elsewhere: the theme's name (`theme`) and its safe profile (`safe`). */
const NOT_OVERRIDABLE = new Set(["name", "safe"]);

/** Walks `value` alongside `reference` (a full theme), pushing every problem in order. */
function walk(path: string, reference: Record<string, unknown>, value: Record<string, unknown>, errors: string[]): void {
  for (const [key, child] of Object.entries(value)) {
    const childPath = path === "" ? key : `${path}.${key}`;
    const ref = Object.hasOwn(reference, key) && !(path === "" && NOT_OVERRIDABLE.has(key)) ? reference[key] : undefined;
    if (ref === undefined) {
      const renamed = path === "motion" && Object.hasOwn(RENAMED_MOTION, key) ? ` (motion tokens are named by design v3, table D: ${RENAMED_MOTION[key]})` : "";
      errors.push(`themeOverrides${path === "" ? "" : `.${path}`}: unknown field "${key}"${renamed}`);
    } else if (path.startsWith("motion.") && key === "curve" && !(isObject(ref) && isObject(child))) {
      // Any kind of curve replaces another; only a spring merges into a spring.
      const error = curveError(`themeOverrides.${childPath}`, child);
      if (error !== undefined) errors.push(error);
    } else if (isObject(ref)) {
      if (isObject(child)) walk(childPath, ref, child, errors);
      else errors.push(`themeOverrides.${childPath} must be an object (got ${describe(child)})`);
    } else {
      const error = leafError(childPath, ref, child);
      if (error !== undefined) errors.push(error);
    }
  }
}

/** Problems with a `themeOverrides` value, in document order. */
export function themeOverridesErrors(value: unknown): string[] {
  if (!isObject(value)) return ["themeOverrides must be an object"];
  const errors: string[] = [];
  walk("", lightTheme as unknown as Record<string, unknown>, value, errors);
  return errors;
}
