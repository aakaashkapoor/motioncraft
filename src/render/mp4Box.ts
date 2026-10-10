// Byte and box primitives for the MP4 writer (ISO/IEC 14496-12): big-endian
// integers and size-prefixed boxes.

export type Bytes = Uint8Array;

export function u8(n: number): Bytes {
  return Uint8Array.of(n);
}
export function u16(n: number): Bytes {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}
export function u32(n: number): Bytes {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}
export function u64(n: number): Bytes {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(n));
  return b;
}
export function zeros(n: number): Bytes {
  return new Uint8Array(n);
}
export function ascii(text: string): Bytes {
  return Buffer.from(text, "latin1");
}

export function box(type: string, ...parts: Bytes[]): Bytes {
  const size = 8 + parts.reduce((sum, part) => sum + part.length, 0);
  return Buffer.concat([u32(size), ascii(type), ...parts]);
}

export function fullBox(type: string, version: number, flags: number, ...parts: Bytes[]): Bytes {
  return box(type, u8(version), u8(flags >> 16), u16(flags & 0xffff), ...parts);
}

/** The identity transform, 16.16 / 2.30 fixed point. */
export const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32);
