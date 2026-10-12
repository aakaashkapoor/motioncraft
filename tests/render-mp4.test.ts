import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { avcCColor } from "../src/render/avcSps";
import { colrBox, Mp4Writer } from "../src/render/mp4";
import { colorLabel, describeMp4Color, readMp4Color } from "../src/render/mp4Color";
import { BT709_LIMITED } from "../src/render/yuv";

// avcC records from Chrome's software H.264 encoder, 1920x1080 at 30 fps (the first from a real render before this change).
/** The old RGBA path: full range, sRGB transfer (ffprobe: yuvj420p(pc, bt709/bt709/iec61966-2-1)). */
const AVCC_FULL_SRGB = Buffer.from("01640c28ffe1001467640c28ac18d00f0044fcb37010d0107844235001000468ce3c80fdf8f800", "hex");
/** An I420 frame tagged limited BT.709. */
const AVCC_LIMITED_709 = Buffer.from("01640c28ffe1001467640c28ac18d00f0044fcb3501010107844235001000468ce3c80fdf8f800", "hex");
/** Chrome's hardware encoder: no VUI colour description at all. */
const AVCC_NO_VUI = Buffer.from("01640032ffe1001967640032ac2b403c0113f2e022000007d00001d4c01e38554001000468ee3cb0fdf8f800", "hex");

const LIMITED_709 = { primaries: 1, transfer: 1, matrix: 1, fullRange: false };

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "motioncraft-mp4-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("colrBox", () => {
  it("writes limited-range BT.709 with the full-range bit clear", () => {
    const colr = Buffer.concat(colrBox(BT709_LIMITED));
    // size 19, "colr", "nclx", primaries 1, transfer 1, matrix 1, then the full_range_flag byte.
    expect(colr.toString("hex")).toBe("00000013" + "636f6c72" + "6e636c78" + "0001" + "0001" + "0001" + "00");
    expect(colr[18]! & 0x80).toBe(0);
  });

  it("sets the full-range bit only for a full-range color space", () => {
    const colr = Buffer.concat(colrBox({ ...BT709_LIMITED, fullRange: true }));
    expect(colr[18]).toBe(0x80);
  });
});

describe("avcCColor", () => {
  it("reads the colour description from the SPS VUI", () => {
    expect(avcCColor(AVCC_LIMITED_709)).toEqual(LIMITED_709);
    expect(avcCColor(AVCC_FULL_SRGB)).toEqual({ primaries: 1, transfer: 13, matrix: 1, fullRange: true });
  });

  it("is undefined when the SPS has no video signal type", () => {
    expect(avcCColor(AVCC_NO_VUI)).toBeUndefined();
  });
});

describe("readMp4Color", () => {
  const write = async (name: string, avcC: Buffer, colorSpace?: VideoColorSpaceInit) => {
    const path = join(dir, name);
    const writer = await Mp4Writer.create(path);
    await writer.addSample(Buffer.alloc(16, 1), true);
    await writer.finish({ width: 1920, height: 1080, fps: 30, avcC, ...(colorSpace === undefined ? {} : { colorSpace }) });
    return readMp4Color(path);
  };

  it("reads back the colr box and the SPS, and they agree for limited BT.709", async () => {
    const color = await write("limited.mp4", AVCC_LIMITED_709, BT709_LIMITED);
    expect(color).toEqual({ colr: LIMITED_709, sps: LIMITED_709 });
    expect(describeMp4Color(color)).toBe("bt709 limited");
  });

  it("names the old full-range sRGB output", async () => {
    const color = await write("full.mp4", AVCC_FULL_SRGB, { primaries: "bt709", transfer: "iec61966-2-1", matrix: "bt709", fullRange: true });
    expect(describeMp4Color(color)).toBe("bt709/iec61966-2-1/bt709 full");
  });

  it("says when the colr box and the stream disagree, or only one says", async () => {
    expect(describeMp4Color(await write("mismatch.mp4", AVCC_FULL_SRGB, BT709_LIMITED))).toBe(
      "colr bt709 limited but H.264 bt709/iec61966-2-1/bt709 full",
    );
    expect(describeMp4Color(await write("colr-only.mp4", AVCC_NO_VUI, BT709_LIMITED))).toBe("bt709 limited (colr only)");
    expect(describeMp4Color(await write("none.mp4", AVCC_NO_VUI))).toBe("colour unspecified");
  });

  it("labels each part by name", () => {
    expect(colorLabel({ primaries: 1, transfer: 1, matrix: 1, fullRange: true })).toBe("bt709 full");
    expect(colorLabel({ primaries: 9, transfer: 16, matrix: 9, fullRange: false })).toBe("bt2020/pq/bt2020-ncl limited");
  });
});
