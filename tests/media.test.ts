import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it, type TestContext } from "vitest";
import { buildTimeline, lightTheme, validateStoryboard, type Storyboard } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { clipAudioPlan, MediaError, parseRange, prepareMedia } from "../src/render/media";
import { Mp4Writer } from "../src/render/mp4";
import { readMp4DurationMs } from "../src/render/mp4Probe";
import { showFrame, withRenderPage } from "../src/render/session";
import { renderStills } from "../src/render/stills";
import { renderVideo } from "../src/render/video";
import { summarizeMp4 } from "./mp4box";
import { CLIP_BITS, writeTestClip, writeTestPng, type Rgb } from "./testMedia";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "motioncraft-media-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function storyboard(input: Record<string, unknown>): Storyboard {
  const validation = validateStoryboard({ title: "Media", aspect: "16:9", fps: 30, ...input });
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  return validation.storyboard;
}

/** Skips the test when no Chrome or Edge is installed. */
function skipWithoutBrowser(ctx: TestContext) {
  return (error: unknown): never => {
    if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
    throw error;
  };
}

describe("durationMs: \"clip\"", () => {
  const clipScene = (props: Record<string, unknown>) => ({ id: "clip", component: "VideoClip", props, durationMs: "clip" });

  it("is accepted for a scene with a VideoClip, also inside a window", () => {
    expect(validateStoryboard({ title: "t", aspect: "9:16", scenes: [clipScene({ src: "a.mp4" })] }).ok).toBe(true);
    const nested = { id: "w", component: "AppWindow", props: { content: { component: "VideoClip", props: { src: "a.mp4" } } }, durationMs: "clip" };
    expect(validateStoryboard({ title: "t", aspect: "9:16", scenes: [nested] }).ok).toBe(true);
  });

  it("is rejected for a scene without one, and other strings are rejected", () => {
    const noClip = validateStoryboard({ title: "t", aspect: "9:16", scenes: [{ id: "a", component: "TitleCard", props: {}, durationMs: "clip" }] });
    expect(noClip).toEqual({ ok: false, errors: [expect.stringMatching(/"clip".*VideoClip/)] });
    const bad = validateStoryboard({ title: "t", aspect: "9:16", scenes: [{ ...clipScene({ src: "a.mp4" }), durationMs: "auto" }] });
    expect(bad.ok).toBe(false);
  });

  it("must be resolved before building the timeline", () => {
    const sb = storyboard({ scenes: [clipScene({ src: "a.mp4" })] });
    expect(() => buildTimeline(sb, {})).toThrow(/"clip".*takes its length from its clip/);
    expect(buildTimeline(sb, { clip: 1000 }).totalFrames).toBe(30);
  });
});

describe("readMp4DurationMs", () => {
  it("reads the movie duration of an MP4", async () => {
    const path = join(dir, "four-frames.mp4");
    const writer = await Mp4Writer.create(path);
    for (let i = 0; i < 4; i++) await writer.addSample(Buffer.alloc(8, i), i === 0);
    await writer.finish({ width: 64, height: 64, fps: 30, avcC: Buffer.from("01640028ff", "hex") });
    expect(await readMp4DurationMs(path)).toBeCloseTo(4000 / 30, 0);
  });

  it("explains a file that is not an MP4", async () => {
    const path = join(dir, "not.mp4");
    await writeFile(path, "hello, this is not a video");
    await expect(readMp4DurationMs(path)).rejects.toThrow(/not an MP4/);
  });
});

describe("parseRange", () => {
  it("parses byte ranges for seeking", () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange("bytes=90-200", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("items=0-1", 100)).toBeNull();
  });
});

