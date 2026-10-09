// Which color role an element takes at the theme's accent intensity. `subtle`
// keeps the accent to one element per scene; `bold` also paints headlines and
// cards in it. (`full` is applied to the colors themselves by `resolveTheme`.)

import { readableColor } from "./contrast";
import type { Theme } from "./types";

/**
 * The accent as a text color: the accent itself where it reads (WCAG AA) on
 * the ground and on cards, else nudged toward the text color until it does.
 * A bright accent such as the light theme's orange stays an orange, only deeper.
 */
export function accentInk(theme: Theme): string {
  const { accent, text, ground, surface } = theme.colors;
  return readableColor(accent, text, [ground, surface]);
}

/** Color for a scene's main headline or stat. */
export function headlineColor(theme: Theme): string {
  return theme.accentIntensity === "bold" ? accentInk(theme) : theme.colors.text;
}

export interface CardColors {
  fill: string;
  text: string;
  border: string;
}

/** Colors for a card: a surface with an accent edge, or an accent fill when bold. */
export function cardColors(theme: Theme): CardColors {
  const { colors } = theme;
  return theme.accentIntensity === "bold"
    ? { fill: colors.accent, text: colors.accentText, border: colors.accent }
    : { fill: colors.surface, text: colors.text, border: colors.accent };
}
