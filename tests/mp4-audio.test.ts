import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Mp4Writer, type Mp4AudioTrack } from "../src/render/mp4";
import { findBox, readBoxes, summarizeMp4, summarizeTracks } from "./mp4box";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "motioncraft-mp4-audio-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const video = { width: 1080, height: 1920, fps: 30, avcC: Buffer.from("01640028ff", "hex"), colorSpace: { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false } } as const;

async function writeVideoOnly(path: string): Promise<Buffer> {
  const writer = await Mp4Writer.create(path);
  for (let i = 0; i < 5; i++) await writer.addSample(Buffer.alloc(10 + i, i + 1), i % 2 === 0);
  await writer.finish(video);
  return readFile(path);
}

describe("Mp4Writer, video only", () => {
  it("writes exactly the bytes it always has (no audio track, no changes to the boxes)", async () => {
    const data = await writeVideoOnly(join(dir, "pinned.mp4"));
    // Pinned from the writer before audio support. If this changes, silent MP4s changed.
    expect(createHash("sha256").update(data).digest("hex")).toBe("9d11a03fcaad95d7cc4a7fd6701401b9e6f057851565cd72df19cf74d2104e9a");
  });
});

/** An MPEG-4 descriptor at `offset`: tag, 7-bit-group length, body, and where it ends in `bytes`. */
function descriptor(bytes: Buffer, offset: number): { tag: number; body: Buffer; end: number } {
  let at = offset + 1;
  let length = 0;
  for (;;) {
    const byte = bytes[at++]!;
    length = (length << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return { tag: bytes[offset]!, body: bytes.subarray(at, at + length), end: at + length - offset };
}

const asc = Buffer.from("1188", "hex"); // AAC-LC, 48 kHz, mono
const PRIMING = 1024;
const aac: Mp4AudioTrack = { codec: "mp4a", sampleRate: 48_000, channels: 1, description: asc, primingTicks: PRIMING };
const dOps = Buffer.from("0001013880bb0000000000", "hex");

async function writeWithAudio(path: string, audio: Mp4AudioTrack, frames = 5): Promise<{ data: Buffer; samples: Buffer[] }> {
  const writer = await Mp4Writer.create(path);
  for (let i = 0; i < frames; i++) await writer.addSample(Buffer.alloc(10 + i, i + 1), i % 2 === 0);
  const samples = Array.from({ length: 10 }, (_, i) => Buffer.alloc(5 + i, 0xa0 + i));
  // Ticks are in the audio timescale; the last frame is shorter. 9916 ticks cover the 5 video frames (8016 ticks) plus the priming.
  const ticks = [...Array.from({ length: 9 }, () => 1024), 700];
  for (const [i, sample] of samples.entries()) writer.addAudioSample(sample, ticks[i]!);
  await writer.finish(video, audio);
  return { data: await readFile(path), samples };
}

describe("Mp4Writer, with an audio track", () => {
  it("writes two traks: video as track 1, audio as track 2 with full volume", async () => {
    const { data } = await writeWithAudio(join(dir, "aac.mp4"), aac);
    const [v, a] = summarizeTracks(data);
    expect(summarizeTracks(data)).toHaveLength(2);
    expect(v).toMatchObject({ trackId: 1, volume: 0, handler: "vide", mediaHeader: "vmhd", entry: "avc1" });
    expect(a).toMatchObject({ trackId: 2, volume: 1, handler: "soun", mediaHeader: "smhd", entry: "mp4a" });
    expect(summarizeMp4(data).topLevel).toEqual(["ftyp", "mdat", "moov"]);
  });

  it("describes AAC with an esds box carrying the AudioSpecificConfig", async () => {
    const { data } = await writeWithAudio(join(dir, "esds.mp4"), aac);
    const a = summarizeTracks(data)[1]!;
    expect(a).toMatchObject({ channels: 1, sampleRate: 48_000, timescale: 48_000, configType: "esds" });
    // version/flags, then ES_Descriptor > DecoderConfig > DecoderSpecificInfo, and SLConfig.
    expect(a.config.subarray(0, 4)).toEqual(Buffer.alloc(4));
    const es = descriptor(a.config, 4);
    expect(es.tag).toBe(0x03);
    const decoderConfig = descriptor(es.body, 3); // ES_ID (2) and flags (1) first
    expect(decoderConfig.tag).toBe(0x04);
    expect(decoderConfig.body[0]).toBe(0x40); // MPEG-4 audio
    expect(decoderConfig.body[1]).toBe(0x15); // audio stream
    const specific = descriptor(decoderConfig.body, 13);
    expect(specific.tag).toBe(0x05);
    expect(specific.body).toEqual(asc);
    const sl = descriptor(es.body, 3 + decoderConfig.end);
    expect(sl).toMatchObject({ tag: 0x06, body: Buffer.from([0x02]) });
    expect(3 + decoderConfig.end + sl.end).toBe(es.body.length);
    expect(es.end + 4).toBe(a.config.length);
  });

  it("describes Opus with a dOps box", async () => {
    const { data } = await writeWithAudio(join(dir, "opus.mp4"), { codec: "Opus", sampleRate: 48_000, channels: 1, description: dOps, primingTicks: 0 });
    const a = summarizeTracks(data)[1]!;
    expect(a).toMatchObject({ entry: "Opus", channels: 1, sampleRate: 48_000, configType: "dOps" });
    expect(a.config).toEqual(dOps);
  });

  it("indexes the audio samples: stts runs, stsz, one chunk after the video samples", async () => {
    const { data, samples } = await writeWithAudio(join(dir, "tables.mp4"), aac);
    const [v, a] = summarizeTracks(data);
    expect(a!.timeToSample).toEqual([
      [9, 1024],
      [1, 700],
    ]);
    expect(a!.durationTicks).toBe(9916);
    expect(a!.sampleSizes).toEqual(samples.map((sample) => sample.length));
    expect(a!.sampleToChunk).toEqual([[1, 10, 1]]);
    expect(a!.chunkOffsets).toHaveLength(1);
    const offset = a!.chunkOffsets[0]!;
    const videoEnd = Math.max(...summarizeMp4(data).sampleOffsets) + 14;
    expect(offset).toBe(videoEnd);
    const audioBytes = Buffer.concat(samples).length;
    expect(data.subarray(offset, offset + audioBytes)).toEqual(Buffer.concat(samples));
    // mdat covers the audio too, so moov starts right after.
    expect(findBox(data, "mdat").end).toBe(offset + audioBytes);
    expect(findBox(data, "moov").start).toBe(offset + audioBytes);
    expect(v!.sampleSizes).toEqual([10, 11, 12, 13, 14]);
  });

  it("trims the encoder priming with an edit list on the audio track only", async () => {
    const { data } = await writeWithAudio(join(dir, "edits.mp4"), aac);
    const [v, a] = summarizeTracks(data);
    expect(v!.edits).toEqual([]);
    // One entry: the video length in movie ticks (ms), starting `priming` ticks into the media, at normal speed.
    expect(a!.edits).toEqual([[167, PRIMING, 1]]);
    expect(findBox(data, "moov/trak").type).toBe("trak");
    // The edit list follows tkhd, and the audio tkhd and mvhd carry the video length.
    expect(a!.trackDuration).toBe(167);
    expect(summarizeMp4(data).movieSeconds).toBeCloseTo(167 / 1000, 5);
    expect(v!.trackDuration).toBe(167);
    // mdhd keeps every encoded tick.
    expect(a!.durationTicks).toBe(9916);
  });

  it("puts edts right after tkhd in the audio trak", async () => {
    const { data } = await writeWithAudio(join(dir, "order.mp4"), aac);
    const moov = findBox(data, "moov");
    const traks = readBoxes(data, moov.payload, moov.end).filter((b) => b.type === "trak");
    expect(readBoxes(data, traks[1]!.payload, traks[1]!.end).map((b) => b.type)).toEqual(["tkhd", "edts", "mdia"]);
    expect(readBoxes(data, traks[0]!.payload, traks[0]!.end).map((b) => b.type)).toEqual(["tkhd", "mdia"]);
  });

  it("refuses audio that does not cover the video after the priming", async () => {
    const writer = await Mp4Writer.create(join(dir, "short-audio.mp4"));
    for (let i = 0; i < 30; i++) await writer.addSample(Buffer.alloc(4), i === 0); // 1 s
    writer.addAudioSample(Buffer.alloc(3), 48_000); // 1 s of ticks, minus the priming
    await expect(writer.finish(video, aac)).rejects.toThrow(/audio is shorter than the video/);
  });

  it("refuses an audio track without samples", async () => {
    const writer = await Mp4Writer.create(join(dir, "empty-audio.mp4"));
    await writer.addSample(Buffer.alloc(4), true);
    await expect(writer.finish(video, aac)).rejects.toThrow(/no audio samples/);
  });

  it("refuses audio samples without an audio track", async () => {
    const writer = await Mp4Writer.create(join(dir, "orphan-audio.mp4"));
    await writer.addSample(Buffer.alloc(4), true);
    writer.addAudioSample(Buffer.alloc(3), 1024);
    await expect(writer.finish(video)).rejects.toThrow(/audio samples but no audio track/);
  });
});
