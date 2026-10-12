// The bundled open fonts (SIL OFL, see licenses/) and the @font-face CSS that
// embeds them in the render page as data URLs: nothing is fetched, and the
// private family names mean the browser can never quietly use a system font
// that happens to share a name. Every face is a variable font declared over
// its weight range, so every weight the kit asks for renders as itself instead
// of being swapped for a neighbour. A storyboard's brand fonts are embedded
// the same way, under `mc-brand-*` names (see `brandFontFaceCss`).

import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_BRAND_WEIGHTS, type BrandFont } from "../storyboard/types";
import { brandFamily, BUNDLED_FONTS } from "./fontFaces";

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

/** The data-URL MIME type and CSS `format()` of each font file extension. */
const FORMATS: Record<string, { mime: string; format: string }> = {
  ".woff2": { mime: "font/woff2", format: "woff2" },
  ".woff": { mime: "font/woff", format: "woff" },
  ".ttf": { mime: "font/ttf", format: "truetype" },
  ".otf": { mime: "font/otf", format: "opentype" },
};

/**
 * @font-face rules for a storyboard's brand fonts, one per entry, read from
 * `mediaDir` (the storyboard's folder) and embedded as data URLs under each
 * font's private family. Throws naming the font whose file cannot be read.
 */
export async function brandFontFaceCss(fonts: readonly BrandFont[] | undefined, mediaDir: string = process.cwd()): Promise<string> {
  const rules = await Promise.all(
    (fonts ?? []).map(async ({ name, file, weights = DEFAULT_BRAND_WEIGHTS, italic }) => {
      const { mime, format } = FORMATS[extname(file).toLowerCase()] ?? FORMATS[".woff2"]!;
      let data: string;
      try {
        data = (await readFile(resolve(mediaDir, file))).toString("base64");
      } catch (error) {
        throw new Error(`font "${name}": cannot read "${file}" (${error instanceof Error ? error.message : String(error)})`);
      }
      const style = italic === true ? "italic" : "normal";
      return `@font-face{font-family:"${brandFamily(name)}";font-style:${style};font-weight:${weights[0]} ${weights[1]};font-display:block;src:url(data:${mime};base64,${data}) format("${format}")}`;
    }),
  );
  return rules.join("");
}
