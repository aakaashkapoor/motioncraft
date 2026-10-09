import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neutralTheme, validateStoryboard } from "../src/index";
import { parseRenderArgs } from "../src/render/args";
import { BrowserNotFoundError } from "../src/render/browser";
import {
  avcCodecCandidates,
  avcLevel,
  encodePlan,
  frameTimestampUs,
  keyframeInterval,
  MAX_KEYFRAME_SECONDS,
} from "../src/render/encode";
import { colrBox, Mp4Writer } from "../src/render/mp4";
import { renderVideo, UnsupportedCodecError, type VideoProgress } from "../src/render/video";
import { summarizeMp4 } from "./mp4box";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "motioncraft-video-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("encode plan", () => {
  it("puts frame n at n/fps seconds, in whole microseconds", () => {
    expect(frameTimestampUs(0, 30)).toBe(0);
    expect(frameTimestampUs(1, 30)).toBe(33_333);
    expect(frameTimestampUs(2, 30)).toBe(66_667);
    expect(frameTimestampUs(30, 30)).toBe(1_000_000);
    expect(frameTimestampUs(7, 7)).toBe(1_000_000);
  });

  it("gives every frame a duration that ends where the next frame starts", () => {
    const plan = encodePlan(90, 30);
    expect(plan).toHaveLength(90);
    plan.forEach((frame, n) => {
      expect(frame.frame).toBe(n);
      expect(frame.timestampUs + frame.durationUs).toBe(frameTimestampUs(n + 1, 30));
    });
    const last = plan.at(-1)!;
    expect(last.timestampUs + last.durationUs).toBe(3_000_000);
  });

  it("starts with a keyframe and has one at least every 2 seconds", () => {
    for (const fps of [1, 7, 24, 25, 30, 60]) {
      const plan = encodePlan(fps * 7, fps);
      const keys = plan.filter((f) => f.keyFrame).map((f) => f.frame);
      expect(keys[0]).toBe(0);
      for (const [i, key] of keys.entries()) {
        const next = keys[i + 1] ?? plan.length;
        expect((next - key) / fps).toBeLessThanOrEqual(MAX_KEYFRAME_SECONDS);
      }
    }
    expect(keyframeInterval(30)).toBe(60);
    expect(keyframeInterval(1)).toBe(2);
    expect(
      encodePlan(150, 30)
        .filter((f) => f.keyFrame)
        .map((f) => f.frame),
    ).toEqual([0, 60, 120]);
  });

  it("picks the lowest H.264 level for the size and rate", () => {
    expect(avcLevel(1080, 1920, 30)).toBe(0x28); // 4.0
    expect(avcLevel(1920, 1080, 30)).toBe(0x28);
    expect(avcLevel(1080, 1920, 60)).toBe(0x2a); // 4.2
    expect(avcLevel(1080, 1920, 120)).toBe(0x33); // 5.1
    expect(() => avcLevel(1080, 1920, 1000)).toThrow(/cannot encode/);
    expect(avcCodecCandidates(1080, 1920, 30)).toEqual(["avc1.640028", "avc1.4D0028", "avc1.42E028"]);
  });
});

describe("Mp4Writer", () => {
  const track = { width: 1080, height: 1920, fps: 30, avcC: Buffer.from("01640028ff", "hex") };

  it("streams samples into mdat and indexes them in moov", async () => {
    const path = join(dir, "unit.mp4");
    const writer = await Mp4Writer.create(path);
    const samples = [Buffer.alloc(10, 1), Buffer.alloc(20, 2), Buffer.alloc(5, 3), Buffer.alloc(7, 4)];
    for (const [i, sample] of samples.entries()) await writer.addSample(sample, i % 2 === 0);
    await writer.finish(track);

    const data = await readFile(path);
    const mp4 = summarizeMp4(data);
    expect(mp4.topLevel).toEqual(["ftyp", "mdat", "moov"]);
    expect(mp4).toMatchObject({
      width: 1080,
      height: 1920,
      timescale: 30_000,
      durationTicks: 4_000,
      sampleCount: 4,
      sampleSizes: [10, 20, 5, 7],
      timeToSample: [[4, 1_000]],
      syncSamples: [1, 3],
      codec: "avc1",
    });
    expect(mp4.movieSeconds).toBeCloseTo(4 / 30, 3);
    expect(mp4.avcC).toEqual(track.avcC);
    mp4.sampleOffsets.forEach((offset, i) => {
      expect(data.subarray(offset, offset + mp4.sampleSizes[i]!)).toEqual(samples[i]);
    });
  });

  it("requires the first sample to be a keyframe", async () => {
    const writer = await Mp4Writer.create(join(dir, "bad.mp4"));
    await expect(writer.addSample(Buffer.alloc(4), false)).rejects.toThrow(/first sample must be a keyframe/);
    await writer.abort();
  });

  it("writes a colr box only for a complete, known color space", () => {
    const colr = colrBox({ primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false });
    expect(Buffer.concat(colr).toString("hex")).toBe("00000013636f6c726e636c78000100010001" + "00");
    expect(colrBox({ primaries: "bt709" })).toEqual([]);
    expect(colrBox(undefined)).toEqual([]);
  });
});

