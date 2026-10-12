// Reads back the colour an MP4's video track is labelled with, twice: the
// `colr` box in the sample entry and the H.264 SPS inside its avcC. Players
// use one or the other, so the render summary reports whether they agree.

import { open } from "node:fs/promises";
import { avcCColor, type CodedColor } from "./avcSps";
import { MATRIX_COEFFICIENTS, PRIMARIES, TRANSFER } from "./mp4";

export interface Mp4Color {
  /** From the nclx `colr` box; undefined without one. */
  colr?: CodedColor;
  /** From the SPS VUI; undefined when the stream does not say. */
  sps?: CodedColor;
}

interface Box {
  type: string;
  payload: number;
  end: number;
}

/** The boxes of `data` between `start` and `end`, top level only. */
function boxes(data: Buffer, start: number, end: number): Box[] {
  const found: Box[] = [];
  for (let at = start; at + 8 <= end; ) {
    let size = data.readUInt32BE(at);
    let payload = at + 8;
    if (size === 1) {
      size = Number(data.readBigUInt64BE(at + 8));
      payload += 8;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < payload - at || at + size > end) break;
    found.push({ type: data.toString("latin1", at + 4, at + 8), payload, end: at + size });
    at += size;
  }
  return found;
}

function child(data: Buffer, parent: Box, type: string, skip = 0): Box {
  const box = boxes(data, parent.payload + skip, parent.end).find((b) => b.type === type);
  if (box === undefined) throw new Error(`mp4: no "${type}" box`);
  return box;
}

/** The colour of the first video sample entry in a `moov` box. */
export function moovColor(moov: Buffer): Mp4Color {
  const root: Box = { type: "moov", payload: 8, end: moov.length };
  const trak = boxes(moov, root.payload, root.end).find((t) => {
    if (t.type !== "trak") return false;
    const hdlr = child(moov, child(moov, t, "mdia"), "hdlr");
    return moov.toString("latin1", hdlr.payload + 8, hdlr.payload + 12) === "vide";
  });
  if (trak === undefined) throw new Error("mp4: no video track");
  const stsd = child(moov, child(moov, child(moov, child(moov, trak, "mdia"), "minf"), "stbl"), "stsd");
  // stsd: version/flags and entry count, then the entry; VisualSampleEntry: 78 bytes of fields, then child boxes.
  const entry = boxes(moov, stsd.payload + 8, stsd.end)[0];
  if (entry === undefined) throw new Error("mp4: empty stsd");
  const children = boxes(moov, entry.payload + 78, entry.end);
  const result: Mp4Color = {};
  const avcC = children.find((b) => b.type === "avcC");
  if (avcC !== undefined) {
    const sps = avcCColor(moov.subarray(avcC.payload, avcC.end));
    if (sps !== undefined) result.sps = sps;
  }
  const colr = children.find((b) => b.type === "colr" && moov.toString("latin1", b.payload, b.payload + 4) === "nclx");
  if (colr !== undefined) {
    const at = colr.payload + 4;
    result.colr = {
      primaries: moov.readUInt16BE(at),
      transfer: moov.readUInt16BE(at + 2),
      matrix: moov.readUInt16BE(at + 4),
      fullRange: (moov[at + 6]! & 0x80) !== 0,
    };
  }
  return result;
}

/** Reads the video track's colour from an MP4 file, loading only its `moov` box. */
export async function readMp4Color(path: string): Promise<Mp4Color> {
  const file = await open(path, "r");
  try {
    const { size: fileSize } = await file.stat();
    const header = Buffer.alloc(16);
    for (let at = 0; at + 8 <= fileSize; ) {
      await file.read(header, 0, 16, at);
      let size = header.readUInt32BE(0);
      if (size === 1) size = Number(header.readBigUInt64BE(8));
      else if (size === 0) size = fileSize - at;
      if (size < 8) break;
      if (header.toString("latin1", 4, 8) === "moov") {
        const moov = Buffer.alloc(size);
        await file.read(moov, 0, size, at);
        return moovColor(moov);
      }
      at += size;
    }
  } finally {
    await file.close();
  }
  throw new Error(`${path}: no moov box`);
}

const name = (table: Record<string, number>, code: number) =>
  Object.entries(table).find(([, value]) => value === code)?.[0] ?? String(code);

/** "bt709 limited", or each part named when they differ, e.g. "bt709/iec61966-2-1/bt709 full". */
export function colorLabel(color: CodedColor): string {
  const parts = [name(PRIMARIES, color.primaries), name(TRANSFER, color.transfer), name(MATRIX_COEFFICIENTS, color.matrix)];
  const space = parts.every((part) => part === parts[0]) ? parts[0] : parts.join("/");
  return `${space} ${color.fullRange ? "full" : "limited"}`;
}

const same = (a: CodedColor, b: CodedColor) =>
  a.primaries === b.primaries && a.transfer === b.transfer && a.matrix === b.matrix && a.fullRange === b.fullRange;

/** One phrase for the render summary: the colour, or both labels when `colr` and the stream disagree. */
export function describeMp4Color({ colr, sps }: Mp4Color): string {
  if (colr !== undefined && sps !== undefined) {
    return same(colr, sps) ? colorLabel(colr) : `colr ${colorLabel(colr)} but H.264 ${colorLabel(sps)}`;
  }
  if (colr !== undefined) return `${colorLabel(colr)} (colr only)`;
  if (sps !== undefined) return `${colorLabel(sps)} (H.264 only)`;
  return "colour unspecified";
}
