// Renders a whole storyboard to an MP4 (H.264, plus an AAC or Opus audio track
// when there is narration or clip audio) in the installed Chrome or Edge: each
// frame is rendered and captured in the page, encoded there with WebCodecs, and
// the encoded chunks come back to Node a few at a time and stream into the MP4
// file. The audio is mixed and encoded in the page at the end. No ffmpeg, no
// frame files on disk.

import { mkdir, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { CDPSession, Page } from "playwright-core";
import { buildTimeline } from "../engine/timeline";
import { frameSize } from "../layout/frame";
import { browserLabel } from "./browser";
import type { SceneNarration } from "../narration/types";
import { chunkTicks, type EncodedAudio } from "./audioEncode";
import { audioPlan, type AudioPlan } from "./audioPlan";
import { planFrame, type EncodedChunk } from "./encode";
import { clipAudioPlan, prepareMedia } from "./media";
import { Mp4Writer, type Mp4AudioTrack, type Mp4Track } from "./mp4";
import type { PageInput } from "./page";
import { checkComponents, showFrame, withRenderPage } from "./session";

export interface VideoProgress {
  /** Frames encoded so far. */
  frames: number;
  totalFrames: number;
}

export interface VideoOptions extends Omit<PageInput, "narration"> {
  /** Each narrated scene's audio, words and WAV file (see `loadCachedNarration`). Voices the video. */
  narration?: Record<string, SceneNarration>;
  /** The .mp4 file to write. */
  out: string;
  onProgress?: (progress: VideoProgress) => void;
}

export interface VideoResult {
  path: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  durationMs: number;
  bytes: number;
  /** The codec string the browser encoded with, e.g. "avc1.64002A". */
  codec: string;
  /** The codec string of the audio track ("mp4a.40.2" or "opus"); absent when the MP4 has no audio. */
  audioCodec?: string;
  /** What was mixed into the audio track; no sources, no track. */
  audio: AudioPlan;
}

export class UnsupportedCodecError extends Error {
  constructor(browser: string, tried: readonly string[]) {
    super(
      `${browser} cannot encode H.264 video (avc1) with WebCodecs, which motioncraft needs to render MP4. ` +
        `Tried: ${tried.join(", ")}. Update the browser, or install Google Chrome, and try again.`,
    );
    this.name = "UnsupportedCodecError";
  }
}

export class UnsupportedAudioCodecError extends Error {
  constructor(browser: string, tried: readonly string[]) {
    super(
      `${browser} cannot encode AAC or Opus audio with WebCodecs, which motioncraft needs to put sound in the MP4. ` +
        `Tried: ${tried.join(", ")}. Update the browser, or install Google Chrome, and try again.`,
    );
    this.name = "UnsupportedAudioCodecError";
  }
}

/** Captures what the page shows right now as a base64 PNG, exactly viewport-sized. */
async function capture(cdp: CDPSession): Promise<string> {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
  return data;
}

/** Mixes and encodes the plan in the page and hands the samples to the writer; undefined if nothing was audible. */
async function addAudio(page: Page, plan: AudioPlan, writer: Mp4Writer): Promise<{ track: Mp4AudioTrack; codec: string } | undefined> {
  const encoded: EncodedAudio = await page.evaluate((p) => window.motioncraft!.mixAndEncodeAudio(p), plan);
  if (encoded.status === "unsupported") throw new UnsupportedAudioCodecError(browserLabel(page.context().browser()!), encoded.tried);
  if (encoded.status === "silent" || encoded.chunks.length === 0) return undefined;
  const ticks = chunkTicks(encoded.chunks, encoded.sampleRate);
  for (const [i, chunk] of encoded.chunks.entries()) writer.addAudioSample(Buffer.from(chunk.data, "base64"), ticks[i]!);
  return {
    codec: encoded.codec!,
    track: { codec: encoded.entry!, sampleRate: encoded.sampleRate, channels: encoded.channels, description: Buffer.from(encoded.description!, "base64") },
  };
}

/** Renders the storyboard to `out` as an MP4 and returns what was written. */
export async function renderVideo(options: VideoOptions): Promise<VideoResult> {
  const { out, onProgress } = options;
  checkComponents(options);
  const { input, sourceDurationsMs } = await prepareMedia(options);
  const { storyboard, durations, theme } = input;
  const timeline = buildTimeline(storyboard, durations, theme);
  const plan = audioPlan(storyboard, timeline, theme, options.narration ?? {}, clipAudioPlan(storyboard, timeline, input.mediaDir, sourceDurationsMs));
  const { fps, totalFrames } = timeline;
  const { width, height } = frameSize(storyboard.aspect);
  await mkdir(dirname(out), { recursive: true });

  return withRenderPage(input, async (page) => {
    const start = await page.evaluate((setup) => window.motioncraft!.encoder.start(setup), {
      width,
      height,
      fps,
    });
    if (start.codec === null) throw new UnsupportedCodecError(browserLabel(page.context().browser()!), start.tried);
    const codec = start.codec;

    const writer = await Mp4Writer.create(out);
    let track: Mp4Track | undefined;
    let audioCodec: string | undefined;

    const write = async (chunks: EncodedChunk[]) => {
      for (const chunk of chunks) {
        const expected = planFrame(writer.frames, fps);
        if (chunk.timestampUs !== expected.timestampUs) {
          throw new Error(
            `encoder returned frame at ${chunk.timestampUs}µs, expected frame ${expected.frame} at ${expected.timestampUs}µs`,
          );
        }
        if (chunk.config !== undefined) {
          track = {
            width,
            height,
            fps,
            avcC: Buffer.from(chunk.config.description, "base64"),
            colorSpace: chunk.config.colorSpace,
          };
        }
        await writer.addSample(Buffer.from(chunk.data, "base64"), chunk.keyFrame);
        onProgress?.({ frames: writer.frames, totalFrames });
      }
    };

    try {
      const cdp = await page.context().newCDPSession(page);
      for (let frame = 0; frame < totalFrames; frame++) {
        await showFrame(page, frame);
        const png = await capture(cdp);
        await write(await page.evaluate(([data, n]) => window.motioncraft!.encoder.encodeFrame(data, n), [png, frame] as const));
      }
      await write(await page.evaluate(() => window.motioncraft!.encoder.finish()));

      if (writer.frames !== totalFrames) throw new Error(`encoder returned ${writer.frames} of ${totalFrames} frames`);
      if (track === undefined) throw new Error("encoder did not report its H.264 configuration (avcC)");
      const audio = plan.sources.length === 0 ? undefined : await addAudio(page, plan, writer);
      await writer.finish(track, audio?.track);
      audioCodec = audio?.codec;
    } catch (error) {
      await writer.abort();
      await rm(out, { force: true });
      throw error;
    }

    return {
      path: out,
      width,
      height,
      fps,
      frames: totalFrames,
      durationMs: (totalFrames * 1000) / fps,
      bytes: (await stat(out)).size,
      codec,
      ...(audioCodec === undefined ? {} : { audioCodec }),
      audio: plan,
    };
  }, options.narration);
}