describe("parseRenderArgs", () => {
  it("parses the storyboard and --out", () => {
    expect(parseRenderArgs(["sb.json", "--out", "out/video.mp4"])).toEqual({ storyboard: "sb.json", out: "out/video.mp4" });
  });

  it("rejects bad usage", () => {
    expect(() => parseRenderArgs(["--out", "a.mp4"])).toThrow(/one storyboard/);
    expect(() => parseRenderArgs(["sb.json"])).toThrow(/--out/);
    expect(() => parseRenderArgs(["sb.json", "--out", "video.mov"])).toThrow(/\.mp4/);
    expect(() => parseRenderArgs(["sb.json", "--out", "a.mp4", "--bogus"])).toThrow();
  });
});

describe("UnsupportedCodecError", () => {
  it("names the browser and the codec", () => {
    const error = new UnsupportedCodecError("Microsoft Edge 120.0", ["avc1.640028 (prefer-software)"]);
    expect(error.message).toMatch(/^Microsoft Edge 120\.0 cannot encode H\.264 video \(avc1\)/);
    expect(error.message).toContain("avc1.640028 (prefer-software)");
  });
});

describe("renderVideo (integration)", () => {
  it("renders a 1-second 9:16 storyboard to a 1080x1920, 30-frame MP4", { timeout: 120_000 }, async (ctx) => {
    const validation = validateStoryboard({
      title: "One second",
      aspect: "9:16",
      fps: 30,
      scenes: [
        {
          id: "only",
          component: "TitleCard",
          props: { title: "One second", subtitle: "of video" },
          narration: "Captions burn in.",
          durationMs: 1000,
        },
      ],
    });
    if (!validation.ok) throw new Error(validation.errors.join("\n"));

    const out = join(dir, "nested", "one-second.mp4");
    const progress: VideoProgress[] = [];
    const result = await renderVideo({
      storyboard: validation.storyboard,
      theme: neutralTheme,
      durations: {},
      out,
      onProgress: (p) => progress.push(p),
    }).catch((error: unknown) => {
      if (error instanceof BrowserNotFoundError) {
        ctx.skip(`no Chrome or Edge installed, skipping video render: ${error.message}`);
      }
      throw error;
    });

    expect(result).toMatchObject({ path: out, width: 1080, height: 1920, fps: 30, frames: 30, durationMs: 1000 });
    expect(result.codec).toMatch(/^avc1\./);
    expect(progress.at(-1)).toEqual({ frames: 30, totalFrames: 30 });

    const data = await readFile(out);
    expect(result.bytes).toBe(data.length);
    expect(data.toString("latin1", 4, 8)).toBe("ftyp");
    const mp4 = summarizeMp4(data);
    expect(mp4.topLevel).toEqual(expect.arrayContaining(["ftyp", "mdat", "moov"]));
    expect(mp4.topLevel[0]).toBe("ftyp");
    expect({ width: mp4.width, height: mp4.height }).toEqual({ width: 1080, height: 1920 });
    expect(mp4.codec).toBe("avc1");
    expect(mp4.sampleCount).toBe(30);
    expect(mp4.timeToSample).toEqual([[30, mp4.timescale / 30]]);
    expect(mp4.durationTicks / mp4.timescale).toBe(1);
    expect(mp4.movieSeconds).toBe(1);
    expect(mp4.syncSamples[0]).toBe(1);
    // Every sample lies inside the file, and the frames are not all empty.
    for (const [i, offset] of mp4.sampleOffsets.entries()) {
      expect(offset + mp4.sampleSizes[i]!).toBeLessThanOrEqual(data.length);
    }
    expect(Math.max(...mp4.sampleSizes)).toBeGreaterThan(1000);
  });
});
