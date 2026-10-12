import { describe, expect, it } from "vitest";
import { lightTheme, validateStoryboard } from "../src/index";
import { readWavInfo } from "../src/narration/wavInfo";
import { BrowserNotFoundError } from "../src/render/browser";
import { withRenderPage } from "../src/render/session";
import { toneWav } from "./toneWav";

// Every WAV layout `readWavInfo` accepts must also decode in the page that mixes the audio, at the length it read.
describe("scene audio files decode in the render page (integration)", () => {
  it("decodes 16-bit, 24-bit and float WAVs, mono and stereo, at any rate, to the length read from the header", { timeout: 120_000 }, async (ctx) => {
    const wavs = [
      toneWav(1200, { rate: 22_050 }),
      toneWav(900, { rate: 44_100, channels: 2, bits: 24 }),
      toneWav(1500, { rate: 48_000, channels: 2, float: true }),
    ];
    const validation = validateStoryboard({ title: "T", aspect: "16:9", scenes: [{ id: "a", component: "TitleCard", props: { title: "x" }, durationMs: 500 }] });
    if (!validation.ok) throw new Error(validation.errors.join("\n"));
    const decoded = await withRenderPage({ storyboard: validation.storyboard, theme: lightTheme, durations: {} }, (page) =>
      page.evaluate(async (all) => {
        const out: { ms: number; peak: number }[] = [];
        for (const base64 of all) {
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const buffer = await new OfflineAudioContext(1, 48_000, 48_000).decodeAudioData(bytes.buffer);
          const samples = buffer.getChannelData(0);
          let peak = 0;
          for (const s of samples) peak = Math.max(peak, Math.abs(s));
          out.push({ ms: buffer.duration * 1000, peak });
        }
        return out;
      }, wavs.map((wav) => Buffer.from(wav).toString("base64"))),
    ).catch((error: unknown) => {
      if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
      throw error;
    });
    decoded.forEach(({ ms, peak }, i) => {
      expect(Math.abs(ms - readWavInfo(wavs[i]!).audioMs)).toBeLessThan(5);
      expect(peak).toBeGreaterThan(0.15);
    });
  });
});
