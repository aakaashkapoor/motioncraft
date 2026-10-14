// Palettes: two to four swatches besides a theme's neutrals, shared by every
// scene. A storyboard picks a curated preset by name, or derives one from a
// brand color and a harmony (see `derivePalette`). `resolveTheme` lays the
// preset's neutrals under `themeOverrides`, then the swatches and their inks
// over the result.

import type { PaletteSpec } from "../storyboard/types";
import { derivePalette, parseHex, toHex } from "./color";
import { AA_CONTRAST, contrastRatio, readableColor, relativeLuminance } from "./contrast";
import { PALETTE_ROLES, type PaletteRole, type ThemeColors, type ThemePalette } from "./types";

/**
 * Curated palettes: `reel` (orange, lime, indigo and cream on near-black),
 * `editorial` (red, ink and cream on paper), `pastel` (coral, mint, lavender and
 * butter on a light ground), `mono` (one blue at three lightnesses on a dark
 * ground) and `brand` (derived from the accent with the "split" harmony, over
 * the named theme's own neutrals).
 *
 * Swatches are colour fields and fills, and every one carries its own ink
 * (`onPn`), so a swatch need not reach 3:1 on the ground (pastel's do not):
 * what must read is the ink on the swatch, at WCAG AA.
 */
export const PALETTE_PRESETS = ["reel", "editorial", "pastel", "mono", "brand"] as const;
export type PalettePreset = (typeof PALETTE_PRESETS)[number];

/** Most swatches a palette holds. */
export const MAX_SWATCHES = PALETTE_ROLES.length;

/** The neutrals a preset brings (every one, so roles and text read on its ground) and its swatches, p1 first. */
interface PresetColors {
  neutrals: Partial<ThemeColors>;
  swatches: readonly string[];
}

/** Light-on-dark positive and negative roles, labelled in the ground color. */
const darkRoles = (ground: string): Partial<ThemeColors> => ({ positive: "#4cc38a", positiveText: ground, negative: "#ff6b6b", negativeText: ground });

/** The mono preset's one hue: a clear blue. */
const MONO_FROM = "#2f60c8";

const PRESETS: Record<Exclude<PalettePreset, "brand">, PresetColors> = {
  // A motion reel: saturated flat fields hard-cutting on near-black.
  reel: {
    neutrals: {
      ground: "#0e0e10",
      surface: "#1a1a1e",
      surfaceAlt: "#242429",
      text: "#faf7f1",
      textMuted: "#aaa69d",
      textSubtle: "#78756e",
      border: "#2c2c31",
      shadow: "#030304",
      ...darkRoles("#0e0e10"),
    },
    swatches: ["#ff5a1f", "#c6f432", "#5b5bf0", "#f1ece2"],
  },
  // Print: near-black ink on paper, one red, and a deeper cream for fields.
  editorial: {
    neutrals: {
      ground: "#f4efe4",
      surface: "#fbf8f1",
      surfaceAlt: "#ebe4d4",
      text: "#1b1a17",
      textMuted: "#5c5850",
      textSubtle: "#8a857a",
      border: "#ddd5c4",
      shadow: "#2b2620",
      positive: "#1d7a45",
      positiveText: "#fbf8f1",
      negative: "#b42d2d",
      negativeText: "#fbf8f1",
    },
    swatches: ["#c42b27", "#1b1a17", "#e6d8bc"],
  },
  // Soft fields on a warm light ground, all inked in the dark text.
  pastel: {
    neutrals: {
      ground: "#f7f4ef",
      surface: "#ffffff",
      surfaceAlt: "#efebe4",
      text: "#25232b",
      textMuted: "#605d67",
      textSubtle: "#8c8891",
      border: "#e2ded6",
      shadow: "#2d2a33",
      positive: "#178048",
      positiveText: "#fbfaf8",
      negative: "#c43838",
      negativeText: "#fbfaf8",
    },
    swatches: ["#f4a28c", "#a8dcc0", "#c3b8f0", "#f6dd8a"],
  },
  // One blue at three lightnesses on a blue-black ground.
  mono: {
    neutrals: {
      ground: "#0d1017",
      surface: "#171b24",
      surfaceAlt: "#1f2430",
      text: "#eef2fa",
      textMuted: "#a3abbb",
      textSubtle: "#747c8c",
      border: "#2a303c",
      shadow: "#030407",
      ...darkRoles("#0d1017"),
    },
    swatches: derivePalette(MONO_FROM, "mono"),
  },
};