describe("prepareMedia", () => {
  it("names a missing file with the path it looked for", async () => {
    const sb = storyboard({ scenes: [{ id: "intro", component: "VideoClip", props: { src: "missing/clip.mp4" }, durationMs: 1000 }] });
    const error = await prepareMedia({ storyboard: sb, theme: lightTheme, durations: {}, mediaDir: dir }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MediaError);
    expect((error as Error).message).toContain('scene "intro"');
    expect((error as Error).message).toContain("missing/clip.mp4");
    expect((error as Error).message).toContain(join(dir, "missing", "clip.mp4"));
    expect((error as Error).message).toMatch(/not found/);
  });

  it("rejects unsupported file types and bad props, all at once", async () => {
    await writeFile(join(dir, "movie.avi"), "x");
    const sb = storyboard({
      scenes: [
        { id: "a", component: "VideoClip", props: { src: "movie.avi" }, durationMs: 1000 },
        { id: "b", component: "Image", props: { src: "photo.tiff" }, durationMs: 1000 },
        { id: "c", component: "VideoClip", props: { src: "movie.avi", trimStartMs: 500, trimEndMs: 100, rate: 0, fit: "stretch" }, durationMs: 1000 },
        { id: "d", component: "Image", props: {}, durationMs: 1000 },
      ],
    });
    const error = (await prepareMedia({ storyboard: sb, theme: lightTheme, durations: {}, mediaDir: dir }).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(MediaError);
    expect(error.message).toMatch(/scene "a".*unsupported video type ".avi"/);
    expect(error.message).toMatch(/\.mp4/);
    expect(error.message).toMatch(/scene "b".*unsupported image type ".tiff"/);
    expect(error.message).toMatch(/scene "c".*trimEndMs/);
    expect(error.message).toMatch(/scene "c".*rate/);
    expect(error.message).toMatch(/scene "c".*fit/);
    expect(error.message).toMatch(/scene "d".*src/);
  });
});

/** Luma at each point of a PNG screenshot, decoded in the page. */
async function lumasAt(page: Page, png: Buffer, points: readonly (readonly [number, number])[]): Promise<number[]> {
  return page.evaluate(
    async ([data, pts]) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      return pts.map(([x, y]) => {
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      });
    },
    [png.toString("base64"), points] as const,
  );
}

/** Points at the center of each bit stripe of a full-frame 16:9 clip. */
const stripeCenters = (width: number, height: number) =>
  Array.from({ length: CLIP_BITS }, (_, bit) => [Math.floor(((bit + 0.5) * width) / CLIP_BITS), Math.floor(height / 2)] as const);

