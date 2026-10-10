// A minimal MP4 box reader for tests: enough to check what the renderer wrote.

export interface Mp4Box {
  type: string;
  /** Offset of the box header in the file. */
  start: number;
  /** Offset of the payload (after the header). */
  payload: number;
  end: number;
}

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "dinf"]);

/** The boxes in `data` between `start` and `end`, top level only. */
export function readBoxes(data: Buffer, start = 0, end = data.length): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) throw new Error(`truncated box header at ${offset}`);
    let size = data.readUInt32BE(offset);
    const type = data.toString("latin1", offset + 4, offset + 8);
    let payload = offset + 8;
    if (size === 1) {
      size = Number(data.readBigUInt64BE(offset + 8));
      payload += 8;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < payload - offset || offset + size > end) throw new Error(`box "${type}" at ${offset} has bad size ${size}`);
    boxes.push({ type, start: offset, payload, end: offset + size });
    offset += size;
  }
  return boxes;
}

/** Finds a box by path, e.g. "moov/trak/mdia/mdhd". */
export function findBox(data: Buffer, path: string): Mp4Box {
  let boxes = readBoxes(data);
  let found: Mp4Box | undefined;
  for (const type of path.split("/")) {
    found = boxes.find((b) => b.type === type);
    if (found === undefined) throw new Error(`no "${type}" box on path ${path}`);
    if (CONTAINERS.has(type)) boxes = readBoxes(data, found.payload, found.end);
  }
  return found!;
}

export interface Mp4Summary {
  topLevel: string[];
  width: number;
  height: number;
  timescale: number;
  durationTicks: number;
  /** mvhd duration in seconds. */
  movieSeconds: number;
  sampleCount: number;
  sampleSizes: number[];
  sampleOffsets: number[];
  /** stts entries as [count, delta]. */
  timeToSample: [number, number][];
  /** 1-based keyframe sample numbers. */
  syncSamples: number[];
  codec: string;
  avcC: Buffer;
}

/** Reads the facts the tests check from a single-video-track MP4. */
export function summarizeMp4(data: Buffer): Mp4Summary {
  const mvhd = findBox(data, "moov/mvhd");
  const movieTimescale = data.readUInt32BE(mvhd.payload + 12);
  const movieDuration = data.readUInt32BE(mvhd.payload + 16);

  const tkhd = findBox(data, "moov/trak/tkhd");
  const width = data.readUInt32BE(tkhd.end - 8) / 0x10000;
  const height = data.readUInt32BE(tkhd.end - 4) / 0x10000;

  const mdhd = findBox(data, "moov/trak/mdia/mdhd");
  const timescale = data.readUInt32BE(mdhd.payload + 12);
  const durationTicks = data.readUInt32BE(mdhd.payload + 16);

  const stbl = "moov/trak/mdia/minf/stbl";
  const stsd = findBox(data, `${stbl}/stsd`);
  const entry = readBoxes(data, stsd.payload + 8, stsd.end)[0]!;
  // VisualSampleEntry: 78 bytes of fields, then child boxes (avcC, colr, ...).
  const avcCBox = readBoxes(data, entry.payload + 78, entry.end).find((b) => b.type === "avcC");
  if (avcCBox === undefined) throw new Error("no avcC box");

  const stsz = findBox(data, `${stbl}/stsz`);
  const sampleCount = data.readUInt32BE(stsz.payload + 8);
  const sampleSizes = Array.from({ length: sampleCount }, (_, i) => data.readUInt32BE(stsz.payload + 12 + 4 * i));

  const stco = findBox(data, `${stbl}/stco`);
  const sampleOffsets = Array.from({ length: data.readUInt32BE(stco.payload + 4) }, (_, i) =>
    data.readUInt32BE(stco.payload + 8 + 4 * i),
  );

  const stts = findBox(data, `${stbl}/stts`);
  const timeToSample = Array.from({ length: data.readUInt32BE(stts.payload + 4) }, (_, i): [number, number] => [
    data.readUInt32BE(stts.payload + 8 + 8 * i),
    data.readUInt32BE(stts.payload + 12 + 8 * i),
  ]);

  const stss = findBox(data, `${stbl}/stss`);
  const syncSamples = Array.from({ length: data.readUInt32BE(stss.payload + 4) }, (_, i) =>
    data.readUInt32BE(stss.payload + 8 + 4 * i),
  );

  return {
    topLevel: readBoxes(data).map((b) => b.type),
    width,
    height,
    timescale,
    durationTicks,
    movieSeconds: movieDuration / movieTimescale,
    sampleCount,
    sampleSizes,
    sampleOffsets,
    timeToSample,
    syncSamples,
    codec: entry.type,
    avcC: data.subarray(avcCBox.payload, avcCBox.end),
  };
}

