// H.264 encoding with the browser's WebCodecs `VideoEncoder`. The top half is
// the pure plan (timestamps, keyframes, codec level); the bottom half runs in
// the render page, bundled with it, and is driven by `renderVideo`.
//
// How a frame becomes pixels: the driver renders the frame's DOM, takes a
// screenshot of the page through the DevTools protocol and hands the PNG back
// to the page, which decodes it into a `VideoFrame`. That is the same
// compositor output stills and checks use, so the video shows exactly the
// pixels that were checked, at exactly the frame size (the viewport is the
// frame, at device scale 1). Drawing the DOM into a canvas ourselves (SVG
// foreignObject, html2canvas) would be a second renderer with its own font and
// layout quirks. PNG is lossless, so nothing is lost before the encoder.

/** About 8 Mbps: plenty for code-drawn 1080p graphics. */
export const VIDEO_BITRATE = 8_000_000;

/** A keyframe at least this often, so players can seek. */
export const MAX_KEYFRAME_SECONDS = 2;

/** Frames between keyframes: as many as fit in `MAX_KEYFRAME_SECONDS`, at least 1. */
export function keyframeInterval(fps: number): number {
  return Math.max(1, Math.floor(fps * MAX_KEYFRAME_SECONDS));
}

/** Frame `n` starts at n/fps seconds, in whole microseconds (WebCodecs' unit). */
export function frameTimestampUs(frame: number, fps: number): number {
  return Math.round((frame * 1_000_000) / fps);
}

export interface PlannedFrame {
  frame: number;
  timestampUs: number;
  durationUs: number;
  keyFrame: boolean;
}

/** Timestamp, duration and keyframe flag for one frame of the video. */
export function planFrame(frame: number, fps: number): PlannedFrame {
  const timestampUs = frameTimestampUs(frame, fps);
  return {
    frame,
    timestampUs,
    durationUs: frameTimestampUs(frame + 1, fps) - timestampUs,
    keyFrame: frame % keyframeInterval(fps) === 0,
  };
}

/** The plan for every frame of a `totalFrames`-long video. */
export function encodePlan(totalFrames: number, fps: number): PlannedFrame[] {
  return Array.from({ length: totalFrames }, (_, frame) => planFrame(frame, fps));
}

// H.264 levels by their limits (Table A-1): max macroblocks per second and per
// frame. Both 1080p shapes are 8160 macroblocks per frame.
const AVC_LEVELS = [
  { idc: 0x28, mbPerSecond: 245_760, mbPerFrame: 8_192 }, // 4.0
  { idc: 0x2a, mbPerSecond: 522_240, mbPerFrame: 8_704 }, // 4.2
  { idc: 0x32, mbPerSecond: 589_824, mbPerFrame: 22_080 }, // 5.0
  { idc: 0x33, mbPerSecond: 983_040, mbPerFrame: 36_864 }, // 5.1
  { idc: 0x34, mbPerSecond: 2_073_600, mbPerFrame: 36_864 }, // 5.2
] as const;

/** The lowest H.264 level that allows this frame size and rate. */
export function avcLevel(width: number, height: number, fps: number): number {
  const mbPerFrame = Math.ceil(width / 16) * Math.ceil(height / 16);
  const level = AVC_LEVELS.find((l) => mbPerFrame <= l.mbPerFrame && mbPerFrame * fps <= l.mbPerSecond);
  if (level === undefined) throw new Error(`H.264 cannot encode ${width}x${height} at ${fps} fps`);
  return level.idc;
}

const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");

/**
 * Codec strings to try, best first: High, then Main, then Constrained Baseline,
 * all at the level the size and rate need.
 */
export function avcCodecCandidates(width: number, height: number, fps: number): string[] {
  const level = hex(avcLevel(width, height, fps));
  return [`avc1.6400${level}`, `avc1.4D00${level}`, `avc1.42E0${level}`];
}

// ---------------------------------------------------------------------------
// Page side. Everything below runs in the browser.

export interface EncoderSetup {
  width: number;
  height: number;
  fps: number;
}

/** What `start` found. `codec` is null when the browser cannot encode H.264 at all. */
export interface EncoderStart {
  codec: string | null;
  tried: string[];
}

