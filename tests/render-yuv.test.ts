import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveTheme, validateStoryboard } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { readMp4Color } from "../src/render/mp4Color";
import { renderStills } from "../src/render/stills";
import { renderVideo } from "../src/render/video";
import { BT709_LIMITED, i420Size, rgbaToI420 } from "../src/render/yuv";
import { framePixels } from "./videoPixels";

type Rgb = readonly [number, number, number];

/** An RGBA image of `width` x `height` where `pixel(x, y)` gives each pixel's color. */
function image(width: number, height: number, pixel: (x: number, y: number) => Rgb): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rgba.set([...pixel(x, y), 255], (y * width + x) * 4);
  }
  return rgba;
}

/** The Y, Cb and Cr planes of an I420 buffer. */
function planes(i420: Uint8Array, width: number, height: number) {
  const cw = Math.ceil(width / 2);
  const ch = Math.ceil(height / 2);
  const ySize = width * height;
  return {
    y: i420.subarray(0, ySize),
    cb: i420.subarray(ySize, ySize + cw * ch),
    cr: i420.subarray(ySize + cw * ch, ySize + 2 * cw * ch),
  };
}

/** Limited-range BT.709 Y, Cb, Cr of an 8-bit RGB color, unrounded. */
function bt709(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map((c) => c / 255) as [number, number, number];
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [16 + 219 * y, 128 + (224 * (b - y)) / 1.8556, 128 + (224 * (r - y)) / 1.5748];
}

const solid = (rgb: Rgb, width = 4, height = 4) => planes(rgbaToI420(image(width, height, () => rgb), width, height), width, height);

