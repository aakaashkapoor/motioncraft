// The audio track: mixes an `AudioPlan` in the page (Web Audio, offline) and
// encodes the result with WebCodecs `AudioEncoder`, AAC-LC when the browser has
// it, Opus otherwise. The top half is pure (decoder configs, tick timing); the
// bottom half runs in the render page, bundled with it, and is driven by
// `renderVideo`.

import { MEDIA_URL_PREFIX } from "../kit/mediaSource";
import type { AudioPlan } from "./audioPlan";

export const AUDIO_BITRATE = 128_000;
export const AUDIO_CHANNELS = 1;

/** Codecs to try, best first: the `AudioEncoder` codec string and the MP4 sample entry it needs. */
export const AUDIO_CODECS = [
  { codec: "mp4a.40.2", entry: "mp4a" },
  { codec: "opus", entry: "Opus" },
] as const;
export type AudioEntry = (typeof AUDIO_CODECS)[number]["entry"];

const AAC_SAMPLE_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

/** The AudioSpecificConfig of AAC-LC (ISO/IEC 14496-3), for when the encoder reports none. */
export function aacAudioSpecificConfig(sampleRate: number, channels: number): Uint8Array {
  const index = AAC_SAMPLE_RATES.indexOf(sampleRate);
  if (index < 0) throw new Error(`AAC has no sample rate index for ${sampleRate} Hz`);
  // 5 bits object type (2 = LC), 4 bits rate index, 4 bits channel config, 3 zero bits.
  const bits = (2 << 11) | (index << 7) | (channels << 3);
  return Uint8Array.of(bits >> 8, bits & 0xff);
}

/** Opus's usual encoder delay at 48 kHz, in samples, when the encoder reports none. */
const DEFAULT_OPUS_PRE_SKIP = 312;

/**
 * The payload of an MP4 `dOps` box (big-endian), from the `OpusHead` the
 * encoder reports (little-endian) or, without one, the defaults for the stream.
 */
export function opusDOps(sampleRate: number, channels: number, opusHead?: Uint8Array): Uint8Array {
  const isHead = opusHead !== undefined && opusHead.length >= 19 && String.fromCharCode(...opusHead.subarray(0, 8)) === "OpusHead";
  const head = isHead ? new DataView(opusHead.buffer, opusHead.byteOffset, opusHead.byteLength) : undefined;
  if (head !== undefined && head.getUint8(18) !== 0) throw new Error("Opus channel mapping families other than 0 are not supported");
  const out = new Uint8Array(11);
  const view = new DataView(out.buffer);
  view.setUint8(0, 0); // version
  view.setUint8(1, head?.getUint8(9) ?? channels);
  view.setUint16(2, head?.getUint16(10, true) ?? DEFAULT_OPUS_PRE_SKIP);
  view.setUint32(4, head?.getUint32(12, true) ?? sampleRate);
  view.setInt16(8, head?.getInt16(16, true) ?? 0);
  view.setUint8(10, 0); // channel mapping family 0
  return out;
}

/** A whole number of media ticks for a time in microseconds. */
export function usToTicks(us: number, sampleRate: number): number {
  return Math.round((us * sampleRate) / 1_000_000);
}

/** One encoded audio frame, sent back to Node. */
export interface AudioChunkData {
  /** base64. */
  data: string;
  timestampUs: number;
  durationUs: number;
}

export interface EncodedAudio {
  /**
   * `ok`: encoded. `silent`: the plan had nothing audible (every source was a
   * clip without an audio track). `unsupported`: the browser encodes neither
   * AAC nor Opus.
   */
  status: "ok" | "silent" | "unsupported";
  /** The `AudioEncoder` codec string, e.g. "mp4a.40.2". */
  codec?: string;
  entry?: AudioEntry;
  /** AudioSpecificConfig (AAC) or `dOps` payload (Opus), base64. */
  description?: string;
  sampleRate: number;
  channels: number;
  chunks: AudioChunkData[];
  /** Codecs tried, for the error when `unsupported`. */
  tried: string[];
  /** Media files in the plan that had no decodable audio and were left out. */
  skipped: string[];
}

/**
 * Each chunk's length in ticks, so the samples tile the timeline exactly:
 * a chunk lasts until the next one starts, the last for its own duration.
 */
export function chunkTicks(chunks: readonly Pick<AudioChunkData, "timestampUs" | "durationUs">[], sampleRate: number): number[] {
  return chunks.map((chunk, i) => {
    const start = usToTicks(chunk.timestampUs, sampleRate);
    const next = chunks[i + 1];
    return (next === undefined ? start + usToTicks(chunk.durationUs, sampleRate) : usToTicks(next.timestampUs, sampleRate)) - start;
  });
}

