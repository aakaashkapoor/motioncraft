// Reads the colour description an H.264 stream carries in its sequence
// parameter set (the VUI's video_signal_type, ITU-T H.264 7.3.2.1.1 and E.1.1),
// from the avcC record the encoder hands back. That is what a player decodes
// with, so it must agree with the MP4's `colr` box.

/** A colour description as H.264 and the MP4 `colr` box code it (ITU-T H.273 numbers). */
export interface CodedColor {
  primaries: number;
  transfer: number;
  matrix: number;
  fullRange: boolean;
}

/** Reads bits MSB-first from an RBSP (emulation prevention bytes removed). */
class BitReader {
  private bit = 0;
  constructor(private readonly bytes: Uint8Array) {}

  u(n: number): number {
    let value = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.bytes[this.bit >> 3];
      if (byte === undefined) throw new Error("SPS ends early");
      value = value * 2 + ((byte >> (7 - (this.bit & 7))) & 1);
      this.bit++;
    }
    return value;
  }

  flag(): boolean {
    return this.u(1) === 1;
  }

  /** Unsigned Exp-Golomb. */
  ue(): number {
    let zeros = 0;
    while (this.u(1) === 0) zeros++;
    return 2 ** zeros - 1 + this.u(zeros);
  }

  /** Signed Exp-Golomb. */
  se(): number {
    const k = this.ue();
    return k % 2 === 1 ? (k + 1) / 2 : -k / 2;
  }
}

/** The NAL payload with each emulation prevention byte (00 00 03) dropped. */
function rbsp(nal: Uint8Array): Uint8Array {
  const out: number[] = [];
  let zeros = 0;
  for (const byte of nal) {
    if (zeros >= 2 && byte === 3) {
      zeros = 0;
      continue;
    }
    zeros = byte === 0 ? zeros + 1 : 0;
    out.push(byte);
  }
  return Uint8Array.from(out);
}

/** Profiles whose SPS carries chroma format, bit depth and scaling lists. */
const HIGH_PROFILES = new Set([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135]);

function skipScalingList(bits: BitReader, size: number): void {
  let last = 8;
  let next = 8;
  for (let j = 0; j < size; j++) {
    if (next !== 0) next = (last + bits.se() + 256) % 256;
    last = next === 0 ? last : next;
  }
}

/** The colour description in an SPS NAL unit (with its header byte), or undefined if it has none. */
export function spsColor(nal: Uint8Array): CodedColor | undefined {
  if ((nal[0]! & 0x1f) !== 7) throw new Error("not an SPS NAL unit");
  const bits = new BitReader(rbsp(nal.subarray(1)));
  const profile = bits.u(8);
  bits.u(16); // constraint flags, level_idc
  bits.ue(); // seq_parameter_set_id
  if (HIGH_PROFILES.has(profile)) {
    const chromaFormat = bits.ue();
    if (chromaFormat === 3) bits.u(1); // separate_colour_plane_flag
    bits.ue(); // bit_depth_luma_minus8
    bits.ue(); // bit_depth_chroma_minus8
    bits.u(1); // qpprime_y_zero_transform_bypass_flag
    if (bits.flag()) {
      for (let i = 0; i < (chromaFormat === 3 ? 12 : 8); i++) {
        if (bits.flag()) skipScalingList(bits, i < 6 ? 16 : 64);
      }
    }
  }
  bits.ue(); // log2_max_frame_num_minus4
  const pocType = bits.ue();
  if (pocType === 0) {
    bits.ue(); // log2_max_pic_order_cnt_lsb_minus4
  } else if (pocType === 1) {
    bits.u(1); // delta_pic_order_always_zero_flag
    bits.se();
    bits.se();
    const cycle = bits.ue();
    for (let i = 0; i < cycle; i++) bits.se();
  }
  bits.ue(); // max_num_ref_frames
  bits.u(1); // gaps_in_frame_num_value_allowed_flag
  bits.ue(); // pic_width_in_mbs_minus1
  bits.ue(); // pic_height_in_map_units_minus1
  if (!bits.flag()) bits.u(1); // frame_mbs_only_flag, else mb_adaptive_frame_field_flag
  bits.u(1); // direct_8x8_inference_flag
  if (bits.flag()) for (let i = 0; i < 4; i++) bits.ue(); // frame cropping offsets
  if (!bits.flag()) return undefined; // vui_parameters_present_flag

  if (bits.flag()) {
    // aspect_ratio_info_present_flag
    if (bits.u(8) === 255) bits.u(32); // Extended_SAR: sar_width, sar_height
  }
  if (bits.flag()) bits.u(1); // overscan_info_present_flag, overscan_appropriate_flag
  if (!bits.flag()) return undefined; // video_signal_type_present_flag
  bits.u(3); // video_format
  const fullRange = bits.flag();
  // Without a colour description, H.264 means "unspecified" (2) for all three.
  if (!bits.flag()) return { primaries: 2, transfer: 2, matrix: 2, fullRange };
  return { primaries: bits.u(8), transfer: bits.u(8), matrix: bits.u(8), fullRange };
}

/** The colour description of the first SPS in an avcC record (AVCDecoderConfigurationRecord). */
export function avcCColor(avcC: Uint8Array): CodedColor | undefined {
  const spsCount = avcC[5]! & 0x1f;
  if (avcC.length < 8 || spsCount === 0) throw new Error("avcC has no SPS");
  const length = (avcC[6]! << 8) | avcC[7]!;
  return spsColor(avcC.subarray(8, 8 + length));
}
