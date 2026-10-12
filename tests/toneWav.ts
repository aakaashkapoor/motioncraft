// WAV files of a quiet tone in the layouts a recording may come in, made from
// samples so no audio is committed.

export interface ToneWavOptions {
  rate?: number;
  channels?: number;
  /** 16 or 24 for PCM; ignored for float (32-bit). */
  bits?: 16 | 24;
  float?: boolean;
}

export function toneWav(ms: number, { rate = 44_100, channels = 1, bits = 16, float = false }: ToneWavOptions = {}): Uint8Array {
  const frames = Math.round((rate * ms) / 1000);
  const bytesPer = float ? 4 : bits / 8;
  const data = frames * channels * bytesPer;
  const bytes = new Uint8Array(44 + data);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + data, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, float ? 3 : 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * bytesPer, true);
  view.setUint16(32, channels * bytesPer, true);
  view.setUint16(34, bytesPer * 8, true);
  text(36, "data");
  view.setUint32(40, data, true);
  for (let i = 0; i < frames * channels; i++) {
    const v = 0.2 * Math.sin((2 * Math.PI * 330 * Math.floor(i / channels)) / rate);
    const at = 44 + i * bytesPer;
    if (float) view.setFloat32(at, v, true);
    else if (bytesPer === 2) view.setInt16(at, Math.round(v * 32767), true);
    else {
      const n = Math.round(v * 8_388_607) & 0xffffff;
      view.setUint8(at, n & 0xff);
      view.setUint8(at + 1, (n >> 8) & 0xff);
      view.setUint8(at + 2, (n >> 16) & 0xff);
    }
  }
  return bytes;
}
