// Converts a font into three.js typeface JSON, the format `FontLoader` and
// `TextGeometry` read (the format facetype.js writes): per-glyph advance,
// x extent and an outline string, in font units (`resolution` = units per
// em). It takes a static font (one weight) as is: no variable-font
// instancing, since opentype.js 2.0.0 gets composite glyphs and some sparse
// gvar deltas wrong. Build-time only: opentype.js is a dev dependency and
// never reaches the render page.

import opentype from "opentype.js";
import type { FontData } from "three/examples/jsm/loaders/FontLoader.js";

// The slice of opentype.js 2.x this file uses. The installed @types describe
// opentype.js 1.x, whose `names` and path commands differ, so the shapes are
// declared here.
interface PathCommand {
  type: "M" | "L" | "Q" | "C" | "Z";
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}
interface OtGlyph {
  index: number;
  advanceWidth?: number;
  path: { commands: PathCommand[] };
}
type LocalizedName = Record<string, string> | undefined;
interface OtFont {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  names: { windows?: Record<string, LocalizedName> };
  tables: { post?: { underlinePosition?: number; underlineThickness?: number }; os2?: { usWeightClass?: number } };
  charToGlyph(char: string): OtGlyph;
  hasChar(char: string): boolean;
}

/** typeface JSON, as `FontLoader.parse` reads it (plus the CSS fields facetype.js writes). */
export interface TypefaceJson extends FontData {
  cssFontWeight: string;
  cssFontStyle: string;
}

export interface TypefaceOptions {
  /** The characters to include. */
  chars: string;
  /** CSS weight recorded in the JSON. */
  cssFontWeight: string;
  /** Style name recorded in `original_font_information`, e.g. "Bold". */
  styleName: string;
  /** A note on how the file was made, recorded in `original_font_information`. */
  generatedBy: string;
}

/** A coordinate rounded to 0.1 font units, without "-0" (TrueType curves put implied points on halves). */
function fmt(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded === 0 ? 0 : rounded);
}

/**
 * The typeface outline of path commands (y up, font units): `m x y`, `l x y`,
 * `q x y cx cy` and `b x y c1x c1y c2x c2y`, end point first, as three's
 * `Font` reads them. Zero-length lines are dropped.
 */
export function outlineOf(commands: readonly PathCommand[]): string {
  const out: string[] = [];
  let cx = Number.NaN;
  let cy = Number.NaN;
  for (const c of commands) {
    if (c.type === "Z") continue;
    const x = fmt(c.x!);
    const y = fmt(c.y!);
    if (c.type === "M") out.push("m", x, y);
    else if (c.type === "L") {
      if (x === fmt(cx) && y === fmt(cy)) continue;
      out.push("l", x, y);
    } else if (c.type === "Q") out.push("q", x, y, fmt(c.x1!), fmt(c.y1!));
    else out.push("b", x, y, fmt(c.x1!), fmt(c.y1!), fmt(c.x2!), fmt(c.y2!));
    cx = c.x!;
    cy = c.y!;
  }
  return out.join(" ");
}

/** The extent of a path's on- and off-curve points (0, 0 when empty). */
function extentOf(commands: readonly PathCommand[]): { min: number; max: number; yMin: number; yMax: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const c of commands) {
    for (const [x, y] of [[c.x, c.y], [c.x1, c.y1], [c.x2, c.y2]] as const) {
      if (x !== undefined && y !== undefined) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length === 0) return { min: 0, max: 0, yMin: 0, yMax: 0 };
  return { min: Math.min(...xs), max: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
}

/** Parses font bytes (TTF/OTF/WOFF; not WOFF2) with opentype.js. */
export function parseFont(sfnt: Uint8Array): OtFont {
  const buffer = sfnt.buffer.slice(sfnt.byteOffset, sfnt.byteOffset + sfnt.byteLength);
  return opentype.parse(buffer) as unknown as OtFont;
}

/** Builds the typeface JSON for `chars` of `font`. Throws if the font lacks one of them. */
export function typefaceFromFont(font: OtFont, options: TypefaceOptions): TypefaceJson {
  const glyphs: FontData["glyphs"] = {};
  const box = { xMin: Infinity, yMin: Infinity, xMax: -Infinity, yMax: -Infinity };
  for (const char of Array.from(new Set(Array.from(options.chars)))) {
    if (!font.hasChar(char)) throw new Error(`typeface: the font has no glyph for "${char}" (U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`);
    const glyph = font.charToGlyph(char);
    const commands = glyph.path.commands;
    const extent = extentOf(commands);
    const o = outlineOf(commands);
    glyphs[char] = { ha: Math.round(glyph.advanceWidth ?? 0), x_min: Math.round(extent.min), x_max: Math.round(extent.max), ...(o === "" ? {} : { o }) };
    if (o !== "") {
      box.xMin = Math.min(box.xMin, extent.min);
      box.yMin = Math.min(box.yMin, extent.yMin);
      box.xMax = Math.max(box.xMax, extent.max);
      box.yMax = Math.max(box.yMax, extent.yMax);
    }
  }
  const names = font.names.windows ?? {};
  const name = (key: string) => names[key]?.en ?? "";
  const info: Record<string, string> = {
    fontFamily: name("fontFamily"),
    fontSubfamily: options.styleName,
    fullName: `${name("fontFamily")} ${options.styleName}`,
    version: name("version"),
    copyright: name("copyright"),
    license: name("license"),
    licenseURL: name("licenseURL"),
    generatedBy: options.generatedBy,
  };
  return {
    glyphs,
    familyName: name("fontFamily"),
    ascender: Math.round(font.ascender),
    descender: Math.round(font.descender),
    underlinePosition: Math.round(font.tables.post?.underlinePosition ?? 0),
    underlineThickness: Math.round(font.tables.post?.underlineThickness ?? 0),
    boundingBox: { yMin: Math.round(box.yMin), xMin: Math.round(box.xMin), yMax: Math.round(box.yMax), xMax: Math.round(box.xMax) },
    resolution: font.unitsPerEm,
    original_font_information: info,
    cssFontWeight: options.cssFontWeight,
    cssFontStyle: "normal",
  };
}
