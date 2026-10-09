// WCAG 2.x relative luminance and contrast ratio.
// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance

import { parseHex } from "./color";

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of sRGB channels (0..255), 0 (black) to 1 (white). */
export function rgbLuminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb.map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relative luminance of a hex color, 0 (black) to 1 (white). */
export function relativeLuminance(color: string): number {
  return rgbLuminance(parseHex(color));
}

/** Contrast ratio between two luminances, 1 to 21. Order does not matter. */
export function luminanceContrast(la: number, lb: number): number {
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Contrast ratio between two hex colors, 1 to 21. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  return luminanceContrast(relativeLuminance(a), relativeLuminance(b));
}
