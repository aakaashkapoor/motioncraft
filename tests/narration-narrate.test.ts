import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KOKORO_REVISION } from "../src/narration/assets";
import { narrateStoryboard } from "../src/narration/narrate";
import type { Synthesizer } from "../src/narration/kokoro";
import { decodeWav } from "../src/narration/wav";
import { validateStoryboard } from "../src/index";
import type { Storyboard } from "../src/index";

const SAMPLE_RATE = 24000;

/** 100 ms of audio per character of text, so durations are easy to predict. */
function fakeSynth(): Synthesizer & { calls: { text: string; voice: string }[] } {
  const calls: { text: string; voice: string }[] = [];
  return {
    calls,
    async speak(text, voice) {
      calls.push({ text, voice });
      return { samples: new Float32Array(text.length * 2400).fill(0.1), sampleRate: SAMPLE_RATE };
    },
  };
}

function board(extra: Record<string, unknown> = {}, narration = "Hi there. Bye now."): Storyboard {
  const result = validateStoryboard({
    title: "T",
    aspect: "9:16",
    scenes: [
      { id: "a", component: "Title", props: {}, narration },
      { id: "b", component: "Title", props: {}, durationMs: 1000 },
    ],
    ...extra,
  });
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.storyboard;
}

let outDir: string;
beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "mc-narrate-"));
});
afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe("narrateStoryboard", () => {
  it("speaks each sentence, joins them with 250 ms of silence, and writes a wav and json", async () => {
    const synth = fakeSynth();
    const result = await narrateStoryboard(board(), { synthesizer: synth, outDir });

    expect(synth.calls.map((c) => c.text)).toEqual(["Hi there.", "Bye now."]);
    expect(Object.keys(result)).toEqual(["a"]); // the silent scene has no narration

    const scene = result["a"]!;
    expect(scene.sceneId).toBe("a");
    // 900 ms + 250 ms gap + 800 ms
    expect(scene.audioMs).toBe(1950);
    const key = createHash("sha1").update(`${KOKORO_REVISION}af_heartHi there. Bye now.`).digest("hex");
    expect(scene.wavPath).toBe(join(outDir, `${key}.wav`));

    const wav = decodeWav(new Uint8Array(await readFile(scene.wavPath)));
    expect(wav.sampleRate).toBe(SAMPLE_RATE);
    expect(wav.samples).toHaveLength(1950 * 24);
    expect(wav.samples[0]).toBeCloseTo(0.1, 2);
    expect(wav.samples[900 * 24 + 10]).toBe(0); // inside the gap
    expect(wav.samples[1150 * 24 + 10]).toBeCloseTo(0.1, 2);

    expect(scene.words.map((w) => w.text)).toEqual(["Hi", "there.", "Bye", "now."]);
    expect(scene.words[0]!.startMs).toBe(0);
    expect(scene.words[1]!.endMs).toBeCloseTo(900);
    expect(scene.words[2]!.startMs).toBeCloseTo(1150);
    expect(scene.words[3]!.endMs).toBeCloseTo(1950);

    expect(JSON.parse(await readFile(join(outDir, `${key}.json`), "utf8"))).toEqual({
      audioMs: scene.audioMs,
      words: scene.words,
    });
  });

  it("reuses the files on a second run without synthesizing", async () => {
    const first = await narrateStoryboard(board(), { synthesizer: fakeSynth(), outDir });
    const again = fakeSynth();
    const second = await narrateStoryboard(board(), { synthesizer: again, outDir });
    expect(again.calls).toEqual([]);
    expect(second).toEqual(first);
    expect((await readdir(outDir)).sort()).toHaveLength(2);
  });

  it("uses the option voice, else the storyboard voice, else af_heart", async () => {
    const a = fakeSynth();
    await narrateStoryboard(board({ voice: "af_bella" }), { synthesizer: a, outDir, voice: "am_michael" });
    expect(new Set(a.calls.map((c) => c.voice))).toEqual(new Set(["am_michael"]));

    const b = fakeSynth();
    await narrateStoryboard(board({ voice: "af_bella" }), { synthesizer: b, outDir });
    expect(new Set(b.calls.map((c) => c.voice))).toEqual(new Set(["af_bella"]));

    const c = fakeSynth();
    await narrateStoryboard(board(), { synthesizer: c, outDir });
    expect(new Set(c.calls.map((x) => x.voice))).toEqual(new Set(["af_heart"]));
  });

  it("keeps separate files per voice and per text", async () => {
    await narrateStoryboard(board(), { synthesizer: fakeSynth(), outDir });
    const other = fakeSynth();
    await narrateStoryboard(board(), { synthesizer: other, outDir, voice: "af_bella" });
    expect(other.calls).toHaveLength(2);
    await narrateStoryboard(board({}, "Different words."), { synthesizer: other, outDir });
    expect(other.calls).toHaveLength(3);
    expect(await readdir(outDir)).toHaveLength(6);
  });

  it("a narration with no terminal mark is one sentence", async () => {
    const synth = fakeSynth();
    const result = await narrateStoryboard(board({}, "just words"), { synthesizer: synth, outDir });
    expect(synth.calls).toHaveLength(1);
    expect(result["a"]!.audioMs).toBe(1000);
  });
});