/** The neutrals a palette brings: a curated preset's own; none for `brand` or a derived palette. */
export function paletteNeutrals(spec: PaletteSpec): Partial<ThemeColors> {
  return typeof spec === "string" && spec !== "brand" ? { ...PRESETS[spec].neutrals } : {};
}

/**
 * A palette's swatch colors, p1 first: a preset's own, `brand` derived from
 * `accent` ("split"), or `derivePalette(from, harmony)`; at most four.
 */
export function paletteColors(spec: PaletteSpec, accent: string): string[] {
  if (spec === "brand") return distinctSwatches(derivePalette(accent, "split"));
  if (typeof spec === "string") return [...PRESETS[spec].swatches];
  return distinctSwatches(derivePalette(spec.from, spec.harmony));
}

/** `swatches` as lower-case `#rrggbb`, repeats dropped (first kept), at most four. */
export function distinctSwatches(swatches: readonly string[]): string[] {
  return [...new Set(swatches.map((s) => toHex(parseHex(s))))].slice(0, MAX_SWATCHES);
}

/** `swatches` with `lead` first: any swatch equal to it dropped, the rest shifted down, at most four. */
export function leadWith(swatches: readonly string[], lead: string): string[] {
  return distinctSwatches([lead, ...swatches]);
}

/**
 * `swatches`, distinct, made up to two when a degenerate brand gave only one
 * (e.g. `derivePalette("#000000", "split")` repeats p1): the second is
 * whichever of the theme's `text` and `ground` stands furthest from p1.
 */
export function atLeastTwo(swatches: readonly string[], colors: Pick<ThemeColors, "text" | "ground">): string[] {
  const out = distinctSwatches(swatches);
  if (out.length >= 2) return out;
  const p1 = out[0] ?? colors.ground;
  const opposite = contrastRatio(colors.text, p1) >= contrastRatio(colors.ground, p1) ? colors.text : colors.ground;
  return distinctSwatches([p1, opposite, colors.text, colors.ground]).slice(0, 2);
}

/**
 * The ink for a fill of `swatch` (see `PALETTE_PRESETS`): whichever of the theme's `text` and `ground`
 * reads better on it. If neither reaches AA (presets are tuned so this never
 * happens), the better one is pushed toward black or white until it does.
 */
export function inkOn(swatch: string, colors: Pick<ThemeColors, "text" | "ground">): string {
  const best = contrastRatio(colors.text, swatch) >= contrastRatio(colors.ground, swatch) ? colors.text : colors.ground;
  if (contrastRatio(best, swatch) >= AA_CONTRAST) return best;
  const toward = relativeLuminance(best) < relativeLuminance(swatch) ? "#000000" : "#ffffff";
  return readableColor(best, toward, [swatch]);
}

/**
 * A theme palette from swatch colors, each with its ink (see `inkOn`): repeats
 * dropped, made up to two (see `atLeastTwo`), at most four. Never throws.
 */
export function buildPalette(swatches: readonly string[], colors: Pick<ThemeColors, "text" | "ground">): ThemePalette {
  const [p1, p2, p3, p4] = atLeastTwo(swatches, colors) as [string, string, string?, string?];
  return {
    p1,
    p2,
    ...(p3 === undefined ? {} : { p3 }),
    ...(p4 === undefined ? {} : { p4 }),
    onP1: inkOn(p1, colors),
    onP2: inkOn(p2, colors),
    ...(p3 === undefined ? {} : { onP3: inkOn(p3, colors) }),
    ...(p4 === undefined ? {} : { onP4: inkOn(p4, colors) }),
  };
}

/** The swatches present in `palette`, in order, each with its role and ink. */
export function paletteSwatches(palette: ThemePalette): Array<{ role: PaletteRole; color: string; ink: string }> {
  return PALETTE_ROLES.flatMap((role, i) => {
    const color = palette[role];
    const ink = palette[`onP${i + 1}` as `onP${1 | 2 | 3 | 4}`];
    return color === undefined || ink === undefined ? [] : [{ role, color, ink }];
  });
}
