// Generates small media files for tests: PNG images (encoded here with zlib)
// and H.264 MP4 clips whose frames show their own frame number, encoded in the
// installed browser with the renderer's own encoder and MP4 writer. The files in
// tests/fixtures/media/ were made with these helpers (original, no license needed).

import { writeFile } from "node:fs/promises";
import { crc32, deflateSync } from "node:zlib";
import { neutralTheme } from "../src/index";
import { Mp4Writer, type Mp4Track } from "../src/render/mp4";
import { withRenderPage } from "../src/render/session";
import type { Storyboard } from "../src/storyboard/types";

export type Rgb = readonly [number, number, number];

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An 8-bit RGB PNG where `pixel(x, y)` gives each pixel's color. */
export function encodePng(width: number, height: number, pixel: (x: number, y: number) => Rgb): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit, truecolor, deflate, no filter, no interlace
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), row + 1 + x * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Bits shown by each frame of a test clip: one vertical stripe per bit, lowest bit at the left. */
export const CLIP_BITS = 6;
/** A set bit: a bright block. A clear bit: a dark one. Far apart in luma, so they survive two encodes. */
export const BIT_ON: Rgb = [250, 200, 40];
export const BIT_OFF: Rgb = [20, 30, 70];

/** Frame `n` of a test clip: `CLIP_BITS` big color blocks spelling `n` in binary. */
export function clipFramePixel(n: number, width: number): (x: number) => Rgb {
  return (x) => ((n >> Math.floor((x * CLIP_BITS) / width)) & 1 ? BIT_ON : BIT_OFF);
}

/** Reads the frame number back from luma samples at the center of each stripe (lowest bit first). */
export function decodeFrameNumber(lumas: readonly number[]): number {
  return lumas.reduce((n, luma, bit) => (luma > 128 ? n | (1 << bit) : n), 0);
}

export interface TestClipOptions {
  frames: number;
  fps: number;
  width: number;
  height: number;
}

const TRIVIAL: Storyboard = {
  title: "encoder",
  aspect: "16:9",
  fps: 30,
  theme: "neutral",
  scenes: [{ id: "a", component: "TitleCard", props: { title: "x" }, durationMs: 100 }],
};

/** Writes an H.264 MP4 to `path` whose frame `n` shows `n` (see `clipFramePixel`). */
export async function writeTestClip(path: string, { frames, fps, width, height }: TestClipOptions): Promise<void> {
  await withRenderPage({ storyboard: TRIVIAL, theme: neutralTheme, durations: {} }, async (page) => {
    const start = await page.evaluate((setup) => window.motioncraft!.encoder.start(setup), { width, height, fps });
    if (start.codec === null) throw new Error(`cannot encode H.264: ${start.tried.join(", ")}`);
    const writer = await Mp4Writer.create(path);
    let track: Mp4Track | undefined;
    const write = async (chunks: Awaited<ReturnType<NonNullable<typeof window.motioncraft>["encoder"]["finish"]>>) => {
      for (const c of chunks) {
        if (c.config !== undefined) {
          track = { width, height, fps, avcC: Buffer.from(c.config.description, "base64"), colorSpace: c.config.colorSpace };
        }
        await writer.addSample(Buffer.from(c.data, "base64"), c.keyFrame);
      }
    };
    try {
      for (let n = 0; n < frames; n++) {
        const pixel = clipFramePixel(n, width);
        const png = encodePng(width, height, (x) => pixel(x)).toString("base64");
        await write(await page.evaluate(([data, i]) => window.motioncraft!.encoder.encodeFrame(data, i), [png, n] as const));
      }
      await write(await page.evaluate(() => window.motioncraft!.encoder.finish()));
      if (track === undefined) throw new Error("encoder gave no avcC");
      await writer.finish(track);
    } catch (error) {
      await writer.abort();
      throw error;
    }
  });
}

/** Writes a PNG to `path`. */
export async function writeTestPng(path: string, width: number, height: number, pixel: (x: number, y: number) => Rgb): Promise<void> {
  await writeFile(path, encodePng(width, height, pixel));
}
