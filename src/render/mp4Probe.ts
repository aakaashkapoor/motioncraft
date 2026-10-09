// Reads the duration of an MP4 (or MOV/M4V) file from its movie header, without
// loading the media data: walks the top-level boxes to `moov`, then reads `mvhd`.

import { open, type FileHandle } from "node:fs/promises";

async function readAt(file: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

/** Size and type of the box at `position`, with the offset of its payload. */
async function boxAt(file: FileHandle, position: number, fileSize: number) {
  const header = await readAt(file, position, 16);
  if (header.length < 8) return undefined;
  let size = header.readUInt32BE(0);
  const type = header.toString("latin1", 4, 8);
  let payload = position + 8;
  if (size === 1) {
    if (header.length < 16) return undefined;
    size = Number(header.readBigUInt64BE(8));
    payload += 8;
  } else if (size === 0) {
    size = fileSize - position;
  }
  if (size < payload - position || !/^[\x20-\x7e]{4}$/.test(type)) return undefined;
  return { type, size, payload };
}

/** The movie duration of an MP4 file in ms. Throws if the file is not an MP4. */
export async function readMp4DurationMs(path: string): Promise<number> {
  const file = await open(path, "r");
  try {
    const { size: fileSize } = await file.stat();
    for (let position = 0; position < fileSize; ) {
      const box = await boxAt(file, position, fileSize);
      if (box === undefined || (position === 0 && box.type !== "ftyp" && box.type !== "moov")) break;
      if (box.type === "moov") {
        const end = Math.min(position + box.size, fileSize);
        for (let inner = box.payload; inner < end; ) {
          const child = await boxAt(file, inner, end);
          if (child === undefined) break;
          if (child.type === "mvhd") {
            const body = await readAt(file, child.payload, 32);
            const version = body[0];
            const timescale = version === 1 ? body.readUInt32BE(20) : body.readUInt32BE(12);
            const duration = version === 1 ? Number(body.readBigUInt64BE(24)) : body.readUInt32BE(16);
            if (timescale === 0) break;
            return (duration * 1000) / timescale;
          }
          inner += child.size;
        }
        break;
      }
      position += box.size;
    }
  } finally {
    await file.close();
  }
  throw new Error(`${path} is not an MP4 file (no movie header found)`);
}
