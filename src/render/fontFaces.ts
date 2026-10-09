// The bundled fonts as data: private family names, files, weight ranges and
// the weights the kit draws with. No Node imports, so the render page and the
// themes can use it; `fonts.ts` builds the @font-face CSS from it.

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
 * bundled family at every kit weight. Each must resolve to a bundled face.
 */
export function fontLoadRequests(): string[] {
  return BUNDLED_FONTS.flatMap(({ family }) => KIT_WEIGHTS.map((weight) => `${weight} 16px "${family}"`));
}
