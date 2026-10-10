import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lightTheme, validateStoryboard } from "../src/index";
import { encodeWav } from "../src/narration/wav";
import { BrowserNotFoundError } from "../src/render/browser";
import { sceneDurations } from "../src/render/durations";
import { withRenderPage } from "../src/render/session";
import { renderVideo, type VideoResult } from "../src/render/video";
import { summarizeMp4, summarizeTracks } from "./mp4box";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "motioncraft-narrated-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const TONE_HZ = 440;
const TONE_MS = 1000;

/** A mono 24 kHz WAV of a sine tone, like the narration voice files. */
async function writeTone(path: string): Promise<void> {
  const rate = 24_000;
  const samples = Float32Array.from({ length: (rate * TONE_MS) / 1000 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * TONE_HZ * i) / rate));
  await writeFile(path, encodeWav(samples, rate));
}

describe("renderVideo with narration (integration)", () => {
  it("puts the narration in an audio track as long as the video, and it decodes to the tone", { timeout: 180_000 }, async (ctx) => {
    const validation = validateStoryboard({
      title: "Two tones",
      aspect: "16:9",
      fps: 30,
      scenes: [
        { id: "one", component: "TitleCard", props: { title: "One" }, narration: "First tone.", transition: { type: "cut" } },
        { id: "two", component: "TitleCard", props: { title: "Two" }, narration: "Second tone.", transition: { type: "cut" } },
      ],
    });
    if (!validation.ok) throw new Error(validation.errors.join("\n"));
    const storyboard = validation.storyboard;
    const wav = join(dir, "tone.wav");
    await writeTone(wav);
    const narration = Object.fromEntries(
      ["one", "two"].map((id) => [id, { sceneId: id, wavPath: wav, audioMs: TONE_MS, words: [{ text: "tone", startMs: 0, endMs: TONE_MS }] }]),
    );

    const durations = sceneDurations(storyboard, narration, lightTheme);
    const out = join(dir, "narrated.mp4");
    const result: VideoResult = await renderVideo({
      storyboard,
      theme: lightTheme,
      durations,
      narration,
      out,
    }).catch((error: unknown) => {
      if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
      throw error;
    });

    // Two tracks: H.264 video, then audio in AAC (or Opus where the browser has no AAC encoder).
    const data = await readFile(out);
    const [video, audio] = summarizeTracks(data);
    expect(summarizeTracks(data)).toHaveLength(2);
    expect(video).toMatchObject({ trackId: 1, handler: "vide", entry: "avc1" });
    expect(result.audioCodec).toMatch(/^(mp4a\.40\.2|opus)$/);
    expect(audio).toMatchObject({ trackId: 2, handler: "soun", volume: 1, channels: 1, sampleRate: 48_000, timescale: 48_000 });
    expect(audio!.entry).toBe(result.audioCodec === "opus" ? "Opus" : "mp4a");
    expect(audio!.sampleToChunk).toEqual([[1, audio!.sampleSizes.length, 1]]);

    // The edit list trims the encoder priming and plays exactly the video length; the movie is one video frame at most off.
    const videoSeconds = result.durationMs / 1000;
    const frameSeconds = 1 / result.fps;
    expect(Math.abs(summarizeMp4(data).movieSeconds - videoSeconds)).toBeLessThanOrEqual(frameSeconds);
    expect(audio!.edits).toHaveLength(1);
    const [segment, priming, rate] = audio!.edits[0]!;
    expect(rate).toBe(1);
    expect(Math.abs(segment / 1000 - videoSeconds)).toBeLessThanOrEqual(frameSeconds);
    expect(priming).toBeGreaterThanOrEqual(0); // 0 where the browser encoder already compensates its delay
    // The encoded audio, less the priming, covers the video and ends within a couple of audio frames of it.
    const playable = (audio!.durationTicks - priming) / audio!.timescale;
    expect(playable).toBeGreaterThanOrEqual(videoSeconds - 0.001);
    expect(playable - videoSeconds).toBeLessThan(3 * (1024 / 48_000));

    const [voiceOne, voiceTwo] = result.audio.sources;
    expect(voiceOne!.startMs).toBe(lightTheme.motion.leadMs);
    expect(voiceTwo!.startMs).toBeGreaterThan(voiceOne!.startMs + TONE_MS);

    // Decode the file audio in the page: the tone is where the plan put it, and quiet before it.
    const onsetSearch = [
      [0, voiceOne!.startMs + TONE_MS],
      [voiceOne!.startMs + TONE_MS + 50, voiceTwo!.startMs + TONE_MS],
    ] as const;
    const windows = [
      [0, lightTheme.motion.leadMs - 50],
      [voiceOne!.startMs + 100, voiceOne!.startMs + TONE_MS - 100],
      [voiceTwo!.startMs + 100, voiceTwo!.startMs + TONE_MS - 100],
    ] as const;
    const decoded = await withRenderPage({ storyboard, theme: lightTheme, durations }, (page) =>
      page.evaluate(
        async ([base64, spans, searches]) => {
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const buffer = await new OfflineAudioContext(1, 48_000, 48_000).decodeAudioData(bytes.buffer);
          const samples = buffer.getChannelData(0);
          const at = (ms: number) => Math.round((ms * buffer.sampleRate) / 1000);
          const stats = spans.map(([from, to]) => {
            const part = samples.subarray(at(from), at(to));
            let crossings = 0;
            let peak = 0;
            for (let i = 0; i < part.length; i++) {
              peak = Math.max(peak, Math.abs(part[i]!));
              if (i > 0 && part[i - 1]! < 0 !== part[i]! < 0) crossings++;
            }
            return { peak, hz: crossings / 2 / ((to - from) / 1000) };
          });
          // The first sample louder than a fifth of the tone, in ms, in each search span.
          const onsets = searches.map(([from, to]) => {
            for (let i = at(from); i < at(to); i++) if (Math.abs(samples[i]!) > 0.1) return (i * 1000) / buffer.sampleRate;
            return -1;
          });
          return { seconds: buffer.duration, stats, onsets };
        },
        [data.toString("base64"), windows, onsetSearch] as const,
      ),
    );
    expect(Math.abs(decoded.seconds - videoSeconds)).toBeLessThan(0.05);
    // The tone starts where the plan says, to within 2 ms: the priming is gone.
    expect(Math.abs(decoded.onsets[0]! - voiceOne!.startMs)).toBeLessThan(2);
    expect(Math.abs(decoded.onsets[1]! - voiceTwo!.startMs)).toBeLessThan(2);
    const [lead, first, second] = decoded.stats;
    expect(lead!.peak).toBeLessThan(0.05);
    for (const voice of [first!, second!]) {
      expect(voice.peak).toBeGreaterThan(0.3);
      expect(voice.hz).toBeGreaterThan(TONE_HZ * 0.95);
      expect(voice.hz).toBeLessThan(TONE_HZ * 1.05);
    }
  });
});
