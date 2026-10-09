// Colors for syntax roles, derived from the theme rather than invented: the
// keyword takes the accent, strings, numbers and types take the accent turned
// around the color wheel, and the rest use the text roles. Every color is
// nudged toward the text color until it reads on the window's backgrounds.

import { mixColors, parseHex, toHex } from "../theme/color";
import { contrastRatio } from "../theme/contrast";
import type { Theme } from "../theme/types";
import type { SyntaxRole } from "./highlight";

/** WCAG AA for normal text, as the layer-1 contrast check requires. */
const MIN_CONTRAST = 4.5;
/** How far a highlighted code line's band is tinted toward the accent. */
export const HIGHLIGHT_TINT = 0.12;

/** The tinted band behind a highlighted code line. */
export function highlightBand(theme: Theme): string {
  return mixColors(theme.colors.surface, theme.colors.accent, HIGHLIGHT_TINT);
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** `color` with its hue turned by `degrees`. */
export function rotateHue(color: string, degrees: number): string {
  const [h, s, l] = rgbToHsl(parseHex(color));
  return toHex(hslToRgb([(((h + degrees) % 360) + 360) % 360, s, l]));
}

/** `color`, mixed toward `toward` just enough to reach AA on every background. */
function readable(color: string, toward: string, backgrounds: readonly string[]): string {
  for (let step = 0; step <= 20; step++) {
    const candidate = step === 0 ? color : mixColors(color, toward, step / 20);
    if (backgrounds.every((bg) => contrastRatio(candidate, bg) >= MIN_CONTRAST)) return candidate;
  }
  return toward;
}

/** A readable color for each syntax role, on the window surface and the highlight band. */
export function syntaxColors(theme: Theme): Record<SyntaxRole, string> {
  const { colors } = theme;
  const backgrounds = [colors.surface, highlightBand(theme)];
  const fit = (color: string) => readable(color, colors.text, backgrounds);
  return {
    plain: fit(colors.text),
    keyword: fit(colors.accent),
    string: fit(rotateHue(colors.accent, 150)),
    number: fit(rotateHue(colors.accent, -110)),
    type: fit(rotateHue(colors.accent, 60)),
    function: fit(mixColors(colors.text, colors.accent, 0.35)),
    comment: fit(colors.textMuted),
    punctuation: fit(colors.textMuted),
  };
}
