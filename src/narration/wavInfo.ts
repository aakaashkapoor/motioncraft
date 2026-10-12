// What a narration WAV holds, from its header: the encoding and its length.
// The page decodes the sound itself (and resamples and downmixes it into the
// mix), so only the encodings it can decode are accepted. Pure.

export interface WavInfo {
  format: "pcm" | "float";
  bits: number;
  channels: number;
  sampleRate: number;
  /** Length of the sound, in ms. */
  audioMs: number;
}

const PCM = 1;
const FLOAT = 3;
const EXTENSIBLE = 0xfffe;
const SUPPORTED = "16-bit or 24-bit PCM, or 32-bit float";

export function readWavInfo(bytes: Uint8Array): WavInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number): string => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a WAV file");

  let fmt: Omit<WavInfo, "audioMs"> | undefined;
  let blockAlign = 0;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (tag(offset) === "fmt ") {
      if (size < 16 || body + 16 > bytes.length) throw new Error("WAV fmt chunk is too short");
      let code = view.getUint16(body, true);
      // WAVE_FORMAT_EXTENSIBLE keeps the real format in the first two bytes of its sub-format GUID.
      if (code === EXTENSIBLE && size >= 26 && body + 26 <= bytes.length) code = view.getUint16(body + 24, true);
      const bits = view.getUint16(body + 14, true);
      const supported = (code === PCM && (bits === 16 || bits === 24)) || (code === FLOAT && bits === 32);
      if (!supported) throw new Error(`only ${SUPPORTED} WAV is supported (format ${code}, ${bits}-bit)`);
      const channels = view.getUint16(body + 2, true);
      const sampleRate = view.getUint32(body + 4, true);
      if (channels < 1 || channels > 2) throw new Error(`only mono or stereo WAV is supported (${channels} channels)`);
      if (sampleRate === 0) throw new Error("WAV sample rate is 0");
      blockAlign = (channels * bits) / 8;
      fmt = { format: code === PCM ? "pcm" : "float", bits, channels, sampleRate };
    } else if (tag(offset) === "data") {
      if (fmt === undefined) throw new Error("WAV data before its fmt chunk");
      const frames = Math.floor(Math.min(size, bytes.length - body) / blockAlign);
      return { ...fmt, audioMs: Math.round((frames / fmt.sampleRate) * 1000) };
    }
    offset = body + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}
