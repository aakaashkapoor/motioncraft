// Renders a whole storyboard to an MP4 (H.264, silent for now) in the installed
// Chrome or Edge: each frame is rendered and captured in the page, encoded
// there with WebCodecs, and the encoded chunks come back to Node a few at a
// time and stream into the MP4 file. No ffmpeg, no frame files on disk.

import { mkdir, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { CDPSession } from "playwright-core";
import { buildTimeline } from "../engine/timeline";
import { frameSize } from "../layout/frame";
import { browserLabel } from "./browser";
import { planFrame, type EncodedChunk } from "./encode";
import { Mp4Writer, type Mp4Track } from "./mp4";
import type { PageInput } from "./page";
import { checkComponents, showFrame, withRenderPage } from "./session";

export interface VideoProgress {
  /** Frames encoded so far. */
  frames: number;
  totalFrames: number;
}

export interface VideoOptions extends PageInput {
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

/** Captures what the page shows right now as a base64 PNG, exactly viewport-sized. */
async function capture(cdp: CDPSession): Promise<string> {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
  return data;
}

/** Renders the storyboard to `out` as an MP4 and returns what was written. */
export async function renderVideo(options: VideoOptions): Promise<VideoResult> {
  const { storyboard, theme, durations, out, onProgress } = options;
  checkComponents(options);
  const { fps, totalFrames } = buildTimeline(storyboard, durations);
  const { width, height } = frameSize(storyboard.aspect);
  await mkdir(dirname(out), { recursive: true });

  return withRenderPage({ storyboard, theme, durations }, async (page) => {
    const start = await page.evaluate((setup) => window.motioncraft!.encoder.start(setup), {
      width,
      height,
      fps,
    });
    if (start.codec === null) throw new UnsupportedCodecError(browserLabel(page.context().browser()!), start.tried);
    const codec = start.codec;

    const writer = await Mp4Writer.create(out);
    let track: Mp4Track | undefined;

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
      await writer.finish(track);
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
    };
  });
}
