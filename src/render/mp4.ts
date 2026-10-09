// A small MP4 writer for one constant-frame-rate H.264 track (ISO/IEC 14496-12
// and -15). Samples stream straight to the file as they arrive; only their
// sizes and keyframe flags stay in memory. The file is laid out
// ftyp · mdat · moov: the moov box is written last, once every sample is known,
// and the mdat size is patched in. Original code, no muxer dependency.

import { open, type FileHandle } from "node:fs/promises";

export interface Mp4Track {
  width: number;
  height: number;
  /** Frames per second, a positive integer. Every sample lasts one frame. */
  fps: number;
  /** The AVCDecoderConfigurationRecord (avcC) from the encoder. */
  avcC: Uint8Array;
  /** The encoder's color space, written as an nclx `colr` box when complete. */
  colorSpace?: VideoColorSpaceInit;
}

/** Media time units per frame. fps x 1000 keeps every timestamp an exact integer. */
const TICKS_PER_FRAME = 1000;
/** Movie (mvhd/tkhd) time units per second. */
const MOVIE_TIMESCALE = 1000;

// --- box building -----------------------------------------------------------

type Bytes = Uint8Array;

function u8(n: number): Bytes {
  return Uint8Array.of(n);
}
function u16(n: number): Bytes {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}
function u32(n: number): Bytes {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}
function u64(n: number): Bytes {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(n));
  return b;
}
function zeros(n: number): Bytes {
  return new Uint8Array(n);
}
function ascii(text: string): Bytes {
  return Buffer.from(text, "latin1");
}

function box(type: string, ...parts: Bytes[]): Bytes {
  const size = 8 + parts.reduce((sum, part) => sum + part.length, 0);
  return Buffer.concat([u32(size), ascii(type), ...parts]);
}

function fullBox(type: string, version: number, flags: number, ...parts: Bytes[]): Bytes {
  return box(type, u8(version), u8(flags >> 16), u16(flags & 0xffff), ...parts);
}

/** The identity transform, 16.16 / 2.30 fixed point. */
const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32);

// --- colr (nclx) --------------------------------------------------------------

const PRIMARIES: Record<string, number> = { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 };
const TRANSFER: Record<string, number> = {
  bt709: 1,
  smpte170m: 6,
  linear: 8,
  "iec61966-2-1": 13,
  pq: 16,
  hlg: 18,
};
const MATRIX_COEFFICIENTS: Record<string, number> = { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, "bt2020-ncl": 9 };

/** An nclx `colr` box, or nothing if the color space is incomplete or unknown. */
export function colrBox(colorSpace: VideoColorSpaceInit | undefined): Bytes[] {
  if (!colorSpace) return [];
  const { primaries, transfer, matrix, fullRange } = colorSpace;
  const p = primaries ? PRIMARIES[primaries] : undefined;
  const t = transfer ? TRANSFER[transfer] : undefined;
  const m = matrix ? MATRIX_COEFFICIENTS[matrix] : undefined;
  if (p === undefined || t === undefined || m === undefined) return [];
  return [box("colr", ascii("nclx"), u16(p), u16(t), u16(m), u8(fullRange ? 0x80 : 0))];
}

// --- moov ----------------------------------------------------------------------

export interface Mp4Samples {
  sizes: readonly number[];
  /** 0-based indexes of the keyframes. */
  keyFrames: readonly number[];
  /** File offset of each sample. */
  offsets: readonly number[];
}

function avc1(track: Mp4Track): Bytes {
  return box(
    "avc1",
    zeros(6),
    u16(1), // data_reference_index
    zeros(16), // pre_defined, reserved
    u16(track.width),
    u16(track.height),
    u32(0x00480000), // 72 dpi
    u32(0x00480000),
    u32(0),
    u16(1), // frame_count
    zeros(32), // compressorname
    u16(0x0018), // depth
    u16(0xffff), // pre_defined = -1
    box("avcC", track.avcC),
    ...colrBox(track.colorSpace),
  );
}

function stbl(track: Mp4Track, samples: Mp4Samples): Bytes {
  const count = samples.sizes.length;
  const wide = samples.offsets.some((offset) => offset > 0xffffffff);
  return box(
    "stbl",
    fullBox("stsd", 0, 0, u32(1), avc1(track)),
    fullBox("stts", 0, 0, u32(1), u32(count), u32(TICKS_PER_FRAME)),
    fullBox("stss", 0, 0, u32(samples.keyFrames.length), ...samples.keyFrames.map((i) => u32(i + 1))),
    // Every sample is its own chunk.
    fullBox("stsc", 0, 0, u32(1), u32(1), u32(1), u32(1)),
    fullBox("stsz", 0, 0, u32(0), u32(count), ...samples.sizes.map(u32)),
    wide
      ? fullBox("co64", 0, 0, u32(count), ...samples.offsets.map(u64))
      : fullBox("stco", 0, 0, u32(count), ...samples.offsets.map(u32)),
  );
}

