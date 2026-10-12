import { describe, expect, it } from "vitest";
import { RENDER_USAGE, parseRenderArgs } from "../src/render/args";
import { AUDIO_BITRATE } from "../src/render/audioEncode";
import { DEFAULT_MAX_MB, MIN_VIDEO_BITRATE, videoBitrateFor } from "../src/render/budget";
import { VIDEO_BITRATE } from "../src/render/encode";

const MB = 1024 * 1024;

describe("videoBitrateFor", () => {
  it("fits 56 s with audio into 9.5 MB at about 1.2 Mbps", () => {
    const bitrate = videoBitrateFor({ durationSeconds: 56, maxBytes: 9.5 * MB, audioBitrate: AUDIO_BITRATE });
    expect(bitrate).toBeGreaterThan(1_100_000);
    expect(bitrate).toBeLessThan(1_250_000);
    // Video and audio at these rates stay inside the budget.
    expect(((bitrate + AUDIO_BITRATE) * 56) / 8).toBeLessThan(9.5 * MB);
  });

  it("never goes above today's 8 Mbps for a short video", () => {
    expect(videoBitrateFor({ durationSeconds: 5, maxBytes: 9.5 * MB, audioBitrate: AUDIO_BITRATE })).toBe(VIDEO_BITRATE);
  });

  it("never goes below 600 kbps for a very long video", () => {
    expect(MIN_VIDEO_BITRATE).toBe(600_000);
    expect(videoBitrateFor({ durationSeconds: 30 * 60, maxBytes: 9.5 * MB, audioBitrate: AUDIO_BITRATE })).toBe(MIN_VIDEO_BITRATE);
  });

  it("gives the audio's share to the video when there is no audio", () => {
    const withAudio = videoBitrateFor({ durationSeconds: 56, maxBytes: 9.5 * MB, audioBitrate: AUDIO_BITRATE });
    const silent = videoBitrateFor({ durationSeconds: 56, maxBytes: 9.5 * MB, audioBitrate: 0 });
    expect(silent).toBe(Math.floor((9.5 * MB * 8 * 0.92) / 56));
    expect(silent - withAudio).toBe(AUDIO_BITRATE);
  });
});

describe("parseRenderArgs --max-mb", () => {
  const base = ["sb.json", "--out", "a.mp4"];

  it("defaults to 9.5", () => {
    expect(DEFAULT_MAX_MB).toBe(9.5);
    expect(parseRenderArgs(base).maxMb).toBe(9.5);
  });

  it("parses a number, and 0 for no budget", () => {
    expect(parseRenderArgs([...base, "--max-mb", "20"]).maxMb).toBe(20);
    expect(parseRenderArgs([...base, "--max-mb", "0"]).maxMb).toBe(0);
    expect(parseRenderArgs([...base, "--max-mb", "4.5"]).maxMb).toBe(4.5);
  });

  it("rejects negative and non-numbers with the usage message", () => {
    for (const bad of ["-1", "abc", "", "10mb", "Infinity"]) {
      expect(() => parseRenderArgs([...base, `--max-mb=${bad}`])).toThrow(RENDER_USAGE);
    }
    expect(() => parseRenderArgs([...base, "--max-mb", "-1"])).toThrow(RENDER_USAGE);
    expect(() => parseRenderArgs([...base, "--max-mb"])).toThrow(RENDER_USAGE);
  });
});
