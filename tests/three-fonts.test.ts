// 3D text: the Geist Bold typeface (Geist's static Bold TTF converted by
// src/typeface) parses with three's FontLoader, covers the characters titles
// use, has the right outlines, and makes real geometry; the committed JSON is
// what the build script makes now.

import { readFileSync } from "node:fs";
import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { describe, expect, it } from "vitest";
import { geistBold, textGeometry } from "../src/kit/three";
import { buildGeistBoldTypeface, GEIST_BOLD_TTF, GEIST_BOLD_TYPEFACE, TYPEFACE_CHARS } from "../src/typeface/geistBold";
import { outlineOf, parseFont, type TypefaceJson } from "../src/typeface/typeface";

const SAMPLE = "motioncraft 0123 $%&";
const committed = () => JSON.parse(readFileSync(GEIST_BOLD_TYPEFACE, "utf8")) as TypefaceJson;

interface Box {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

/** The bounding box of each contour (each `m`) of a glyph's outline. */
function contours(char: string): Box[] {
  const tokens = committed().glyphs[char]!.o!.split(" ");
  const boxes: Box[] = [];
  for (let i = 0; i < tokens.length; ) {
    const op = tokens[i++]!;
    const count = { m: 2, l: 2, q: 4, b: 6 }[op as "m" | "l" | "q" | "b"];
    const values = tokens.slice(i, i + count).map(Number);
    i += count;
    if (op === "m") boxes.push({ xMin: Infinity, yMin: Infinity, xMax: -Infinity, yMax: -Infinity });
    const box = boxes.at(-1)!;
    for (let k = 0; k < values.length; k += 2) {
      box.xMin = Math.min(box.xMin, values[k]!);
      box.xMax = Math.max(box.xMax, values[k]!);
      box.yMin = Math.min(box.yMin, values[k + 1]!);
      box.yMax = Math.max(box.yMax, values[k + 1]!);
    }
  }
  return boxes;
}
const byTop = (boxes: Box[]) => [...boxes].sort((a, b) => b.yMax - a.yMax);
const byLeft = (boxes: Box[]) => [...boxes].sort((a, b) => a.xMin - b.xMin);

describe("Geist Bold typeface", () => {
  it("parses with FontLoader and has a glyph for every character of the sample and the whole set", () => {
    const font = new FontLoader().parse(committed());
    for (const char of SAMPLE + TYPEFACE_CHARS) expect(font.data.glyphs[char], char).toBeDefined();
    expect(font.data.resolution).toBe(1000);
    expect(font.data.familyName).toBe("Geist");
    // Every inked glyph has an outline; the space is blank but has an advance.
    for (const char of TYPEFACE_CHARS.replace(" ", "")) expect(font.data.glyphs[char]!.o, char).toMatch(/^m /);
    expect(font.data.glyphs[" "]!.ha).toBeGreaterThan(0);
    expect(font.data.glyphs[" "]!.o).toBeUndefined();
  });

  it("is made from Geist's static Bold face", () => {
    const font = parseFont(readFileSync(GEIST_BOLD_TTF));
    expect(font.tables.os2?.usWeightClass).toBe(700);
    expect(font.names.windows?.fontFamily?.en).toBe("Geist");
    expect(font.names.windows?.fontSubfamily?.en).toBe("Bold");
  });

  // Reference values from the static Bold TTF (and fontTools' instancer at
  // wght 700); an instancer that skips composite offsets or misreads sparse
  // gvar tuples fails these.
  it("places composite parts and sparse-delta glyphs where Bold has them", () => {
    // ':' is two dots; the upper one's foot is at Bold's 356 (Regular's offset gives 393).
    const [upper, lower] = byTop(contours(":"));
    expect(lower!.yMin).toBeCloseTo(0, 0);
    expect(upper!.yMin).toBeGreaterThan(340);
    expect(upper!.yMin).toBeLessThan(375);
    // '…' is three dots across the Bold advance.
    const dots = byLeft(contours("…"));
    expect(dots).toHaveLength(3);
    expect(committed().glyphs["…"]!.x_max).toBeGreaterThan(640);
    const gaps = [dots[1]!.xMin - dots[0]!.xMin, dots[2]!.xMin - dots[1]!.xMin];
    expect(Math.abs(gaps[1]! - gaps[0]!)).toBeLessThanOrEqual(2);
    // '®' stays inside the cap height.
    expect(Math.max(...contours("®").map((b) => b.yMax))).toBeLessThanOrEqual(730);
    expect(committed().boundingBox.yMax).toBeLessThanOrEqual(1000);
    // 'i': the dot sits over the stem, a clear gap above it.
    for (const char of "ij") {
      const [dot, stem] = byTop(contours(char));
      const gap = dot!.yMin - stem!.yMax;
      expect(gap, char).toBeGreaterThan(40);
      expect(gap, char).toBeLessThan(120);
      expect(Math.abs(dot!.xMax - stem!.xMax), char).toBeLessThan(10);
    }
  });

  it("makes centred text geometry with vertices", () => {
    const geometry = textGeometry(SAMPLE, { size: 1 });
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const size = box.getSize(new THREE.Vector3());
    expect(geometry.getAttribute("position").count).toBeGreaterThan(1000);
    expect(size.x).toBeGreaterThan(8);
    expect(size.y).toBeGreaterThan(0.6);
    expect(size.z).toBeCloseTo(0.25 + 2 * 0.02, 3);
    const centre = box.getCenter(new THREE.Vector3());
    expect(centre.length()).toBeLessThan(1e-6);
    expect(geistBold()).toBe(geistBold());
  });

  it("is up to date with scripts/build-typeface.ts", () => {
    // Parsed, so a checkout that rewrites line endings still compares equal.
    expect(JSON.parse(buildGeistBoldTypeface())).toEqual(committed());
  });
});

describe("typeface outline", () => {
  it("writes end points before control points, as three's Font reads them, and drops zero-length lines", () => {
    expect(
      outlineOf([
        { type: "M", x: 0, y: 0 },
        { type: "L", x: 0, y: 0 },
        { type: "L", x: 10, y: -0.04 },
        { type: "Q", x1: 15, y1: 5, x: 20.25, y: 10 },
        { type: "C", x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 },
        { type: "Z" },
      ]),
    ).toBe("m 0 0 l 10 0 q 20.3 10 15 5 b 5 6 1 2 3 4");
  });
});
