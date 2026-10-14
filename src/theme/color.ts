// Hex color parsing and mixing, for deriving theme colors. Mixing is sRGB with
// no gamma; the OKLCH helpers below decode gamma properly.

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

/** A color in OKLCH: lightness 0..1, chroma >= 0, hue in degrees 0..360 (0 for greys). */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

type Rgb = [number, number, number];

/** sRGB channel 0..1 to linear light. */
const decode = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Linear light to sRGB channel 0..1, sign-preserving so out-of-gamut values stay visible. */
const encode = (x: number) =>
  Math.abs(x) <= 0.0031308 ? 12.92 * x : Math.sign(x) * (1.055 * Math.abs(x) ** (1 / 2.4) - 0.055);

/** Chroma below this counts as grey, whose hue is 0. */
const GREY_CHROMA = 1e-4;

/** `hex` in OKLCH (Bjorn Ottosson's OKLab, polar form). */
export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = parseHex(hex).map((c) => decode(c / 255)) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  const h = c < GREY_CHROMA ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** `o` as unrounded sRGB channels 0..255; out-of-gamut colors fall outside that range. */
export function oklchToRgb(o: Oklch): Rgb {
  const rad = (o.h * Math.PI) / 180;
  const A = o.c * Math.cos(rad);
  const B = o.c * Math.sin(rad);
  const l = (o.l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (o.l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (o.l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin: Rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((x) => encode(x) * 255) as Rgb;
}

/** Slack, in 0..255 units, for counting a channel as in gamut (rounding absorbs it). */
const GAMUT_EPSILON = 0.01;

const inGamut = (o: Oklch) => oklchToRgb(o).every((c) => c >= -GAMUT_EPSILON && c <= 255 + GAMUT_EPSILON);

/** The chroma `o` keeps once mapped into sRGB: `o.c` if it fits, else the largest fitting chroma at the same l and h. */
function gamutChroma(o: Oklch): number {
  if (o.l <= 0 || o.l >= 1) return 0;
  if (inGamut(o)) return o.c;
  let lo = 0;
  let hi = o.c;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ ...o, c: mid })) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** `o` as `#rrggbb`, reducing chroma (keeping l and h) until it fits sRGB. */
export function oklchToHex(o: Oklch): string {
  if (o.l >= 1) return "#ffffff";
  if (o.l <= 0) return "#000000";
  return toHex(oklchToRgb({ ...o, c: gamutChroma(o) }));
}

/** Palette harmonies: how p2..pN's hues relate to the brand color p1. */
export const HARMONIES = ["split", "analogous", "triad", "complement", "mono"] as const;
export type Harmony = (typeof HARMONIES)[number];

const HARMONY_ANGLES: Record<Harmony, number[]> = {
  split: [0, 150, 210],
  analogous: [0, -30, 30], // p2 at hue - 30, p3 at hue + 30
  triad: [0, 120, 240],
  complement: [0, 180],
  mono: [0, 0, 0],
};

/** Hue offsets in degrees from p1 for each swatch, p1 first at 0. */
export function harmonyAngles(harmony: Harmony): number[] {
  return [...HARMONY_ANGLES[harmony]];
}

/**
 * How far a derived swatch may sit from p1 (OKLCH, measured on the final hex),
 * so no swatch shouts over the others. 0.1 L is a visible but same-weight step;
 * 0.06 C lets a dull brand gain enough chroma to tell its hues apart without
 * turning neon, and lets a vivid brand's hues lose chroma where sRGB is narrow.
 */
export const PALETTE_BALANCE = { maxDeltaL: 0.1, maxDeltaC: 0.06 } as const;

/** Derived (non-mono) swatches aim for at least this chroma, within the band, so dark or dull brands still give distinct hues. */
const MIN_SWATCH_CHROMA = 0.1;
/** Margin kept inside the band so hex rounding cannot push a swatch out of it. */
const BAND_MARGIN = 0.01;
/** How far below the target chroma a swatch may land before lightness is nudged to recover it. */
const CHROMA_SLACK = 0.02;
/** Lightness step for searching the band when gamut mapping costs chroma. */
const L_STEP = 0.01;
/** Mono's lightness steps either side of p1, largest first; the first that keeps chroma in band wins. */
const MONO_STEPS = [0.15, 0.12, 0.09, 0.06];

/** Lightnesses within `delta` of `l` (and inside 0..1), nearest first, lighter before darker on ties. */
function nearbyLightness(l: number, delta: number): number[] {
  const out = [l];
  for (let d = L_STEP; d <= delta + 1e-9; d += L_STEP) out.push(l + d, l - d);
  return out.filter((x) => x > 0 && x < 1);
}

/** A swatch at hue `h` balanced against `brand`: chroma near `target`, lightness nudged within the band if sRGB cannot hold it. */
function balancedSwatch(brand: Oklch, h: number, target: number): string {
  const enough = Math.max(target - CHROMA_SLACK, brand.c - PALETTE_BALANCE.maxDeltaC + BAND_MARGIN);
  let best = { l: brand.l, c: -1 };
  for (const l of nearbyLightness(brand.l, PALETTE_BALANCE.maxDeltaL - BAND_MARGIN)) {
    const c = gamutChroma({ l, c: target, h });
    if (c >= enough) return oklchToHex({ l, c, h });
    if (c > best.c) best = { l, c };
  }
  return oklchToHex({ ...best, h });
}

/**
 * The palette p1..pN for a brand color and harmony, as `#rrggbb` (p1 is the brand, normalized).
 *
 * Non-mono: each swatch rotates the brand's OKLCH hue by the harmony's angle and stays within
 * `PALETTE_BALANCE` of the brand's lightness and chroma. Chroma aims for the brand's, raised to
 * `MIN_SWATCH_CHROMA` (0.1) when the band allows, so a navy like #14213d (L 0.25, C 0.06) still
 * gives clearly different hues. Where sRGB cannot hold that chroma at the brand's lightness, the
 * lightness moves (nearest first, within the band) until it can. A brand at the edge of sRGB
 * (pure #0000ff, C 0.31) can out-chroma what other hues reach anywhere in the L band; those
 * swatches stay in the L band at the most chroma sRGB allows, so the C band is best effort there.
 * A grey brand (C ~ 0) has hue 0, so its derived hues are arbitrary (rotated from 0).
 *
 * Mono: the brand's hue and chroma at three lightnesses, [p1, lighter, darker], 0.15 L apart
 * (stepping down to 0.06 when sRGB cannot keep chroma in band), clamped to L 0.12..0.97.
 * Mono's balance is hue and chroma only: its lightness steps deliberately leave the L band.
 * Chroma is best effort at the sRGB edge (#0000ff's darker step falls out of the C band).
 */
export function derivePalette(from: string, harmony: Harmony): string[] {
  const p1 = toHex(parseHex(from));
  const brand = hexToOklch(p1);
  if (harmony === "mono") return [p1, ...monoSteps(brand)];
  const maxC = brand.c + PALETTE_BALANCE.maxDeltaC - BAND_MARGIN;
  const target = Math.max(brand.c, Math.min(MIN_SWATCH_CHROMA, maxC));
  return harmonyAngles(harmony).map((angle, i) =>
    i === 0 ? p1 : balancedSwatch(brand, (((brand.h + angle) % 360) + 360) % 360, target),
  );
}

/** Mono's lighter and darker swatches at the brand's hue; chroma in band where sRGB allows. */
function monoSteps(brand: Oklch): string[] {
  const minC = brand.c - PALETTE_BALANCE.maxDeltaC + BAND_MARGIN;
  const at = (l: number) => ({ l: Math.min(0.97, Math.max(0.12, l)), c: brand.c, h: brand.h });
  const fits = (l: number) => gamutChroma(at(l)) >= minC;
  const step = (dir: 1 | -1) => MONO_STEPS.find((d) => fits(brand.l + dir * d)) ?? MONO_STEPS.at(-1)!;
  return [oklchToHex(at(brand.l + step(1))), oklchToHex(at(brand.l - step(-1)))];
}