describe("rgbaToI420", () => {
  it("sizes the buffer as a full Y plane and two quarter chroma planes", () => {
    expect(rgbaToI420(new Uint8Array(4 * 4 * 4), 4, 4)).toHaveLength(16 + 4 + 4);
    expect(i420Size(1920, 1080)).toBe(1920 * 1080 * 1.5);
    expect(i420Size(3, 3)).toBe(9 + 4 + 4);
    expect(rgbaToI420(new Uint8Array(3 * 3 * 4), 3, 3)).toHaveLength(17);
  });

  it("maps white to Y=235 and neutral chroma", () => {
    const { y, cb, cr } = solid([255, 255, 255]);
    expect(new Set(y)).toEqual(new Set([235]));
    expect(new Set(cb)).toEqual(new Set([128]));
    expect(new Set(cr)).toEqual(new Set([128]));
  });

  it("maps black to Y=16 and neutral chroma", () => {
    const { y, cb, cr } = solid([0, 0, 0]);
    expect(new Set(y)).toEqual(new Set([16]));
    expect(new Set(cb)).toEqual(new Set([128]));
    expect(new Set(cr)).toEqual(new Set([128]));
  });

  it("maps pure red to its BT.709 limited-range values (Y 63, Cb 102, Cr 240)", () => {
    const { y, cb, cr } = solid([255, 0, 0]);
    const [ey, ecb, ecr] = bt709([255, 0, 0]);
    expect(Math.abs(y[0]! - ey)).toBeLessThanOrEqual(1);
    expect(Math.abs(cb[0]! - ecb)).toBeLessThanOrEqual(1);
    expect(Math.abs(cr[0]! - ecr)).toBeLessThanOrEqual(1);
    expect([y[0], cb[0], cr[0]]).toEqual([63, 102, 240]);
  });

  it("stays within ±1 of the exact values for many colors", () => {
    const colors: Rgb[] = [];
    for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) colors.push([r, g, b]);
    colors.push([248, 246, 241], [17, 24, 39], [37, 99, 235]);
    for (const color of colors) {
      const { y, cb, cr } = solid(color, 2, 2);
      const [ey, ecb, ecr] = bt709(color);
      expect(Math.abs(y[0]! - ey), `Y of ${color}`).toBeLessThanOrEqual(1);
      expect(Math.abs(cb[0]! - ecb), `Cb of ${color}`).toBeLessThanOrEqual(1);
      expect(Math.abs(cr[0]! - ecr), `Cr of ${color}`).toBeLessThanOrEqual(1);
    }
  });

  it("gives each pixel its own luma", () => {
    const { y } = planes(rgbaToI420(image(2, 1, (x) => (x === 0 ? [0, 0, 0] : [255, 255, 255])), 2, 1), 2, 1);
    expect([...y]).toEqual([16, 235]);
  });

  it("averages each 2x2 block for chroma", () => {
    // Left block: red, green, blue, white. Right block: all blue.
    const block: Rgb[] = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 255],
    ];
    const rgba = image(4, 2, (x, y) => (x < 2 ? block[y * 2 + x]! : [0, 0, 255]));
    const { cb, cr } = planes(rgbaToI420(rgba, 4, 2), 4, 2);
    const mean = (i: 1 | 2) => block.reduce((sum, c) => sum + bt709(c)[i], 0) / 4;
    expect(Math.abs(cb[0]! - mean(1))).toBeLessThanOrEqual(1);
    expect(Math.abs(cr[0]! - mean(2))).toBeLessThanOrEqual(1);
    expect(Math.abs(cb[1]! - bt709([0, 0, 255])[1])).toBeLessThanOrEqual(1);
    expect(Math.abs(cr[1]! - bt709([0, 0, 255])[2])).toBeLessThanOrEqual(1);
  });

  it("averages the pixels that exist at an odd right and bottom edge", () => {
    // 3x3: the right column and bottom row are red, the rest white.
    const red: Rgb = [255, 0, 0];
    const rgba = image(3, 3, (x, y) => (x === 2 || y === 2 ? red : [255, 255, 255]));
    const { cb, cr } = planes(rgbaToI420(rgba, 3, 3), 3, 3);
    expect([cb[0], cr[0]]).toEqual([128, 128]); // top-left 2x2: all white
    const [, rcb, rcr] = bt709(red);
    for (const i of [1, 2, 3]) {
      // Right column (1x2), bottom row (2x1) and the corner (1x1): all red.
      expect(Math.abs(cb[i]! - rcb)).toBeLessThanOrEqual(1);
      expect(Math.abs(cr[i]! - rcr)).toBeLessThanOrEqual(1);
    }
  });

  it("rejects a buffer of the wrong size", () => {
    expect(() => rgbaToI420(new Uint8Array(10), 2, 2)).toThrow(/2x2/);
  });

  it("names the color space it produces: limited-range BT.709", () => {
    expect(BT709_LIMITED).toEqual({ primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false });
  });
});

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "motioncraft-yuv-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("rendered colour (integration)", () => {
  it("writes limited-range BT.709 that decodes back to the captured pixels", { timeout: 180_000 }, async (ctx) => {
    // The showcase's first 16:9 scene, cut to one second.
    const wide = JSON.parse(await readFile(join("examples", "showcase", "storyboard-wide.json"), "utf8"));
    const { transition: _, narration: __, ...hook } = wide.scenes[0];
    const validation = validateStoryboard({ ...wide, scenes: [{ ...hook, durationMs: 1000 }] });
    if (!validation.ok) throw new Error(validation.errors.join("\n"));
    const { storyboard } = validation;
    const input = { storyboard, theme: resolveTheme(storyboard), durations: {}, mediaDir: join("examples", "showcase") };

    const out = join(dir, "hook.mp4");
    const frame = 15;
    const [stills] = await Promise.all([renderStills({ ...input, frames: [frame], outDir: dir }), renderVideo({ ...input, out })]).catch(
      (error: unknown) => {
        if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
        throw error;
      },
    );

    const limited709 = { primaries: 1, transfer: 1, matrix: 1, fullRange: false };
    expect(await readMp4Color(out)).toEqual({ colr: limited709, sps: limited709 });

    // Flat ground near two corners, clear of the content.
    const points = [
      [40, 40],
      [1880, 1040],
    ] as const;
    const { video, png } = await framePixels(out, stills![0]!, frame, storyboard.fps, points);
    for (const [i, point] of points.entries()) {
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(video[i]![c]! - png[i]![c]!), `channel ${c} at ${point}: video ${video[i]} vs png ${png[i]}`).toBeLessThanOrEqual(4);
      }
    }
  });
});
