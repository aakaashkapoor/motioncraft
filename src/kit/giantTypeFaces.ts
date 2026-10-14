// GiantType's faces and their measured metrics: each letter's advance, ink
// extents and kerning, read in Chrome from the bundled fonts by
// `scripts/build-giant-metrics.ts` (opentype.js cannot instance variable
// fonts at a weight). With them the word is set at an exact width, letter by
// letter, with no browser measuring at render time. Pure; runs in tests.

import { GEIST_FAMILY, SANS_FAMILY, SERIF_FAMILY } from "../render/fontFaces";
import metrics from "./giantTypeMetrics.json";

/** A face GiantType sets words in: a family at one weight. */
export interface GiantFace {
  key: string;
  family: string;
  weight: number;
}

/** The display sans at its heaviest weight (Source Sans 3 and Geist), and the display serif. */
export const GIANT_FACES: readonly GiantFace[] = [
  { key: "sans", family: SANS_FAMILY, weight: 900 },
  { key: "geist", family: GEIST_FAMILY, weight: 900 },
  { key: "serif", family: SERIF_FAMILY, weight: 500 },
];

/** Characters GiantType can set (the metrics cover exactly these). */
export const GIANT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?'&-:";

/** One character in em: its advance, and its ink from the pen (left, right) and from the baseline (top up, bottom down). */
export type GlyphMetrics = [advance: number, left: number, right: number, top: number, bottom: number];

/** The italic's lean, degrees: the bundled sans has no italic, so the heavy face is skewed (CSS `skewX(-deg)` about the baseline). */
export const ITALIC_SKEW_DEG = 11;

export interface FaceMetrics {
  /** The font's own ascent and descent (what CSS lays a line box out with), em. */
  ascent: number;
  descent: number;
  glyphs: Record<string, GlyphMetrics>;
  /** Kerning between two characters, em, keyed by the pair; pairs without kerning are left out. */
  kern: Record<string, number>;
  /** Each character's ink left and right from the pen when leaning by ITALIC_SKEW_DEG, em (sans faces only). */
  lean?: Record<string, [left: number, right: number]>;
}

export type GiantMetrics = Record<string, FaceMetrics>;

const table = metrics as unknown as GiantMetrics;

/** The face for a style: the serif for `serif`, else the theme's display family when it is Geist, else Source Sans 3. */
export function giantFace(display: string, serif: boolean): GiantFace {
  const key = serif ? "serif" : display.includes(GEIST_FAMILY) && !display.includes(SANS_FAMILY) ? "geist" : "sans";
  return GIANT_FACES.find((f) => f.key === key)!;
}

export function faceMetrics(face: GiantFace): FaceMetrics {
  const found = table[face.key];
  if (found === undefined) throw new Error(`GiantType: no metrics for face ${face.key}; run npx tsx scripts/build-giant-metrics.ts`);
  return found;
}

/** One letter set in a word, em, with the pen starting at 0. */
export interface SetLetter {
  char: string;
  /** The pen position: where the glyph's origin goes. */
  x: number;
  /** Its ink, absolute in the word (x) and from the baseline (top up, bottom down). */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SetWord {
  letters: SetLetter[];
  /** The ink's left and right edges, and its top and bottom from the baseline, over every letter (spaces have none). */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** right - left: the width the eye sees. */
  width: number;
  /**
   * The letters' text boxes (each glyph's advance by the font's ascent and
   * descent, leaning with the italic): what the browser, and so the checks,
   * report as the text's box. Left and right edges, same origin as the ink.
   */
  boxLeft: number;
  boxRight: number;
}

/**
 * The word set in `face` with `tracking` em between letters (kerning
 * applied). With `italic`, each letter leans right about the baseline by
 * ITALIC_SKEW_DEG, and the ink extents are the leaning glyph's.
 */
export function setWord(text: string, face: GiantFace, tracking: number, italic = false): SetWord {
  const { glyphs, kern, lean, ascent, descent } = faceMetrics(face);
  const slope = italic ? Math.tan((ITALIC_SKEW_DEG * Math.PI) / 180) : 0;
  const boxes: Array<[number, number]> = [];
  if (italic && lean === undefined) throw new Error(`GiantType: no leaning metrics for face ${face.key}`);
  const chars = [...text];
  const letters: SetLetter[] = [];
  let pen = 0;
  chars.forEach((char, i) => {
    const g = glyphs[char];
    if (g === undefined) throw new Error(`GiantType: no metrics for ${JSON.stringify(char)}`);
    const [advance, left, right, top, bottom] = g;
    const [inkLeft, inkRight] = italic && char !== " " ? lean![char]! : [left, right];
    letters.push({ char, x: pen, left: pen + inkLeft, right: pen + inkRight, top, bottom });
    if (char !== " ") boxes.push([pen - descent * slope, pen + advance + ascent * slope]);
    const next = chars[i + 1];
    if (next !== undefined) pen += advance + tracking + (kern[char + next] ?? 0);
  });
  const inked = letters.filter((l) => l.char !== " ");
  const left = Math.min(...inked.map((l) => l.left));
  const right = Math.max(...inked.map((l) => l.right));
  return {
    letters,
    left,
    right,
    top: Math.max(...inked.map((l) => l.top)),
    bottom: Math.max(...inked.map((l) => l.bottom)),
    width: right - left,
    boxLeft: Math.min(...boxes.map((b) => b[0])),
    boxRight: Math.max(...boxes.map((b) => b[1])),
  };
}