export interface Mp4TrackSummary {
  trackId: number;
  /** tkhd volume, 8.8 fixed point read as a number (1 = full). */
  volume: number;
  /** hdlr handler type, e.g. "vide" or "soun". */
  handler: string;
  /** Media header kind: "vmhd" or "smhd". */
  mediaHeader: string;
  timescale: number;
  durationTicks: number;
  /** Sample entry type, e.g. "avc1", "mp4a" or "Opus". */
  entry: string;
  /** Audio sample entry: channel count and sample rate. */
  channels: number;
  sampleRate: number;
  /** Payload of the audio sample entry's child box: `esds` or `dOps`. */
  config: Buffer;
  configType: string;
  timeToSample: [number, number][];
  sampleSizes: number[];
  chunkOffsets: number[];
  /** stsc entries as [firstChunk, samplesPerChunk, sampleDescriptionIndex]. */
  sampleToChunk: [number, number, number][];
}

/** Every `trak` of the movie, in file order, as a summary. */
export function summarizeTracks(data: Buffer): Mp4TrackSummary[] {
  const moov = findBox(data, "moov");
  return readBoxes(data, moov.payload, moov.end)
    .filter((b) => b.type === "trak")
    .map((trak) => {
      const sub = (path: string): Mp4Box => {
        let box = trak;
        for (const type of path.split("/")) {
          const found = readBoxes(data, box.payload, box.end).find((b) => b.type === type);
          if (found === undefined) throw new Error(`no "${type}" box on path ${path}`);
          box = found;
        }
        return box;
      };
      const tkhd = sub("tkhd");
      const mdhd = sub("mdia/mdhd");
      const hdlr = sub("mdia/hdlr");
      const minf = sub("mdia/minf");
      const stbl = "mdia/minf/stbl";
      const stsd = sub(`${stbl}/stsd`);
      const entry = readBoxes(data, stsd.payload + 8, stsd.end)[0]!;
      const isAudio = data.toString("latin1", hdlr.payload + 8, hdlr.payload + 12) === "soun";
      // AudioSampleEntry: 28 bytes of fields, then child boxes (esds, dOps).
      const child = isAudio ? readBoxes(data, entry.payload + 28, entry.end)[0] : undefined;
      const stsz = sub(`${stbl}/stsz`);
      const stco = sub(`${stbl}/stco`);
      const stts = sub(`${stbl}/stts`);
      const stsc = sub(`${stbl}/stsc`);
      const count = (box: Mp4Box) => data.readUInt32BE(box.payload + 4);
      return {
        trackId: data.readUInt32BE(tkhd.payload + 12),
        volume: data.readUInt16BE(tkhd.payload + 36) / 256,
        handler: data.toString("latin1", hdlr.payload + 8, hdlr.payload + 12),
        mediaHeader: readBoxes(data, minf.payload, minf.end)[0]!.type,
        timescale: data.readUInt32BE(mdhd.payload + 12),
        durationTicks: data.readUInt32BE(mdhd.payload + 16),
        entry: entry.type,
        channels: isAudio ? data.readUInt16BE(entry.payload + 16) : 0,
        sampleRate: isAudio ? data.readUInt32BE(entry.payload + 24) / 0x10000 : 0,
        config: child === undefined ? Buffer.alloc(0) : data.subarray(child.payload, child.end),
        configType: child?.type ?? "",
        timeToSample: Array.from({ length: count(stts) }, (_, i): [number, number] => [
          data.readUInt32BE(stts.payload + 8 + 8 * i),
          data.readUInt32BE(stts.payload + 12 + 8 * i),
        ]),
        sampleSizes: Array.from({ length: data.readUInt32BE(stsz.payload + 8) }, (_, i) => data.readUInt32BE(stsz.payload + 12 + 4 * i)),
        chunkOffsets: Array.from({ length: count(stco) }, (_, i) => data.readUInt32BE(stco.payload + 8 + 4 * i)),
        sampleToChunk: Array.from({ length: count(stsc) }, (_, i): [number, number, number] => [
          data.readUInt32BE(stsc.payload + 8 + 12 * i),
          data.readUInt32BE(stsc.payload + 12 + 12 * i),
          data.readUInt32BE(stsc.payload + 16 + 12 * i),
        ]),
      };
    });
}
