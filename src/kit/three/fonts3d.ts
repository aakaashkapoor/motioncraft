// The typeface for 3D text and a helper that makes text geometry from it.
// Geist Bold (assets/fonts/Geist-Bold.typeface.json, made by
// scripts/build-typeface.ts) is imported as JSON, so esbuild inlines it into
// the render page: nothing is fetched and nothing is async, so 3D text needs
// no `useThreeAsset`. It covers printable ASCII plus common punctuation and
// currency (see `TYPEFACE_CHARS` in src/typeface/geistBold.ts); a character
// outside that set draws as "?".

import { Font } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import geistBoldData from "../../../assets/fonts/Geist-Bold.typeface.json";

let geist: Font | undefined;

/** Geist Bold as a three.js `Font`, parsed once. */
export function geistBold(): Font {
  geist ??= new Font(geistBoldData);
  return geist;
}

export interface TextGeometryOptions {
  /** Cap-ish size: the em size of the text, in scene units. */
  size: number;
  /** Extrusion depth. Default: a quarter of `size`. */
  depth?: number;
  /** Bevel thickness and size; 0 for a sharp edge. Default: 2% of `size`. */
  bevel?: number;
  /** Points per curve segment of each glyph outline. Default: 8. */
  curveSegments?: number;
  /** Default: Geist Bold. */
  font?: Font;
}

/**
 * Extruded text, centred on the origin in x, y and z (its bounding box's
 * centre), so it turns about its middle. The caller owns the geometry.
 */
export function textGeometry(text: string, { size, depth = size * 0.25, bevel = size * 0.02, curveSegments = 8, font = geistBold() }: TextGeometryOptions): TextGeometry {
  const geometry = new TextGeometry(text, {
    font,
    size,
    depth,
    curveSegments,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 3,
  });
  geometry.center();
  return geometry;
}
