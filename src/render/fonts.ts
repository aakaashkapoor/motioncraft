// The bundled open fonts (SIL OFL, see licenses/) and the @font-face CSS that
// embeds them in the render page as data URLs: nothing is fetched, and the
// private family names mean the browser can never quietly use a system font
// that happens to share a name.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Geist, the bundled sans. */
export const SANS_FAMILY = "mc-sans";
/** Geist Mono, the bundled mono. */
export const MONO_FAMILY = "mc-mono";

export interface BundledFont {
  family: string;
  weight: number;
  /** File name in `assets/fonts/`. */
  file: string;
}

export const BUNDLED_FONTS: readonly BundledFont[] = [
  { family: SANS_FAMILY, weight: 400, file: "Geist-Regular.woff2" },
  { family: SANS_FAMILY, weight: 600, file: "Geist-SemiBold.woff2" },
  { family: SANS_FAMILY, weight: 800, file: "Geist-ExtraBold.woff2" },
  { family: MONO_FAMILY, weight: 400, file: "GeistMono-Regular.woff2" },
  { family: MONO_FAMILY, weight: 600, file: "GeistMono-SemiBold.woff2" },
];

export const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "fonts");

let css: Promise<string> | undefined;

/** @font-face rules for every bundled font, read once per process. */
export function fontFaceCss(): Promise<string> {
  css ??= Promise.all(
    BUNDLED_FONTS.map(async ({ family, weight, file }) => {
      const data = (await readFile(join(FONTS_DIR, file))).toString("base64");
      // `block`: text waits for the font instead of flashing a fallback.
      return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2")}`;
    }),
  ).then((rules) => rules.join(""));
  return css;
}
