// Validates a storyboard's theme fields: `themeOverrides` (checked against the
// shape of a full theme), `accent` and `accentIntensity`. Colors must be hex so
// the theme can derive and check them; which colors is up to the storyboard.

import { HEX_COLOR } from "../theme/color";
import { lightTheme } from "../theme/light";
import { ACCENT_INTENSITIES, GROUND_STYLES, SPRING_PRESETS } from "../theme/types";
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
  "motion.springs.enter": SPRING_PRESETS,
  "motion.springs.exit": SPRING_PRESETS,
  "motion.springs.emphasis": SPRING_PRESETS,
};

function leafError(path: string, reference: unknown, value: unknown): string | undefined {
  const label = `themeOverrides.${path}`;
  const key = path.split(".").at(-1)!;
  if (typeof reference === "number") {
    if (path === "ground.seed") return Number.isInteger(value) ? undefined : `${label} must be an integer (got ${describe(value)})`;
    if (key === "size") {
      return typeof value === "number" && Number.isFinite(value) && value > 0 ? undefined : `${label} must be a positive number (got ${describe(value)})`;
    }
    return typeof value === "number" && Number.isFinite(value) ? undefined : `${label} must be a number (got ${describe(value)})`;
  }
  if (path.startsWith("colors.")) return colorError(label, value);
  const choices = ENUMS[path];
  if (choices !== undefined) return choices.includes(value as string) ? undefined : `${label} must be ${oneOf(choices)} (got ${describe(value)})`;
  return typeof value === "string" && value.trim() !== "" ? undefined : `${label} must be a non-empty string (got ${describe(value)})`;
}

/** Walks `value` alongside `reference` (a full theme), pushing every problem in order. */
function walk(path: string, reference: Record<string, unknown>, value: Record<string, unknown>, errors: string[]): void {
  for (const [key, child] of Object.entries(value)) {
    const childPath = path === "" ? key : `${path}.${key}`;
    const ref = Object.hasOwn(reference, key) && !(path === "" && key === "name") ? reference[key] : undefined;
    if (ref === undefined) {
      errors.push(`themeOverrides${path === "" ? "" : `.${path}`}: unknown field "${key}"`);
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
