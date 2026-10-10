// The audio track: mixes an `AudioPlan` in the page (Web Audio, offline) and
// encodes the result with WebCodecs `AudioEncoder`, AAC-LC when the browser has
// it, Opus otherwise. The top half is pure (decoder configs, tick timing); the
// bottom half runs in the render page, bundled with it, and is driven by
// `renderVideo`.

import { MEDIA_URL_PREFIX } from "../kit/mediaSource";
import type { AudioPlan } from "./audioPlan";
import { toBase64, toBytes } from "./pageBytes";

export const AUDIO_BITRATE = 128_000;
export const AUDIO_CHANNELS = 1;

/** Codecs to try, best first: the `AudioEncoder` codec string and the MP4 sample entry it needs. */
export const AUDIO_CODECS = [
  { codec: "mp4a.40.2", entry: "mp4a" },
  { codec: "opus", entry: "Opus" },
] as const;
export type AudioEntry = (typeof AUDIO_CODECS)[number]["entry"];

/** Samples in one encoded frame, per MP4 sample entry (AAC-LC: 1024; Opus at 20 ms: 960). */
export const AUDIO_FRAME_SAMPLES: Readonly<Record<AudioEntry, number>> = { mp4a: 1024, Opus: 960 };

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
  /** Absent when the encoder reports none. */
  durationUs?: number;
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
  /** Encoder delay in samples that the edit list trims: for AAC, what this browser encoder was measured to add (0 where it compensates itself); 0 for Opus, whose pre-skip is in `dOps`. */
  primingTicks: number;
  chunks: AudioChunkData[];
  /** Codecs tried, for the error when `unsupported`. */
  tried: string[];
  /** Served URLs of media files in the plan that had no decodable audio and were left out. */
  skipped: string[];
}

/**
 * Each chunk's length in ticks, so the samples tile the timeline exactly: a
 * chunk lasts until the next one starts. The last lasts its own duration if the
 * encoder gave one, else as long as the step before it, else `frameSamples`.
 */
export function chunkTicks(
  chunks: readonly Pick<AudioChunkData, "timestampUs" | "durationUs">[],
  sampleRate: number,
  frameSamples: number,
): number[] {
  const starts = chunks.map((chunk) => usToTicks(chunk.timestampUs, sampleRate));
  return chunks.map((chunk, i) => {
    const next = starts[i + 1];
    if (next !== undefined) return next - starts[i]!;
    if (chunk.durationUs !== undefined && chunk.durationUs > 0) return usToTicks(chunk.durationUs, sampleRate);
    return i > 0 ? starts[i]! - starts[i - 1]! : frameSamples;
  });
}

// ---------------------------------------------------------------------------
// Page side. Everything below runs in the browser.

