// The Geist Bold typeface for 3D text: Geist's static Bold TTF
// (assets/fonts/Geist-Bold.ttf, see licenses/README.md) converted to three.js
// typeface JSON for the characters 3D titles need.
// `scripts/build-typeface.ts` writes it to GEIST_BOLD_TYPEFACE; a test checks
// the committed file matches what this builds.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FONTS_DIR } from "../render/fonts";
import { parseFont, typefaceFromFont } from "./typeface";

export const GEIST_BOLD_TTF = join(FONTS_DIR, "Geist-Bold.ttf");
export const GEIST_BOLD_TYPEFACE = join(FONTS_DIR, "Geist-Bold.typeface.json");

/** Printable ASCII (U+0020-U+007E). */
const ASCII = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).join("");
/** Common punctuation, currency and symbols beyond ASCII. */
const EXTRA = "€£¥¢–—‘’“”…•°×÷©®™";

export const TYPEFACE_CHARS = ASCII + EXTRA;

/** The typeface JSON text (stable across runs and platforms; LF, trailing newline). */
export function buildGeistBoldTypeface(): string {
  const font = parseFont(readFileSync(GEIST_BOLD_TTF));
  if (font.tables.os2?.usWeightClass !== 700) throw new Error(`${GEIST_BOLD_TTF} is not the Bold (weight 700) face`);
  const typeface = typefaceFromFont(font, {
    chars: TYPEFACE_CHARS,
    cssFontWeight: "bold",
    styleName: "Bold",
    generatedBy: "motioncraft scripts/build-typeface.ts from Geist-Bold.ttf",
  });
  return `${JSON.stringify(typeface)}\n`;
}
