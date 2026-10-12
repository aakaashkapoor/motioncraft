// Validates a storyboard's `fonts` (its brand font files) and the families its
// `themeOverrides.fonts` name: each must be a font the render has. Whether the
// files exist and are fonts is `checkBrandFonts`'s job.

import { brandFamily, BRAND_FAMILY_PREFIX, BUNDLED_FONTS } from "../render/fontFaces";
import { GENERIC_FAMILIES, unknownFontNames } from "../theme/fontStack";
import { BRAND_FONT_EXTENSIONS, BRAND_FONT_LICENSES, DEFAULT_BRAND_WEIGHTS } from "./types";

const FONT_FIELDS = new Set(["name", "file", "license", "weights", "italic"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function describe(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/** `"a", "b" or "c"`. */
function oneOf(options: readonly string[]): string {
  const quoted = options.map((o) => `"${o}"`);
  return `${quoted.slice(0, -1).join(", ")} or ${quoted.at(-1)}`;
}

/** `a, b or c`. */
function listed(options: readonly string[]): string {
  return `${options.slice(0, -1).join(", ")} or ${options.at(-1)}`;
}

const isWeight = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1000;

function isWeights(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && isWeight(value[0]) && isWeight(value[1]) && value[0] <= value[1];
}

/** Lowercase names a brand font may not take: the bundled fonts and the CSS generic families. */
const RESERVED = new Set([...BUNDLED_FONTS.flatMap((f) => [f.name, f.family]), ...GENERIC_FAMILIES].map((n) => n.toLowerCase()));

/** Problems with one `fonts` entry, unprefixed. */
function entryErrors(raw: Record<string, unknown>): string[] {
  const errors = Object.keys(raw)
    .filter((key) => !FONT_FIELDS.has(key))
    .map((key) => `: unknown field "${key}"`);
  const { name, file, license, weights, italic } = raw;
  if (!isNonEmptyString(name)) errors.push(`.name must be a non-empty string (got ${describe(name)})`);
  else if (RESERVED.has(name.trim().toLowerCase())) errors.push(".name is a bundled font; name it in themeOverrides.fonts without declaring it");
  else if (brandFamily(name) === BRAND_FAMILY_PREFIX) errors.push(`.name must contain a letter or digit (got ${describe(name)})`);
  if (!isNonEmptyString(file) || !BRAND_FONT_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext))) {
    errors.push(`.file must be a ${listed(BRAND_FONT_EXTENSIONS)} file (got ${describe(file)})`);
  } else if (/^([\\/]|[A-Za-z]:)/.test(file)) {
    errors.push(`.file must be a path relative to the storyboard (got ${describe(file)})`);
  }
  if (!BRAND_FONT_LICENSES.includes(license as never)) {
    errors.push(
      `.license must be one of ${oneOf(BRAND_FONT_LICENSES)} (got ${describe(license)}): AGENTS.md allows only fonts licensed for commercial use and modification, never GPL or "personal use only"`,
    );
  }
  if (weights !== undefined && !isWeights(weights)) {
    errors.push(`.weights must be [min, max] with whole numbers from 1 to 1000 and min <= max (got ${describe(weights)})`);
  }
  if (italic !== undefined && typeof italic !== "boolean") errors.push(`.italic must be true or false (got ${describe(italic)})`);
  return errors;
}

/** Problems with a storyboard's `fonts`, in order. */
export function brandFontsErrors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [`fonts must be an array of { name, file, license, weights?, italic? } (got ${describe(raw)})`];
  const errors: string[] = [];
  const faces: { index: number; name: string; family: string; italic: boolean; weights: readonly [number, number] }[] = [];
  raw.forEach((item: unknown, i) => {
    if (!isObject(item)) {
      errors.push(`fonts[${i}] must be an object { name, file, license, weights?, italic? } (got ${describe(item)})`);
      return;
    }
    const label = isNonEmptyString(item.name) ? `fonts[${i}] (${JSON.stringify(item.name)})` : `fonts[${i}]`;
    const problems = entryErrors(item);
    errors.push(...problems.map((p) => label + p));
    if (problems.length > 0) return;
    const name = item.name as string;
    const face = { index: i, name, family: brandFamily(name), italic: item.italic === true, weights: (item.weights as [number, number] | undefined) ?? DEFAULT_BRAND_WEIGHTS };
    const clash = faces.find((f) => f.family === face.family && f.name !== name);
    const overlap = faces.find((f) => f.name === name && f.italic === face.italic && f.weights[0] <= face.weights[1] && face.weights[0] <= f.weights[1]);
    if (clash !== undefined) errors.push(`${label}.name has the same private family as fonts[${clash.index}] (${JSON.stringify(clash.name)}); give it a different name`);
    else if (overlap !== undefined) errors.push(`${label}: overlaps the weights of fonts[${overlap.index}], a face of the same family and style`);
    faces.push(face);
  });
  return errors;
}

/**
 * Problems with the families `themeOverrides.fonts` names: each must be
 * bundled, declared in `fonts` (`brandNames`), a CSS generic family or a
 * system fallback the built-in stacks use.
 */
export function fontOverrideErrors(themeOverrides: unknown, brandNames: readonly string[]): string[] {
  const fonts = isObject(themeOverrides) ? themeOverrides.fonts : undefined;
  if (!isObject(fonts)) return [];
  const bundled = listed(BUNDLED_FONTS.map((f) => f.name));
  return Object.entries(fonts).flatMap(([key, stack]) =>
    typeof stack !== "string"
      ? []
      : unknownFontNames(stack, brandNames).map(
          (name) => `themeOverrides.fonts.${key} names ${JSON.stringify(name)}, which is neither a bundled font (${bundled}) nor declared in "fonts"`,
        ),
  );
}