describe("VideoClip (integration)", () => {
  const FPS = 30;
  let clip: string;
  beforeAll(async () => {
    clip = join(dir, "numbers.mp4");
    // 2 seconds; frame n shows n in binary as big color blocks.
    await writeTestClip(clip, { frames: 60, fps: FPS, width: 320, height: 180 }).catch((error: unknown) => {
      if (!(error instanceof BrowserNotFoundError)) throw error;
    });
  }, 120_000);

  it("output frame N shows source frame trimStart + N exactly", { timeout: 180_000 }, async (ctx) => {
    const sb = storyboard({
      scenes: [
        // trimStart 200 ms = source frame 6; length from the clip: (1000 - 200) ms = 24 frames.
        // A cut, so the scenes don't overlap and every output frame shows one clip.
        {
          id: "trimmed",
          component: "VideoClip",
          props: { src: "numbers.mp4", trimStartMs: 200, trimEndMs: 1000, muted: true },
          durationMs: "clip",
          transition: { type: "cut" },
        },
        // Double speed from source frame 40: frames 40, 42, 44, ...
        { id: "fast", component: "VideoClip", props: { src: "numbers.mp4", trimStartMs: 4000 / 3, rate: 2 }, durationMs: 300 },
      ],
    });
    const out = join(dir, "accurate.mp4");
    const result = await renderVideo({ storyboard: sb, theme: lightTheme, durations: {}, mediaDir: dir, out }).catch(skipWithoutBrowser(ctx));
    expect(result.frames).toBe(24 + 9);

    // Clip audio timing is kept for the future mix.
    expect(result.audio).toEqual([
      expect.objectContaining({ sceneId: "trimmed", path: clip, startMs: 0, durationMs: 800, sourceStartMs: 200, rate: 1, muted: true }),
      expect.objectContaining({ sceneId: "fast", path: clip, startMs: 800, durationMs: 300, sourceStartMs: 4000 / 3, rate: 2, muted: false }),
    ]);

    // Decode every output frame with WebCodecs and read the number it shows.
    const data = await readFile(out);
    const mp4 = summarizeMp4(data);
    const samples = mp4.sampleOffsets.map((offset, i) => ({
      data: data.subarray(offset, offset + mp4.sampleSizes[i]!).toString("base64"),
      key: mp4.syncSamples.includes(i + 1),
    }));
    const points = stripeCenters(1920, 1080);
    const trivial = storyboard({ scenes: [{ id: "x", component: "TitleCard", props: { title: "x" }, durationMs: 100 }] });
    const shown = await withRenderPage({ storyboard: trivial, theme: lightTheme, durations: {} }, (page) =>
      page.evaluate(
        async ([codec, description, chunks, pts]) => {
          const toBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const canvas = new OffscreenCanvas(1920, 1080);
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          const numbers: number[] = [];
          const decoder = new VideoDecoder({
            output(frame) {
              ctx.drawImage(frame, 0, 0);
              frame.close();
              const lumas = pts.map(([x, y]) => {
                const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
                return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
              });
              numbers.push(lumas.reduce((n, luma, bit) => (luma > 128 ? n | (1 << bit) : n), 0));
            },
            error(e) {
              throw e;
            },
          });
          decoder.configure({ codec, description: toBytes(description) });
          chunks.forEach((c, i) => decoder.decode(new EncodedVideoChunk({ type: c.key ? "key" : "delta", timestamp: i * 33_333, data: toBytes(c.data) })));
          await decoder.flush();
          return numbers;
        },
        [result.codec, mp4.avcC.toString("base64"), samples, points] as const,
      ),
    );
    const expected = [...Array.from({ length: 24 }, (_, n) => 6 + n), ...Array.from({ length: 9 }, (_, n) => 40 + 2 * n)];
    expect(shown).toEqual(expected);
  });

  it("plays inside an AppWindow, in both aspect ratios", { timeout: 120_000 }, async (ctx) => {
    for (const aspect of ["9:16", "16:9"] as const) {
      const sb = storyboard({
        aspect,
        scenes: [{ id: "w", component: "AppWindow", props: { title: "Demo", content: { component: "VideoClip", props: { src: "numbers.mp4", fit: "contain" } } }, durationMs: 1000 }],
      });
      const paths = await renderStills({ storyboard: sb, theme: lightTheme, durations: {}, mediaDir: dir, frames: [15], outDir: join(dir, `window-${aspect.replace(":", "x")}`) }).catch(skipWithoutBrowser(ctx));
      expect(paths).toHaveLength(1);
    }
  });

  it("fails clearly when the browser cannot decode the file", { timeout: 120_000 }, async (ctx) => {
    await writeFile(join(dir, "broken.mp4"), Buffer.alloc(4096, 7));
    const sb = storyboard({ scenes: [{ id: "broken", component: "VideoClip", props: { src: "broken.mp4" }, durationMs: 500 }] });
    const error = await renderStills({ storyboard: sb, theme: lightTheme, durations: {}, mediaDir: dir, frames: [0], outDir: join(dir, "broken") }).then(
      () => undefined,
      (e: unknown) => e,
    );
    if (error instanceof BrowserNotFoundError) ctx.skip("no Chrome or Edge installed");
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/VideoClip "broken\.mp4".*(cannot|could not) (be )?(decode|play)/i);
  });
});

