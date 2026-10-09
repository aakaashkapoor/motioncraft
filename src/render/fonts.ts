// The bundled open fonts (SIL OFL, see licenses/) and the @font-face CSS that
// embeds them in the render page as data URLs: nothing is fetched, and the
// private family names mean the browser can never quietly use a system font
// that happens to share a name. Every face is a variable font declared over
// its weight range, so every weight the kit asks for renders as itself instead
// of being swapped for a neighbour.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_FONTS } from "./fontFaces";

export * from "./fontFaces";

export const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "fonts");

let css: Promise<string> | undefined;

/** @font-face rules for every bundled font, read once per process. */
export function fontFaceCss(): Promise<string> {
  css ??= Promise.all(
    BUNDLED_FONTS.map(async ({ family, file, weights }) => {
      const data = (await readFile(join(FONTS_DIR, file))).toString("base64");
      // `block`: text waits for the font instead of flashing a fallback.
      return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weights[0]} ${weights[1]};font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2")}`;
    }),
  ).then((rules) => rules.join(""));
  return css;
}
