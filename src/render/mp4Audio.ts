// The audio track of an MP4 (ISO/IEC 14496-12, -14 for AAC, Opus in ISOBMFF):
// a `soun` trak with an `mp4a` + `esds` or `Opus` + `dOps` sample entry. The
// media timescale is the sample rate, and all samples sit in one chunk.

import { box, fullBox, MATRIX, ascii, u16, u32, u64, u8, zeros, type Bytes } from "./mp4Box";

export interface Mp4AudioTrack {
  /** The sample entry: AAC (`mp4a`) or Opus. */
  codec: "mp4a" | "Opus";
  /** Samples per second, also the media timescale. */
  sampleRate: number;
  channels: number;
  /** `mp4a`: the AudioSpecificConfig. `Opus`: the payload of the `dOps` box. */
  description: Uint8Array;
}

/** The audio samples, in order, as one run of bytes in the file. */
export interface Mp4AudioSamples {
  sizes: readonly number[];
  /** Each sample's length, in media ticks (1 / sampleRate s). */
  durations: readonly number[];
  /** File offset of the first sample. */
  offset: number;
}

/** An MPEG-4 descriptor: tag, length in 7-bit groups, body. */
function descriptor(tag: number, ...parts: Bytes[]): Bytes {
  const body = Buffer.concat(parts);
  const length = [body.length & 0x7f];
  for (let rest = body.length >> 7; rest > 0; rest >>= 7) length.unshift((rest & 0x7f) | 0x80);
  return Buffer.concat([u8(tag), Uint8Array.from(length), body]);
}

/** `esds`: ES_Descriptor > DecoderConfigDescriptor > DecoderSpecificInfo (the AudioSpecificConfig). */
export function esdsBox(audioSpecificConfig: Uint8Array): Bytes {
  return fullBox(
    "esds",
    0,
    0,
    descriptor(
      0x03,
      u16(0), // ES_ID
      u8(0), // no stream dependence, URL or OCR
      descriptor(
        0x04,
        u8(0x40), // objectTypeIndication: MPEG-4 audio
        u8(0x15), // streamType audio (5) << 2, upstream 0, reserved 1
        zeros(3), // bufferSizeDB: unknown
        u32(0), // maxBitrate: unknown
        u32(0), // avgBitrate: unknown
        descriptor(0x05, audioSpecificConfig),
      ),
      descriptor(0x06, u8(0x02)), // SLConfigDescriptor: MP4 predefined
    ),
  );
}

function audioSampleEntry(audio: Mp4AudioTrack): Bytes {
  return box(
    audio.codec,
    zeros(6),
    u16(1), // data_reference_index
    zeros(8), // version, revision, vendor
    u16(audio.channels),
    u16(16), // samplesize
    u16(0), // pre_defined
    u16(0), // reserved
    u32(audio.sampleRate * 0x10000), // 16.16
    audio.codec === "mp4a" ? esdsBox(audio.description) : box("dOps", audio.description),
  );
}

/** stts entries: runs of equal sample durations. */
function runs(durations: readonly number[]): [count: number, delta: number][] {
  const result: [number, number][] = [];
  for (const delta of durations) {
    const last = result.at(-1);
    if (last !== undefined && last[1] === delta) last[0]++;
    else result.push([1, delta]);
  }
  return result;
}

/** The audio trak, and its length in movie time units. */
export function audioTrak(
  audio: Mp4AudioTrack,
  samples: Mp4AudioSamples,
  movieTimescale: number,
  trackId: number,
): { trak: Bytes; movieDuration: number } {
  const ticks = samples.durations.reduce((sum, d) => sum + d, 0);
  const movieDuration = Math.round((ticks * movieTimescale) / audio.sampleRate);
  const wide = samples.offset > 0xffffffff;
  const trak = box(
    "trak",
    fullBox(
      "tkhd",
      0,
      0x3, // enabled, in movie
      u32(0),
      u32(0),
      u32(trackId),
      u32(0),
      u32(movieDuration),
      zeros(8),
      u16(0), // layer
      u16(0), // alternate_group
      u16(0x0100), // volume 1.0
      u16(0),
      ...MATRIX,
      u32(0), // width, height: none for audio
      u32(0),
    ),
    box(
      "mdia",
      fullBox("mdhd", 0, 0, u32(0), u32(0), u32(audio.sampleRate), u32(ticks), u16(0x55c4) /* "und" */, u16(0)),
      fullBox("hdlr", 0, 0, u32(0), ascii("soun"), zeros(12), ascii("SoundHandler\0")),
      box(
        "minf",
        fullBox("smhd", 0, 0, u16(0), u16(0)), // balance 0
        box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1))),
        box(
          "stbl",
          fullBox("stsd", 0, 0, u32(1), audioSampleEntry(audio)),
          fullBox("stts", 0, 0, u32(runs(samples.durations).length), ...runs(samples.durations).flatMap(([count, delta]) => [u32(count), u32(delta)])),
          // All samples are one chunk.
          fullBox("stsc", 0, 0, u32(1), u32(1), u32(samples.sizes.length), u32(1)),
          fullBox("stsz", 0, 0, u32(0), u32(samples.sizes.length), ...samples.sizes.map(u32)),
          wide ? fullBox("co64", 0, 0, u32(1), u64(samples.offset)) : fullBox("stco", 0, 0, u32(1), u32(samples.offset)),
        ),
      ),
    ),
  );
  return { trak, movieDuration };
}