describe("Image (integration)", () => {
  const RED: Rgb = [230, 40, 40];
  const BLUE: Rgb = [40, 60, 230];
  beforeAll(async () => {
    // 4:1 image: left half red, right half blue.
    await writeTestPng(join(dir, "halves.png"), 400, 100, (x) => (x < 200 ? RED : BLUE));
  });

  async function shot(ctx: TestContext, sb: Storyboard, frame: number, points: readonly (readonly [number, number])[]) {
    return withRenderPage({ storyboard: sb, theme: lightTheme, durations: {}, mediaDir: dir }, async (page) => {
      await showFrame(page, frame);
      return lumasAt(page, await page.screenshot(), points);
    }).catch(skipWithoutBrowser(ctx));
  }
  const RED_LUMA = 0.2126 * 230 + 0.7152 * 40 + 0.0722 * 40;
  const BLUE_LUMA = 0.2126 * 40 + 0.7152 * 60 + 0.0722 * 230;
  const isRed = (l: number) => Math.abs(l - RED_LUMA) < 12;
  const isBlue = (l: number) => Math.abs(l - BLUE_LUMA) < 12;

  it("covers the frame around its focal point, in both aspect ratios", { timeout: 120_000 }, async (ctx) => {
    for (const aspect of ["9:16", "16:9"] as const) {
      const { width, height } = aspect === "9:16" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
      const pts = [[10, height / 2], [width - 10, height / 2]] as const;
      const scene = (focus: { x: number; y: number }) => storyboard({ aspect, scenes: [{ id: "i", component: "Image", props: { src: "halves.png", focus }, durationMs: 500 }] });
      // Cover crops the 4:1 image's sides; the focal point picks which part stays.
      const left = await shot(ctx, scene({ x: 0, y: 0.5 }), 0, pts);
      expect(left.every(isRed)).toBe(true);
      const right = await shot(ctx, scene({ x: 1, y: 0.5 }), 0, pts);
      expect(right.every(isBlue)).toBe(true);
    }
  });

  it("contains the whole image when asked", { timeout: 60_000 }, async (ctx) => {
    const sb = storyboard({ scenes: [{ id: "i", component: "Image", props: { src: "halves.png", fit: "contain" }, durationMs: 500 }] });
    const [l, r, top] = await shot(ctx, sb, 0, [[20, 540], [1900, 540], [960, 20]]);
    expect(isRed(l!)).toBe(true);
    expect(isBlue(r!)).toBe(true);
    // Letterboxed: the 4:1 image is 480 px tall, so the top of the frame shows the ground.
    expect(isRed(top!) || isBlue(top!)).toBe(false);
  });

  it("Ken Burns: zooms in about the focal point over the scene", { timeout: 60_000 }, async (ctx) => {
    // Contained 4:1 image, zooming 1x -> 2x about its center: the image's edge moves outward.
    const sb = storyboard({ scenes: [{ id: "i", component: "Image", props: { src: "halves.png", fit: "contain", zoom: { from: 1, to: 2 } }, durationMs: 1000 }] });
    const probe = [[700, 540 - 300]] as const; // above the unzoomed image (540 +/- 240), inside the 2x one
    const [before] = await shot(ctx, sb, 0, probe);
    const [after] = await shot(ctx, sb, 29, probe);
    expect(isRed(before!) || isBlue(before!)).toBe(false);
    expect(isRed(after!)).toBe(true);
  });

  it("fills an AppWindow's content box", { timeout: 60_000 }, async (ctx) => {
    const sb = storyboard({ scenes: [{ id: "w", component: "AppWindow", props: { title: "Photo", content: { component: "Image", props: { src: "halves.png", focus: { x: 0, y: 0.5 } } } }, durationMs: 2000 }] });
    // Mid-scene the window has settled; its content box sits inside the 16:9 content area.
    const [inside, outside] = await shot(ctx, sb, 30, [[960, 600], [8, 8]]);
    expect(isRed(inside!)).toBe(true);
    expect(isRed(outside!) || isBlue(outside!)).toBe(false);
  });
});

describe("clipAudioPlan", () => {
  it("places each clip's audio on the timeline", () => {
    const sb = storyboard({
      scenes: [
        { id: "title", component: "TitleCard", props: { title: "Hi" }, durationMs: 1000 },
        { id: "win", component: "AppWindow", props: { content: { component: "VideoClip", props: { src: "a.mp4", trimStartMs: 500, rate: 0.5 } } }, durationMs: 2000 },
        { id: "long", component: "VideoClip", props: { src: "/abs/b.mp4", trimEndMs: 1500, muted: true }, durationMs: 3000 },
      ],
    });
    const timeline = buildTimeline(sb, {});
    const plan = clipAudioPlan(sb, timeline, "/media");
    expect(plan).toEqual([
      { sceneId: "win", src: "a.mp4", path: resolve("/media", "a.mp4"), startMs: 1000, durationMs: 2000, sourceStartMs: 500, rate: 0.5, muted: false },
      // The clip ends (at trimEnd) before the scene does.
      { sceneId: "long", src: "/abs/b.mp4", path: resolve("/abs/b.mp4"), startMs: 3000, durationMs: 1500, sourceStartMs: 0, rate: 1, muted: true },
    ]);
  });
});
