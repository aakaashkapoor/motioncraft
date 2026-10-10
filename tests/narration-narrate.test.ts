import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KOKORO_REVISION, MISAKI_REVISION } from "../src/narration/assets";
import { NARRATION_CACHE_VERSION, loadCachedNarration, missingNarrationNotice, narrateStoryboard } from "../src/narration/narrate";
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
    const key = createHash("sha1")
      .update([NARRATION_CACHE_VERSION, KOKORO_REVISION, MISAKI_REVISION, "af_heart", "Hi there. Bye now."].join("\0"))
      .digest("hex");
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

  it("treats a malformed sidecar as a cache miss", async () => {
    const first = await narrateStoryboard(board(), { synthesizer: fakeSynth(), outDir });
    await writeFile(first["a"]!.wavPath.replace(/\.wav$/, ".json"), JSON.stringify({ audioMs: "soon" }));
    const again = fakeSynth();
    await narrateStoryboard(board(), { synthesizer: again, outDir });
    expect(again.calls).toHaveLength(2);
  });

  it("splits a long sentence into pieces with no gap, and times words over each piece", async () => {
    const text = Array.from({ length: 40 }, (_, i) => `clause number ${i} here`).join(", ") + ".";
    const synth = fakeSynth();
    const result = await narrateStoryboard(board({}, text), { synthesizer: synth, outDir });
    expect(synth.calls.length).toBeGreaterThan(1);
    const total = synth.calls.reduce((sum, c) => sum + c.text.length * 100, 0);
    expect(result["a"]!.audioMs).toBe(total); // no 250 ms gaps between pieces
    const words = result["a"]!.words;
    expect(words.map((w) => w.text).join(" ")).toBe(text);
    expect(words.at(-1)!.endMs).toBeCloseTo(total);
    for (let i = 1; i < words.length; i++) expect(words[i]!.startMs).toBeCloseTo(words[i - 1]!.endMs);
  });

  it("refuses a sentence that cannot fit the model", async () => {
    await expect(narrateStoryboard(board({}, "x".repeat(700)), { synthesizer: fakeSynth(), outDir })).rejects.toThrow(
      /sentence too long to speak/,
    );
  });

  it("a narration with no terminal mark is one sentence", async () => {
    const synth = fakeSynth();
    const result = await narrateStoryboard(board({}, "just words"), { synthesizer: synth, outDir });
    expect(synth.calls).toHaveLength(1);
    expect(result["a"]!.audioMs).toBe(1000);
  });
});

describe("loadCachedNarration", () => {
  it("returns narrated scenes already on disk without speaking", async () => {
    const spoken = await narrateStoryboard(board(), { synthesizer: fakeSynth(), outDir });
    const cached = await loadCachedNarration(board(), { outDir });
    expect(cached).toEqual({ scenes: spoken, missing: [] });
  });

  it("omits scenes that were never narrated, and an empty folder is empty", async () => {
    expect(await loadCachedNarration(board(), { outDir })).toEqual({ scenes: {}, missing: ["a"] });
    expect((await loadCachedNarration(board(), { outDir: join(outDir, "missing") })).missing).toEqual(["a"]);
  });

  it("misses when the text or voice changed", async () => {
    await narrateStoryboard(board(), { synthesizer: fakeSynth(), outDir });
    expect((await loadCachedNarration(board({}, "Different words."), { outDir })).scenes).toEqual({});
    expect((await loadCachedNarration(board(), { outDir, voice: "am_adam" })).scenes).toEqual({});
  });

  it("treats an invalid sidecar or a missing wav as a miss", async () => {
    const spoken = await narrateStoryboard(board(), { synthesizer: fakeSynth(), outDir });
    const wav = spoken["a"]!.wavPath;
    const json = wav.replace(/\.wav$/, ".json");
    const misses = async () => (await loadCachedNarration(board(), { outDir })).missing;
    await writeFile(json, "{ not json");
    expect(await misses()).toEqual(["a"]);
    await writeFile(json, JSON.stringify({ audioMs: "long", words: [] }));
    expect(await misses()).toEqual(["a"]);
    await writeFile(json, JSON.stringify({ audioMs: 5, words: [{ text: "hi", startMs: 0 }] }));
    expect(await misses()).toEqual(["a"]);
    await writeFile(json, JSON.stringify({ audioMs: 5, words: [{ text: 3, startMs: 0, endMs: 1 }] }));
    expect(await misses()).toEqual(["a"]);
    await writeFile(json, JSON.stringify({ audioMs: 5, words: [{ text: "hi", startMs: 0, endMs: 5 }] }));
    expect(await misses()).toEqual([]);
    await rm(wav);
    expect(await misses()).toEqual(["a"]);
  });
});

describe("missingNarrationNotice", () => {
  const scene = { sceneId: "x", wavPath: "x.wav", audioMs: 1, words: [] };
  it("says how many scenes are cached, and nothing when all or none are needed", () => {
    expect(missingNarrationNotice({ scenes: { a: scene, b: scene, c: scene }, missing: ["d", "e"] })).toBe(
      "narration: 3 of 5 scenes cached; run scripts/narrate.ts for timing from audio",
    );
    expect(missingNarrationNotice({ scenes: { a: scene }, missing: [] })).toBeUndefined();
    expect(missingNarrationNotice({ scenes: {}, missing: [] })).toBeUndefined();
  });
});
