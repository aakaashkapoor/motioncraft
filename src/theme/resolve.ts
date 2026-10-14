// Turns a storyboard's theme choice into the theme its frames use: the named
// built-in theme, a palette preset's neutrals, `themeOverrides` deep-merged
// over them, the palette's swatches, then the `accent` and `accentIntensity`
// shortcuts, and the `safe` profile. Any color is allowed; the layer-1 checks
// judge contrast in the rendered frames, so nothing is blocked here. Font
// overrides name fonts; they resolve to private families (see `resolveFontStack`).

import type { Storyboard } from "../storyboard/types";
import { contrastRatio, roleColorIssues } from "./contrast";
import { fieldColors } from "./field";
import { darkTheme } from "./dark";
import { resolveFontStack } from "./fontStack";
import { lightTheme } from "./light";
import { neutralTheme } from "./neutral";
import { buildPalette, leadWith, paletteColors, paletteNeutrals } from "./palettes";
import type { Theme, ThemeColors, ThemeFonts } from "./types";

/** Themes a storyboard can name in its `theme` field. */
export const themes: Record<string, Theme> = {
  light: lightTheme,
  dark: darkTheme,
  neutral: neutralTheme,
};

/** WCAG AA for normal text. */
const AA = 4.5;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `base` with `patch` merged in: objects merge key by key, anything else replaces. Copies, never mutates. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) out[key] = deepMerge(out[key], value);
  }
  return out as T;
}

function namedTheme(name: string): Theme {
  const theme = Object.hasOwn(themes, name) ? themes[name] : undefined;
  if (theme === undefined) {
    throw new Error(`unknown theme "${name}" (known: ${Object.keys(themes).join(", ")})`);
  }
  return theme;
}

/**
 * Text color for an accent fill: the theme's `accentText` if it still reads
 * (AA) on the new accent, else whichever of the theme's neutrals reads best.
 */
function readableOn(accent: string, colors: ThemeColors, preferred: string = colors.accentText): string {
  if (contrastRatio(preferred, accent) >= AA) return preferred;
  const candidates = [preferred, colors.text, colors.ground, colors.surface];
  return candidates.reduce((best, c) => (contrastRatio(c, accent) > contrastRatio(best, accent) ? c : best));
}

const ROLE_KEYS = ["positive", "positiveText", "negative", "negativeText"] as const;

/**
 * `positiveText` / `negativeText` for an overridden `positive` / `negative`
 * fill that did not bring its own text color: whichever neutral reads best on it.
 */
function fillTexts(overrides: Partial<ThemeColors> | undefined, colors: ThemeColors): Partial<ThemeColors> {
  const picked: Partial<ThemeColors> = {};
  if (overrides?.positive !== undefined && overrides.positiveText === undefined) picked.positiveText = readableOn(colors.positive, colors, colors.positiveText);
  if (overrides?.negative !== undefined && overrides.negativeText === undefined) picked.negativeText = readableOn(colors.negative, colors, colors.negativeText);
  return picked;
}

/**
 * Accent as the ground: the old accent fills the frame, text takes the old
 * `accentText`, surfaces are tints of the accent away from the text, and
 * accent elements flip to the old `accentText` fill labelled in the old
 * accent (with a palette, to the swatch that stands out most on it). Muted
 * text fades toward the accent only while it keeps AA. See `fieldColors`.
 */
function fullAccent(colors: ThemeColors): ThemeColors {
  return fieldColors(colors, colors.accent, colors.accentText);
}

/** The theme's fonts with each overridden stack resolved against the storyboard's brand fonts. */
function overriddenFonts(fonts: ThemeFonts, overrides: Partial<ThemeFonts> | undefined, brandNames: readonly string[]): ThemeFonts {
  const out = { ...fonts };
  for (const key of ["display", "body", "mono"] as const) {
    const stack = overrides?.[key];
    if (stack !== undefined) out[key] = resolveFontStack(stack, brandNames, key === "mono");
  }
  return out;
}

/**
 * `colors` with the palette `spec` laid over it: its swatches (`accent`, when
 * given, first and the rest shifted down), each with its ink, p1 as the accent
 * and its ink as `accentText` unless the overrides set one.
 */
function withPalette(colors: ThemeColors, spec: NonNullable<Storyboard["palette"]>, accent: string | undefined, accentTextOverride: string | undefined): ThemeColors {
  const swatches = paletteColors(spec, accent ?? colors.accent);
  const palette = buildPalette(accent === undefined ? swatches : leadWith(swatches, accent), colors);
  return { ...colors, palette, accent: palette.p1, accentText: accentTextOverride ?? palette.onP1 };
}

/**
 * The theme a storyboard renders with, or a built-in theme by name. Order: the
 * named theme, a palette preset's neutrals, `themeOverrides`, the palette's
 * swatches and inks (p1 is the accent; `accent` becomes p1), the `accent`
 * shortcut without a palette, then accent intensity and the safe profile.
 */
export function resolveTheme(
  source: string | Pick<Storyboard, "theme" | "themeOverrides" | "accent" | "accentIntensity" | "safe" | "fonts" | "palette">,
): Theme {
  if (typeof source === "string") return namedTheme(source);
  const named = namedTheme(source.theme);
  const base = source.palette === undefined ? named : { ...named, colors: { ...named.colors, ...paletteNeutrals(source.palette) } };
  const overrides = source.themeOverrides ?? {};
  let theme: Theme = deepMerge(base, overrides);
  if (overrides.fonts !== undefined) {
    theme = { ...theme, fonts: overriddenFonts(theme.fonts, overrides.fonts, (source.fonts ?? []).map((f) => f.name)) };
  }

  const accent = source.accent ?? overrides.colors?.accent;
  if (source.palette !== undefined) {
    theme = { ...theme, colors: withPalette(theme.colors, source.palette, accent, overrides.colors?.accentText) };
  } else if (accent !== undefined) {
    const accentText = overrides.colors?.accentText ?? readableOn(accent, theme.colors);
    theme = { ...theme, colors: { ...theme.colors, accent, accentText } };
  }
  theme = { ...theme, colors: { ...theme.colors, ...fillTexts(overrides.colors, theme.colors) } };
  if (ROLE_KEYS.some((key) => overrides.colors?.[key] !== undefined)) {
    const issues = roleColorIssues(theme.colors);
    if (issues.length > 0) throw new Error(`themeOverrides.colors: ${issues.join("; ")}`);
  }
  if (source.accentIntensity !== undefined) theme = { ...theme, accentIntensity: source.accentIntensity };
  if (theme.accentIntensity === "full") theme = { ...theme, colors: fullAccent(theme.colors) };
  if (source.safe !== undefined) theme = { ...theme, safe: source.safe };
  return theme;
}