/** The decoder settings the encoder reported with its first chunk. */
export interface EncodedConfig {
  /** The avcC record, base64. */
  description: string;
  colorSpace?: VideoColorSpaceInit;
}

/** One encoded frame, sent back to Node. */
export interface EncodedChunk {
  /** base64, so it crosses the page boundary as a plain string. */
  data: string;
  keyFrame: boolean;
  timestampUs: number;
  config?: EncodedConfig;
}

export interface PageEncoder {
  start(setup: EncoderSetup): Promise<EncoderStart>;
  /** Encodes frame `n` from a base64 PNG of the page. Returns the chunks ready so far. */
  encodeFrame(png: string, frame: number): Promise<EncodedChunk[]>;
  /** Flushes the encoder and returns the remaining chunks. */
  finish(): Promise<EncodedChunk[]>;
}

/** Frames waiting in the encoder before `encodeFrame` waits for it to catch up. */
const MAX_QUEUE = 4;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function toBytes(buffer: AllowSharedBufferSource): Uint8Array {
  if (buffer instanceof ArrayBuffer || buffer instanceof SharedArrayBuffer) return new Uint8Array(buffer);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export function createPageEncoder(): PageEncoder {
  let encoder: VideoEncoder | undefined;
  let setup: EncoderSetup | undefined;
  let failure: unknown;
  let pending: EncodedChunk[] = [];
  /** Wakes `encodeFrame` when it waits for the queue to drain, or on an error. */
  let wake: (() => void) | undefined;

  const take = (): EncodedChunk[] => {
    if (failure !== undefined) throw failure;
    const chunks = pending;
    pending = [];
    return chunks;
  };

  return {
    async start(next) {
      setup = next;
      const { width, height, fps } = next;
      const tried: string[] = [];
      for (const codec of avcCodecCandidates(width, height, fps)) {
        // Software first: the same encoder on every machine. Hardware if that is all there is.
        for (const hardwareAcceleration of ["prefer-software", "no-preference"] as const) {
          const config: VideoEncoderConfig = {
            codec,
            width,
            height,
            framerate: fps,
            bitrate: VIDEO_BITRATE,
            hardwareAcceleration,
            latencyMode: "quality",
            avc: { format: "avc" },
          };
          tried.push(`${codec} (${hardwareAcceleration})`);
          if (!(await VideoEncoder.isConfigSupported(config)).supported) continue;
          encoder = new VideoEncoder({
            output(chunk, metadata) {
              const data = new Uint8Array(chunk.byteLength);
              chunk.copyTo(data);
              const decoder = metadata?.decoderConfig;
              pending.push({
                data: toBase64(data),
                keyFrame: chunk.type === "key",
                timestampUs: chunk.timestamp,
                config:
                  decoder?.description === undefined
                    ? undefined
                    : { description: toBase64(toBytes(decoder.description)), colorSpace: decoder.colorSpace },
              });
            },
            error(error) {
              failure = error;
              wake?.();
            },
          });
          encoder.addEventListener("dequeue", () => wake?.());
          encoder.configure(config);
          return { codec, tried };
        }
      }
      return { codec: null, tried };
    },

    async encodeFrame(png, frame) {
      if (encoder === undefined || setup === undefined) throw new Error("encoder not started");
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      try {
        if (bitmap.width !== setup.width || bitmap.height !== setup.height) {
          throw new Error(
            `frame ${frame} captured at ${bitmap.width}x${bitmap.height}, expected ${setup.width}x${setup.height}`,
          );
        }
        const plan = planFrame(frame, setup.fps);
        const videoFrame = new VideoFrame(bitmap, { timestamp: plan.timestampUs, duration: plan.durationUs });
        encoder.encode(videoFrame, { keyFrame: plan.keyFrame });
        videoFrame.close();
      } finally {
        bitmap.close();
      }
      while (encoder.encodeQueueSize > MAX_QUEUE && failure === undefined) {
        await new Promise<void>((resolve) => (wake = resolve));
        wake = undefined;
      }
      return take();
    },

    async finish() {
      if (encoder === undefined) throw new Error("encoder not started");
      if (failure === undefined) await encoder.flush();
      const chunks = take();
      encoder.close();
      return chunks;
    },
  };
}
