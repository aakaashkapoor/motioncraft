import { describe, expect, it } from "vitest";
import { buildTimeline, neutralTheme, validateStoryboard } from "../src/index";
import { mediaUrl, narrationFile, narrationFileName, narrationUrl } from "../src/kit/mediaSource";
import { audioPlan, CLIP_GAIN_UNDER_NARRATION, SAMPLE_RATE } from "../src/render/audioPlan";
import { clipAudioPlan } from "../src/render/media";

function plan(scenes: Record<string, unknown>[], narrated: string[]) {
  const validation = validateStoryboard({ title: "t", aspect: "16:9", fps: 30, scenes });
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  const storyboard = validation.storyboard;
  const timeline = buildTimeline(storyboard, {}, neutralTheme);
  const narration = Object.fromEntries(narrated.map((id) => [id, { audioMs: 1500 }]));
  const make = (n: Record<string, { audioMs: number }> = narration) =>
    audioPlan(storyboard, timeline, neutralTheme, n, clipAudioPlan(storyboard, timeline, "media"));
  return { timeline, make };
}

const title = (id: string, durationMs: number, extra: Record<string, unknown> = {}) => ({
  id,
  component: "TitleCard",
  props: { title: id },
  durationMs,
  transition: { type: "cut" },
  ...extra,
});
const clip = (id: string, props: Record<string, unknown>, durationMs = 2000) => ({
  id,
  component: "VideoClip",
  props: { src: "a.mp4", ...props },
  durationMs,
  transition: { type: "cut" },
});

describe("narration URLs", () => {
  it("round-trips a file name and rejects other URLs", () => {
    const url = narrationUrl(narrationFileName("my scene/1"));
    expect(url).toBe("https://motioncraft.localhost/narration/my%20scene%2F1.wav");
    expect(narrationFile(url)).toBe("my scene/1.wav");
    expect(narrationFile(`${url}?t=1`)).toBe("my scene/1.wav");
    expect(narrationFile(mediaUrl("a.wav"))).toBeUndefined();
    expect(narrationFile("https://example.com/narration/a.wav")).toBeUndefined();
    expect(narrationFile("https://motioncraft.localhost/narration/%E0%A4%A")).toBeUndefined();
  });
});

describe("audioPlan", () => {
  it("starts each narration at its scene start plus the lead, at full gain and full length", () => {
    const { make, timeline } = plan([title("a", 3000), title("b", 3000)], ["a", "b"]);
    const result = make();
    const lead = neutralTheme.motion.leadMs;
    expect(result.sampleRate).toBe(SAMPLE_RATE);
    expect(result.durationMs).toBe((timeline.totalFrames * 1000) / timeline.fps);
    expect(result.sources).toEqual([
      { src: narrationUrl("a.wav"), startMs: lead, durationMs: 1500, sourceStartMs: 0, rate: 1, gain: 1 },
      { src: narrationUrl("b.wav"), startMs: 3000 + lead, durationMs: 1500, sourceStartMs: 0, rate: 1, gain: 1 },
    ]);
  });

  it("plays an unmuted clip at 0.35 under narration and at 1.0 elsewhere", () => {
    const { make } = plan([clip("under", { trimStartMs: 500, rate: 2 }), clip("alone", {})], ["under"]);
    const [voice, under, alone] = make().sources;
    expect(voice!.src).toBe(narrationUrl("under.wav"));
    expect(under).toEqual({ src: mediaUrl("a.mp4"), startMs: 0, durationMs: 2000, sourceStartMs: 500, rate: 2, gain: CLIP_GAIN_UNDER_NARRATION });
    expect(CLIP_GAIN_UNDER_NARRATION).toBe(0.35);
    expect(alone).toMatchObject({ startMs: 2000, gain: 1 });
  });

  it("leaves out muted clips and scenes without narration audio", () => {
    const scenes = [clip("m", { muted: true }), title("quiet", 1000)];
    const { make } = plan(scenes, []);
    expect(make().sources).toEqual([]);
    expect(make({ other: { audioMs: 10 } }).sources).toEqual([]);
  });

  it("has no sources, so no audio track, for a silent storyboard", () => {
    expect(plan([title("a", 1000)], []).make().sources).toHaveLength(0);
  });
});
