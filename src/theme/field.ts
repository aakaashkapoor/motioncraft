// Colour fields: a theme turned so that one flat colour is the ground. A scene
// with `"ground": "p2"` renders with `fieldTheme(theme, "p2")`: the frame is
// swatch p2, text takes its ink (`onP2`), surfaces are tints of the swatch, and
// the accent becomes whichever other swatch stands out most on it. `fullAccent`
// (accent intensity "full") is the same move with the accent as the field.

import type { SceneGround, StoryboardScene } from "../storyboard/types";
import { mixColors } from "./color";
import { AA_CONTRAST, GRAPHIC_CONTRAST, contrastRatio } from "./contrast";
import { paletteSwatches } from "./palettes";
import type { PaletteRole, Theme, ThemeColors } from "./types";

/**
 * `fg` faded toward `bg` by up to `amount`, but only as far as it stays at
 * `min` contrast on every one of `backgrounds` (not at all if it never does).
 */
export function fadeWithin(fg: string, bg: string, amount: number, backgrounds: readonly string[], min: number): string {
  for (let a = amount; a > 0; a -= 0.05) {
    const color = mixColors(fg, bg, a);
    if (backgrounds.every((b) => contrastRatio(color, b) >= min)) return color;
  }
  return fg;
}

/**
 * The accent on a field of `fill`: the palette swatch (other than the field)
 * that stands out most on the fill and its surface, if it reaches 3:1 on both,
 * labelled in its own ink; else the field's ink, labelled in the fill.
 */
function fieldAccent(colors: ThemeColors, fill: string, ink: string, surface: string): { accent: string; accentText: string } {
  const fallback = { accent: ink, accentText: fill };
  if (colors.palette === undefined) return fallback;
  const reach = (color: string) => Math.min(contrastRatio(color, fill), contrastRatio(color, surface));
  const best = paletteSwatches(colors.palette)
    .filter((s) => s.color !== fill)
    .reduce<{ color: string; ink: string } | undefined>((top, s) => (top === undefined || reach(s.color) > reach(top.color) ? s : top), undefined);
  return best !== undefined && reach(best.color) >= GRAPHIC_CONTRAST ? { accent: best.color, accentText: best.ink } : fallback;
}

/**
 * `colors` with `fill` as the ground and `ink` as the text: surfaces are tints
 * of the fill away from the ink (toward whichever neutral is furthest from it,
 * so cards keep their contrast), muted and subtle text fade toward the fill
 * only while they keep AA (on the ground and the surface) and 3:1, and the
 * border sits between fill and ink. The accent is the swatch that stands out
 * most on the field (see `fieldAccent`), or the ink. Positive and negative and
 * their texts are kept as they are: on a saturated field they may fall below
 * 3:1, which is acceptable for marks that also carry a shape or a label. The
 * palette is kept unchanged.
 */
export function fieldColors(colors: ThemeColors, fill: string, ink: string): ThemeColors {
  const away = [colors.text, colors.ground, colors.surface].reduce((best, c) => (contrastRatio(c, ink) > contrastRatio(best, ink) ? c : best));
  const surface = mixColors(fill, away, 0.16);
  const surfaceAlt = mixColors(fill, away, 0.26);
  return {
    ground: fill,
    surface,
    surfaceAlt,
    text: ink,
    textMuted: fadeWithin(ink, fill, 0.2, [fill, surface], AA_CONTRAST),
    textSubtle: fadeWithin(ink, fill, 0.4, [fill], GRAPHIC_CONTRAST),
    ...fieldAccent(colors, fill, ink, surface),
    positive: colors.positive,
    positiveText: colors.positiveText,
    negative: colors.negative,
    negativeText: colors.negativeText,
    border: mixColors(fill, ink, 0.3),
    shadow: colors.shadow,
    ...(colors.palette === undefined ? {} : { palette: colors.palette }),
  };
}

/**
 * The theme a scene standing on `ground` renders with: `theme` itself for the
 * theme's ground (or none), else its colours turned to that palette swatch's
 * field (see `fieldColors`). Throws when the theme has no palette or the
 * palette lacks the role.
 */
export function fieldTheme(theme: Theme, ground: SceneGround | undefined): Theme {
  if (ground === undefined || ground === "ground") return theme;
  const { palette } = theme.colors;
  if (palette === undefined) throw new Error(`ground "${ground}" needs a palette (set the storyboard's "palette")`);
  const swatches = paletteSwatches(palette);
  const swatch = swatches.find((s) => s.role === (ground as PaletteRole));
  if (swatch === undefined) throw new Error(`ground "${ground}" is not in the palette (it has ${swatches.map((s) => s.role).join(", ")})`);
  return { ...theme, colors: fieldColors(theme.colors, swatch.color, swatch.ink) };
}

/** The theme `scene` renders with: its `ground`'s field theme (see `fieldTheme`). */
export function sceneTheme(theme: Theme, scene: Pick<StoryboardScene, "ground">): Theme {
  return fieldTheme(theme, scene.ground);
}