// ---------------------------------------------------------------------------
// Page side. Everything below runs in the browser.

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

function toBytes(buffer: AllowSharedBufferSource): Uint8Array {
  if (buffer instanceof ArrayBuffer || buffer instanceof SharedArrayBuffer) return new Uint8Array(buffer);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/** Mixes the plan's sources to one mono buffer at the plan's sample rate; null if nothing is audible. */
async function mix(plan: AudioPlan, skipped: string[]): Promise<AudioBuffer | null> {
  const length = Math.ceil((plan.durationMs * plan.sampleRate) / 1000);
  const context = new OfflineAudioContext(AUDIO_CHANNELS, length, plan.sampleRate);
  let audible = 0;
  for (const source of plan.sources) {
    const response = await fetch(source.src);
    if (!response.ok) throw new Error(`audio ${source.src} could not be fetched (HTTP ${response.status})`);
    let buffer: AudioBuffer;
    try {
      buffer = await context.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      // A VideoClip file without an audio track is normal. Narration that cannot be decoded is not.
      if (!source.src.startsWith(MEDIA_URL_PREFIX)) {
        throw new Error(`narration audio ${source.src} could not be decoded: ${error instanceof Error ? error.message : String(error)}`);
      }
      skipped.push(source.src);
      continue;
    }
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = source.rate;
    const gain = context.createGain();
    gain.gain.value = source.gain;
    node.connect(gain).connect(context.destination);
    const start = source.startMs / 1000;
    node.start(start, source.sourceStartMs / 1000);
    node.stop(start + source.durationMs / 1000);
    audible++;
  }
  return audible === 0 ? null : context.startRendering();
}

/** Samples handed to the encoder at a time: 100 ms at 48 kHz. */
const BLOCK_FRAMES = 4800;

/** Mixes the plan and encodes it as AAC (or Opus). */
export async function mixAndEncodeAudio(plan: AudioPlan): Promise<EncodedAudio> {
  const skipped: string[] = [];
  const base = { sampleRate: plan.sampleRate, channels: AUDIO_CHANNELS, chunks: [], tried: [], skipped };
  const mixed = await mix(plan, skipped);
  if (mixed === null) return { ...base, status: "silent" };

  const tried: string[] = [];
  for (const { codec, entry } of AUDIO_CODECS) {
    const config: AudioEncoderConfig = {
      codec,
      sampleRate: plan.sampleRate,
      numberOfChannels: AUDIO_CHANNELS,
      bitrate: AUDIO_BITRATE,
      ...(entry === "mp4a" ? { aac: { format: "aac" as const } } : {}),
    };
    tried.push(codec);
    if (!(await AudioEncoder.isConfigSupported(config)).supported) continue;

    const chunks: AudioChunkData[] = [];
    let reported: Uint8Array | undefined;
    let failure: unknown;
    const encoder = new AudioEncoder({
      output(chunk, metadata) {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        const description = metadata?.decoderConfig?.description;
        if (reported === undefined && description !== undefined) reported = toBytes(description);
        chunks.push({ data: toBase64(data), timestampUs: chunk.timestamp, durationUs: chunk.duration ?? 0 });
      },
      error(error) {
        failure = error;
      },
    });
    encoder.configure(config);
    const samples = mixed.getChannelData(0);
    for (let at = 0; at < samples.length && failure === undefined; at += BLOCK_FRAMES) {
      const part = samples.subarray(at, Math.min(samples.length, at + BLOCK_FRAMES));
      const data = new AudioData({
        format: "f32-planar",
        sampleRate: plan.sampleRate,
        numberOfFrames: part.length,
        numberOfChannels: AUDIO_CHANNELS,
        timestamp: Math.round((at * 1_000_000) / plan.sampleRate),
        data: part,
      });
      encoder.encode(data);
      data.close();
    }
    if (failure === undefined) await encoder.flush();
    encoder.close();
    if (failure !== undefined) throw failure;

    const decoderConfig =
      entry === "mp4a" ? (reported ?? aacAudioSpecificConfig(plan.sampleRate, AUDIO_CHANNELS)) : opusDOps(plan.sampleRate, AUDIO_CHANNELS, reported);
    return { status: "ok", codec, entry, description: toBase64(decoderConfig), sampleRate: plan.sampleRate, channels: AUDIO_CHANNELS, chunks, tried, skipped };
  }
  return { ...base, status: "unsupported", tried };
}
