// Layer-1 checks on a storyboard's brand fonts: each file must exist and be a
// font (its first four bytes are a WOFF2, WOFF, TrueType or OpenType
// signature), or the render fails to load it. And since text fitting
// (`src/layout/textFit.ts`) estimates widths tuned for the bundled fonts, a
// brand font in use is a reminder to look at the stills for overflow.

import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileProblem } from "../render/media";
import type { Storyboard } from "../storyboard/types";
import { fontStackEntries } from "../theme/fontStack";

/** The signatures a font file starts with: `wOF2`, `wOFF`, TrueType (00 01 00 00) and `OTTO`. */
const FONT_MAGIC = [Buffer.from("wOF2"), Buffer.from("wOFF"), Buffer.from([0, 1, 0, 0]), Buffer.from("OTTO")];

/** Whether the file at `path` starts with a font signature. */
async function isFontFile(path: string): Promise<boolean> {
  const handle = await open(path, "r");
  try {
    const head = Buffer.alloc(4);
    const { bytesRead } = await handle.read(head, 0, 4, 0);
    return bytesRead === 4 && FONT_MAGIC.some((magic) => magic.equals(head));
  } finally {
    await handle.close();
  }
}

export interface BrandFontIssues {
  errors: string[];
  warnings: string[];
}

/** Problems with the storyboard's brand font files, resolved against `mediaDir` (the storyboard's folder), and where a brand font is used. */
export async function checkBrandFonts(storyboard: Storyboard, mediaDir: string = process.cwd()): Promise<BrandFontIssues> {
  const fonts = storyboard.fonts ?? [];
  const errors: string[] = [];
  for (const [i, { name, file }] of fonts.entries()) {
    const at = `error [brand-font] fonts[${i}] (${JSON.stringify(name)})`;
    const path = resolve(mediaDir, file);
    const missing = await fileProblem(path);
    if (missing !== undefined) errors.push(`${at}: "${file}" ${missing} (looked for ${path})`);
    else if (!(await isFontFile(path))) errors.push(`${at}: "${file}" is not a font file (it does not start with wOF2, wOFF, 00 01 00 00 or OTTO)`);
  }

  const names = new Map(fonts.map(({ name }) => [name.toLowerCase(), name]));
  const warnings = Object.entries(storyboard.themeOverrides?.fonts ?? {}).flatMap(([key, stack]) => {
    const used = typeof stack === "string" ? fontStackEntries(stack).flatMap(({ name }) => names.get(name.toLowerCase()) ?? []) : [];
    return used.map(
      (name) =>
        `warn [brand-font] themeOverrides.fonts.${key} uses brand font ${JSON.stringify(name)}: text fitting estimates widths for the bundled fonts, so open the stills and look for text that overflows or wraps badly`,
    );
  });
  return { errors, warnings };
}