/** Mixes the plan sources to one mono buffer at the plan sample rate; null if nothing is audible. */
async function mix(plan: AudioPlan, skipped: string[]): Promise<AudioBuffer | null> {
  const length = Math.ceil((plan.durationMs * plan.sampleRate) / 1000);
  const context = new OfflineAudioContext(AUDIO_CHANNELS, length, plan.sampleRate);
  // Each file is fetched and decoded once, however many times the plan plays it.
  const decoded = new Map<string, Promise<AudioBuffer | null>>();
  const decode = (src: string): Promise<AudioBuffer | null> => {
    let buffer = decoded.get(src);
    if (buffer === undefined) {
      buffer = (async () => {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`audio ${src} could not be fetched (HTTP ${response.status})`);
        try {
          return await context.decodeAudioData(await response.arrayBuffer());
        } catch (error) {
          // A VideoClip file without an audio track is normal. Narration that cannot be decoded is not.
          if (!src.startsWith(MEDIA_URL_PREFIX)) {
            throw new Error(`narration audio ${src} could not be decoded: ${error instanceof Error ? error.message : String(error)}`);
          }
          skipped.push(src);
          return null;
        }
      })();
      decoded.set(src, buffer);
    }
    return buffer;
  };

  let audible = 0;
  for (const source of plan.sources) {
    const buffer = await decode(source.src);
    if (buffer === null) continue;
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
/** Blocks waiting in the encoder before the loop waits for it to catch up. */
const MAX_QUEUE = 8;

interface EncodedFrame {
  data: Uint8Array;
  timestampUs: number;
  durationUs?: number;
}

/** Encodes mono `samples`; returns the frames and the decoder description the encoder reported, if any. */
async function encodeSamples(config: AudioEncoderConfig, samples: Float32Array<ArrayBuffer>): Promise<{ frames: EncodedFrame[]; description?: Uint8Array }> {
  const frames: EncodedFrame[] = [];
  let description: Uint8Array | undefined;
  let failure: unknown;
  let wake: (() => void) | undefined;
  const encoder = new AudioEncoder({
    output(chunk, metadata) {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const reported = metadata?.decoderConfig?.description;
      if (description === undefined && reported !== undefined) description = toBytes(reported);
      frames.push({ data, timestampUs: chunk.timestamp, ...(chunk.duration == null ? {} : { durationUs: chunk.duration }) });
    },
    error(error) {
      failure = error;
      wake?.();
    },
  });
  encoder.addEventListener("dequeue", () => wake?.());
  try {
    encoder.configure(config);
    for (let at = 0; at < samples.length && failure === undefined; at += BLOCK_FRAMES) {
      const part = samples.subarray(at, Math.min(samples.length, at + BLOCK_FRAMES));
      const data = new AudioData({
        format: "f32-planar",
        sampleRate: config.sampleRate,
        numberOfFrames: part.length,
        numberOfChannels: AUDIO_CHANNELS,
        timestamp: Math.round((at * 1_000_000) / config.sampleRate),
        data: part,
      });
      encoder.encode(data);
      data.close();
      while (encoder.encodeQueueSize > MAX_QUEUE && failure === undefined) {
        await new Promise<void>((resolve) => (wake = resolve));
        wake = undefined;
      }
    }
    if (failure === undefined) await encoder.flush();
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
  if (failure !== undefined) throw failure;
  return { frames, ...(description === undefined ? {} : { description }) };
}

/**
 * The encoder delay of this browser AAC encoder, in samples: encodes silence, an
 * impulse and more silence, decodes it, and sees how late the impulse comes out.
 */
async function measureAacPriming(config: AudioEncoderConfig, decoderDescription: Uint8Array): Promise<number> {
  const impulseAt = 4096;
  const input = new Float32Array(16_384);
  input[impulseAt] = 1;
  const { frames } = await encodeSamples(config, input);

  const decoded: Float32Array[] = [];
  let failure: unknown;
  const decoder = new AudioDecoder({
    output(data) {
      const samples = new Float32Array(data.numberOfFrames);
      data.copyTo(samples, { planeIndex: 0, format: "f32-planar" });
      decoded.push(samples);
      data.close();
    },
    error(error) {
      failure = error;
    },
  });
  try {
    decoder.configure({ codec: config.codec, sampleRate: config.sampleRate, numberOfChannels: AUDIO_CHANNELS, description: decoderDescription });
    for (const frame of frames) {
      decoder.decode(
        new EncodedAudioChunk({ type: "key", timestamp: frame.timestampUs, data: frame.data, ...(frame.durationUs === undefined ? {} : { duration: frame.durationUs }) }),
      );
    }
    await decoder.flush();
  } finally {
    if (decoder.state !== "closed") decoder.close();
  }
  if (failure !== undefined) throw failure;

  let peakAt = 0;
  let peak = 0;
  let index = 0;
  for (const part of decoded) {
    for (const sample of part) {
      if (Math.abs(sample) > peak) {
        peak = Math.abs(sample);
        peakAt = index;
      }
      index++;
    }
  }
  return Math.max(0, peakAt - impulseAt);
}

/** Mixes the plan and encodes it as AAC (or Opus). */
export async function mixAndEncodeAudio(plan: AudioPlan): Promise<EncodedAudio> {
  const skipped: string[] = [];
  const base = { sampleRate: plan.sampleRate, channels: AUDIO_CHANNELS, primingTicks: 0, chunks: [], tried: [], skipped };
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

    let priming = 0;
    const aacConfig = entry === "mp4a" ? aacAudioSpecificConfig(plan.sampleRate, AUDIO_CHANNELS) : undefined;
    if (aacConfig !== undefined) priming = await measureAacPriming(config, aacConfig);
    // Silence after the sound, so the encoder delay never eats its end: once the
    // priming is trimmed, the track still covers the video.
    const sound = mixed.getChannelData(0);
    const frameSamples = AUDIO_FRAME_SAMPLES[entry];
    const padded = new Float32Array(sound.length + Math.max(priming, frameSamples) + frameSamples);
    padded.set(sound);
    const { frames, description } = await encodeSamples(config, padded);

    const decoderConfig = aacConfig === undefined ? opusDOps(plan.sampleRate, AUDIO_CHANNELS, description) : (description ?? aacConfig);
    // Opus carries its delay as the PreSkip of dOps, which decoders (Chrome among them) already honor: an edit list on top would trim it twice.
    const chunks = frames.map(
      (frame): AudioChunkData => ({
        data: toBase64(frame.data),
        timestampUs: frame.timestampUs,
        ...(frame.durationUs === undefined ? {} : { durationUs: frame.durationUs }),
      }),
    );
    return { status: "ok", codec, entry, description: toBase64(decoderConfig), sampleRate: plan.sampleRate, channels: AUDIO_CHANNELS, primingTicks: priming, chunks, tried, skipped };
  }
  return { ...base, status: "unsupported", tried };
}
