// RGBA to I420 (planar YUV 4:2:0) in limited-range BT.709, the colour format
// every player expects from H.264. Handing the encoder RGBA lets the browser
// pick the conversion, and Chrome picks full range with an sRGB transfer, which
// many players refuse or show washed out. Pure, so it runs in the page and in
// tests alike.
//
// BT.709 (Kr 0.2126, Kb 0.0722), with R, G, B the captured 0..1 values:
//   Y' = Kr R + (1 - Kr - Kb) G + Kb B
//   Y  = 16 + 219 Y'    Cb = 128 + 224 (B - Y') / 1.8556    Cr = 128 + 224 (R - Y') / 1.5748
// in 16.16 fixed point. Each chroma sample is the mean of its 2x2 block of
// pixels; at an odd right or bottom edge the block is the pixels that exist.

/** The colour space `rgbaToI420` produces: limited-range BT.709. */
export const BT709_LIMITED = {
  primaries: "bt709",
  transfer: "bt709",
  matrix: "bt709",
  fullRange: false,
} as const satisfies VideoColorSpaceInit;

const KR = 0.2126;
const KB = 0.0722;
const KG = 1 - KR - KB;
const ONE = 1 << 16;
const fixed = (x: number) => Math.round(x * ONE);

// Per 8-bit input step: 219/255 for luma, 224/255 for chroma.
const YR = fixed((219 / 255) * KR);
const YB = fixed((219 / 255) * KB);
/** Makes the three sum to exactly 219/255, so white lands on 235. */
const YG = fixed(219 / 255) - YR - YB;
const CB_R = fixed((-224 / 255) * (KR / (2 * (1 - KB))));
const CB_G = fixed((-224 / 255) * (KG / (2 * (1 - KB))));
/** Makes the three sum to exactly 0, so every grey has Cb 128. */
const CB_B = -CB_R - CB_G;
const CR_B = fixed((-224 / 255) * (KB / (2 * (1 - KR))));
const CR_G = fixed((-224 / 255) * (KG / (2 * (1 - KR))));
const CR_R = -CR_B - CR_G;

/** Bytes of an I420 frame: a full Y plane, then Cb and Cr at half width and height (rounded up). */
export function i420Size(width: number, height: number): number {
  return width * height + 2 * Math.ceil(width / 2) * Math.ceil(height / 2);
}

/**
 * Converts tightly packed RGBA pixels (alpha ignored) to an I420 buffer:
 * the Y plane, then Cb, then Cr, each with no row padding.
 */
export function rgbaToI420(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new Error(`rgbaToI420: ${rgba.length} bytes is not ${width}x${height} RGBA`);
  }
  const cw = Math.ceil(width / 2);
  const ch = Math.ceil(height / 2);
  const out = new Uint8Array(i420Size(width, height));
  const cbBase = width * height;
  const crBase = cbBase + cw * ch;
  const luma = (r: number, g: number, b: number) => 16 + ((YR * r + YG * g + YB * b + (ONE >> 1)) >> 16);

  for (let cy = 0; cy < ch; cy++) {
    const y0 = 2 * cy;
    // At an odd bottom edge the missing row repeats the last one: the mean is then that of the pixels that exist.
    const y1 = Math.min(y0 + 1, height - 1);
    for (let cx = 0; cx < cw; cx++) {
      const x0 = 2 * cx;
      const x1 = Math.min(x0 + 1, width - 1);
      const p00 = y0 * width + x0;
      const p01 = y0 * width + x1;
      const p10 = y1 * width + x0;
      const p11 = y1 * width + x1;
      const r00 = rgba[p00 * 4]!, g00 = rgba[p00 * 4 + 1]!, b00 = rgba[p00 * 4 + 2]!;
      const r01 = rgba[p01 * 4]!, g01 = rgba[p01 * 4 + 1]!, b01 = rgba[p01 * 4 + 2]!;
      const r10 = rgba[p10 * 4]!, g10 = rgba[p10 * 4 + 1]!, b10 = rgba[p10 * 4 + 2]!;
      const r11 = rgba[p11 * 4]!, g11 = rgba[p11 * 4 + 1]!, b11 = rgba[p11 * 4 + 2]!;
      out[p00] = luma(r00, g00, b00);
      out[p01] = luma(r01, g01, b01);
      out[p10] = luma(r10, g10, b10);
      out[p11] = luma(r11, g11, b11);
      // Sums of four samples: one more shift (18 in all) takes the mean.
      const r = r00 + r01 + r10 + r11;
      const g = g00 + g01 + g10 + g11;
      const b = b00 + b01 + b10 + b11;
      const c = cy * cw + cx;
      out[cbBase + c] = 128 + ((CB_R * r + CB_G * g + CB_B * b + (1 << 17)) >> 18);
      out[crBase + c] = 128 + ((CR_R * r + CR_G * g + CR_B * b + (1 << 17)) >> 18);
    }
  }
  return out;
}
