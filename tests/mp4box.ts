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
