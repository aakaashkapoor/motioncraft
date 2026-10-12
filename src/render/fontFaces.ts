// The bundled fonts as data: private family names, files, weight ranges and
// the weights the kit draws with. No Node imports, so the render page and the
// themes can use it; `fonts.ts` builds the @font-face CSS from it. A
// storyboard's own brand fonts get private names too (`brandFamily`).

import { DEFAULT_BRAND_WEIGHTS, type BrandFont } from "../storyboard/types";

/** Source Sans 3, the default sans. */
export const SANS_FAMILY = "mc-sans";
/** Source Code Pro, the default mono. */
export const MONO_FAMILY = "mc-mono";
/** Geist, an alternative sans a theme can choose. */
export const GEIST_FAMILY = "mc-geist";
/** Geist Mono, the mono that goes with Geist. */
export const GEIST_MONO_FAMILY = "mc-geist-mono";

export interface BundledFont {
  family: string;
  /** The font's own name, for people. */
  name: string;
  /** File name in `assets/fonts/`. */
  file: string;
  /** The variable weight axis, [min, max]. */
  weights: readonly [number, number];
}

export const BUNDLED_FONTS: readonly BundledFont[] = [
  { family: SANS_FAMILY, name: "Source Sans 3", file: "SourceSans3VF-Upright.ttf.woff2", weights: [200, 900] },
  { family: MONO_FAMILY, name: "Source Code Pro", file: "SourceCodeVF-Upright.ttf.woff2", weights: [200, 900] },
  { family: GEIST_FAMILY, name: "Geist", file: "Geist-Variable.woff2", weights: [100, 900] },
  { family: GEIST_MONO_FAMILY, name: "Geist Mono", file: "GeistMono-Variable.woff2", weights: [100, 900] },
];

/** Every weight the kit draws with: the theme's named weights and the ramp's (mono is 450). */
export const KIT_WEIGHTS = [400, 450, 500, 600, 700, 800] as const;

/**
 * CSS font requests the readiness gate loads before the first frame: every
 * bundled family at every kit weight, then the storyboard's brand faces. Each
 * must resolve to a face.
 */
export function fontLoadRequests(brand?: readonly BrandFont[]): string[] {
  return [...BUNDLED_FONTS.flatMap(({ family }) => KIT_WEIGHTS.map((weight) => `${weight} 16px "${family}"`)), ...brandFontLoadRequests(brand)];
}

/** Prefix of a brand font's private family. */
export const BRAND_FAMILY_PREFIX = "mc-brand-";

/** The private family a storyboard's brand font `name` is embedded under: `mc-brand-<slug>`. */
export function brandFamily(name: string): string {
  return BRAND_FAMILY_PREFIX + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Font requests for a storyboard's brand fonts: each face at every kit weight
 * it covers, and at its lightest weight, so a face that failed to load stops
 * the render instead of quietly falling back.
 */
export function brandFontLoadRequests(fonts: readonly BrandFont[] = []): string[] {
  const requests = fonts.flatMap(({ name, weights = DEFAULT_BRAND_WEIGHTS, italic }) => {
    const style = italic === true ? "italic " : "";
    const inRange = KIT_WEIGHTS.filter((w) => w >= weights[0] && w <= weights[1]);
    return [...new Set<number>([weights[0], ...inRange])].map((weight) => `${style}${weight} 16px "${brandFamily(name)}"`);
  });
  return [...new Set(requests)];
}
