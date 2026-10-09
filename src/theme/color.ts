// Hex color parsing and mixing, for deriving theme colors. sRGB, no gamma.

/** Matches `#rgb` and `#rrggbb`, the color syntax theme tokens use. */
export const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function parseHex(color: string): [number, number, number] {
  const m = HEX_COLOR.exec(color.trim());
  if (!m?.[1]) throw new Error(`Expected a hex color like #rrggbb, got "${color}"`);
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export function toHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** `a` blended toward `b` by `amount` (0 gives `a`, 1 gives `b`), as `#rrggbb`. */
export function mixColors(a: string, b: string, amount: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex(ca.map((c, i) => c + (cb[i]! - c) * amount) as [number, number, number]);
}

/** `color` as a CSS `rgba()` with the given alpha. */
export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = parseHex(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