/** The complete moov box for `track` and its samples. */
export function moovBox(track: Mp4Track, samples: Mp4Samples): Bytes {
  const frames = samples.sizes.length;
  const mediaTimescale = track.fps * TICKS_PER_FRAME;
  const mediaDuration = frames * TICKS_PER_FRAME;
  const movieDuration = Math.round((frames * MOVIE_TIMESCALE) / track.fps);

  return box(
    "moov",
    fullBox(
      "mvhd",
      0,
      0,
      u32(0), // creation_time: fixed, so the same input gives the same file
      u32(0), // modification_time
      u32(MOVIE_TIMESCALE),
      u32(movieDuration),
      u32(0x00010000), // rate 1.0
      u16(0x0100), // volume 1.0
      zeros(10),
      ...MATRIX,
      zeros(24),
      u32(2), // next_track_ID
    ),
    box(
      "trak",
      fullBox(
        "tkhd",
        0,
        0x3, // enabled, in movie
        u32(0),
        u32(0),
        u32(1), // track_ID
        u32(0),
        u32(movieDuration),
        zeros(8),
        u16(0), // layer
        u16(0), // alternate_group
        u16(0), // volume: 0 for video
        u16(0),
        ...MATRIX,
        u32(track.width * 0x10000),
        u32(track.height * 0x10000),
      ),
      box(
        "mdia",
        fullBox("mdhd", 0, 0, u32(0), u32(0), u32(mediaTimescale), u32(mediaDuration), u16(0x55c4) /* "und" */, u16(0)),
        fullBox("hdlr", 0, 0, u32(0), ascii("vide"), zeros(12), ascii("VideoHandler\0")),
        box(
          "minf",
          fullBox("vmhd", 0, 1, zeros(8)),
          box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1))),
          stbl(track, samples),
        ),
      ),
    ),
  );
}

// --- the writer -------------------------------------------------------------

const FTYP = box("ftyp", ascii("isom"), u32(0x200), ascii("isom"), ascii("iso2"), ascii("avc1"), ascii("mp41"));
/** A 64-bit ("largesize") mdat header, so the size can never overflow. */
const MDAT_HEADER_SIZE = 16;

/** Streams H.264 samples into an MP4 file. Call `addSample` per frame, in order, then `finish`. */
export class Mp4Writer {
  private readonly sizes: number[] = [];
  private readonly keyFrames: number[] = [];
  private readonly offsets: number[] = [];
  private position: number;
  private closed = false;

  private constructor(private readonly file: FileHandle) {
    this.position = FTYP.length + MDAT_HEADER_SIZE;
  }

  static async create(path: string): Promise<Mp4Writer> {
    const file = await open(path, "w");
    try {
      await file.write(FTYP, 0, FTYP.length, 0);
      // The mdat size is filled in by `finish`.
      await file.write(Buffer.concat([u32(1), ascii("mdat"), u64(0)]), 0, MDAT_HEADER_SIZE, FTYP.length);
    } catch (error) {
      await file.close();
      throw error;
    }
    return new Mp4Writer(file);
  }

  get frames(): number {
    return this.sizes.length;
  }

  async addSample(data: Uint8Array, keyFrame: boolean): Promise<void> {
    if (this.sizes.length === 0 && !keyFrame) throw new Error("mp4: the first sample must be a keyframe");
    await this.file.write(data, 0, data.length, this.position);
    if (keyFrame) this.keyFrames.push(this.sizes.length);
    this.offsets.push(this.position);
    this.sizes.push(data.length);
    this.position += data.length;
  }

  /** Writes the moov box, patches the mdat size and closes the file. */
  async finish(track: Mp4Track): Promise<void> {
    try {
      if (this.sizes.length === 0) throw new Error("mp4: no samples");
      const moov = moovBox(track, { sizes: this.sizes, keyFrames: this.keyFrames, offsets: this.offsets });
      await this.file.write(moov, 0, moov.length, this.position);
      const mdatSize = this.position - FTYP.length;
      await this.file.write(u64(mdatSize), 0, 8, FTYP.length + 8);
    } finally {
      await this.close();
    }
  }

  /** Closes the file without finishing it (after an error). Safe to call more than once. */
  async abort(): Promise<void> {
    await this.close();
  }

  private async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.file.close();
  }
}
