// Contrast: visible text against the background actually under it must reach
// WCAG AA (4.5:1). Semi-transparent colors are composited; fade-in/out opacity
// is not, since a scene is judged by how it looks once it has arrived.

import { luminanceContrast, rgbLuminance } from "../theme/contrast";
import { quote, VISIBLE_OPACITY, type FrameMeasurement } from "./types";

/** WCAG 2.x AA for normal text. */
export const MIN_CONTRAST = 4.5;

/** sRGB channels 0..255 plus alpha 0..1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** What the browser shows behind everything: an opaque white canvas. */
const CANVAS: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/**
 * Parses a CSS color as `getComputedStyle` reports it: `rgb()`/`rgba()` in comma
 * or space syntax, `transparent`, or hex. Returns undefined for anything else.
 */
export function parseCssColor(css: string): Rgba | undefined {
  const text = css.trim().toLowerCase();
  if (text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)?.[1];
  if (hex !== undefined) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    const [r, g, b, a = 255] = (full.match(/../g) ?? []).map((pair) => parseInt(pair, 16));
    return { r: r!, g: g!, b: b!, a: a / 255 };
  }

  const fn = /^rgba?\((.*)\)$/.exec(text)?.[1];
  if (fn === undefined) return undefined;
  const parts = fn.split(/[\s,/]+/).filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) return undefined;
  const numbers = parts.map((part, i) => {
    const value = parseFloat(part);
    if (!part.endsWith("%")) return value;
    return i < 3 ? (value / 100) * 255 : value / 100;
  });
  if (numbers.some((n) => !Number.isFinite(n))) return undefined;
  const [r, g, b, a = 1] = numbers as [number, number, number, number?];
  return { r, g, b, a };
}

/** `top` painted over `bottom`, which is opaque. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, b: number) => t * top.a + b * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

/** The opaque color you see through `layers` (topmost first) over the white canvas. */
export function effectiveBackground(layers: readonly Rgba[]): Rgba {
  return layers.reduceRight((under, layer) => composite(layer, under), CANVAS);
}

/** Contrast ratio of `text` (composited if translucent) on an opaque `background`. */
export function textContrast(text: Rgba, background: Rgba): number {
  const shown = composite(text, background);
  return luminanceContrast(rgbLuminance([shown.r, shown.g, shown.b]), rgbLuminance([background.r, background.g, background.b]));
}

export function checkContrast(measurement: FrameMeasurement): string[] {
  const messages: string[] = [];
  for (const text of measurement.texts) {
    if (text.opacity < VISIBLE_OPACITY) continue;
    const color = parseCssColor(text.color);
    const layers = text.backgrounds.map(parseCssColor);
    if (color === undefined || layers.some((layer) => layer === undefined)) {
      const unreadable = [text.color, ...text.backgrounds].filter((css) => parseCssColor(css) === undefined);
      messages.push(`text ${quote(text.text)}: cannot read color ${unreadable.join(", ")} to measure contrast`);
      continue;
    }
    const ratio = textContrast(color, effectiveBackground(layers as Rgba[]));
    if (ratio < MIN_CONTRAST) {
      messages.push(`text ${quote(text.text)} has contrast ${ratio.toFixed(2)}:1, below ${MIN_CONTRAST}:1 (WCAG AA)`);
    }
  }
  return messages;
}
