// Turns a storyboard's theme choice into the theme its frames use: the named
// built-in theme, with `themeOverrides` deep-merged over it, then the `accent`
// and `accentIntensity` shortcuts, and the `safe` profile. Any color is allowed; the layer-1 checks
// judge contrast in the rendered frames, so nothing is blocked here.

import type { Storyboard } from "../storyboard/types";
import { mixColors } from "./color";
import { contrastRatio } from "./contrast";
import { darkTheme } from "./dark";
import { lightTheme } from "./light";
import { neutralTheme } from "./neutral";
import type { Theme, ThemeColors } from "./types";

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
function readableOn(accent: string, colors: ThemeColors): string {
  if (contrastRatio(colors.accentText, accent) >= AA) return colors.accentText;
  const candidates = [colors.accentText, colors.text, colors.ground, colors.surface];
  return candidates.reduce((best, c) => (contrastRatio(c, accent) > contrastRatio(best, accent) ? c : best));
}

/**
 * `fg` faded toward `bg` by up to `amount`, but only as far as it stays at
 * `min` contrast on every one of `backgrounds` (not at all if it never does).
 */
function fadeWithin(fg: string, bg: string, amount: number, backgrounds: readonly string[], min: number): string {
  for (let a = amount; a > 0; a -= 0.05) {
    const color = mixColors(fg, bg, a);
    if (backgrounds.every((b) => contrastRatio(color, b) >= min)) return color;
  }
  return fg;
}

/**
 * Accent as the ground: the old accent fills the frame, text takes the old
 * `accentText`, surfaces are tints of the accent away from the text, and
 * accent elements flip to the old `accentText` fill labelled in the old
 * accent. Muted text fades toward the accent only while it keeps AA.
 */
function fullAccent(colors: ThemeColors): ThemeColors {
  const { accent, accentText } = colors;
  // Tint surfaces toward whichever neutral is furthest from the text, so cards keep their contrast.
  const away = [colors.text, colors.ground, colors.surface].reduce((best, c) =>
    contrastRatio(c, accentText) > contrastRatio(best, accentText) ? c : best,
  );
  const surface = mixColors(accent, away, 0.16);
  const surfaceAlt = mixColors(accent, away, 0.26);
  return {
    ground: accent,
    surface,
    surfaceAlt,
    text: accentText,
    textMuted: fadeWithin(accentText, accent, 0.2, [accent, surface], AA),
    textSubtle: fadeWithin(accentText, accent, 0.4, [accent], 3),
    accent: accentText,
    accentText: accent,
    border: mixColors(accent, accentText, 0.3),
    shadow: colors.shadow,
  };
}

/** The theme a storyboard renders with, or a built-in theme by name. */
export function resolveTheme(source: string | Pick<Storyboard, "theme" | "themeOverrides" | "accent" | "accentIntensity" | "safe">): Theme {
  if (typeof source === "string") return namedTheme(source);
  const base = namedTheme(source.theme);
  const overrides = source.themeOverrides ?? {};
  let theme: Theme = deepMerge(base, overrides);

  const accent = source.accent ?? overrides.colors?.accent;
  if (accent !== undefined) {
    const accentText = overrides.colors?.accentText ?? readableOn(accent, theme.colors);
    theme = { ...theme, colors: { ...theme.colors, accent, accentText } };
  }
  if (source.accentIntensity !== undefined) theme = { ...theme, accentIntensity: source.accentIntensity };
  if (theme.accentIntensity === "full") theme = { ...theme, colors: fullAccent(theme.colors) };
  if (source.safe !== undefined) theme = { ...theme, safe: source.safe };
  return theme;
}
