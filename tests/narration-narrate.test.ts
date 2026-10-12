import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KOKORO_REVISION, KOKORO_TIMESTAMPED_REVISION, MISAKI_REVISION } from "../src/narration/assets";
import { NARRATION_CACHE_VERSION, loadCachedNarration, missingNarrationNotice, narrateStoryboard } from "../src/narration/narrate";
import type { Synthesizer } from "../src/narration/kokoro";
import { decodeWav } from "../src/narration/wav";
import { validateStoryboard } from "../src/index";
import type { Storyboard } from "../src/index";

const SAMPLE_RATE = 24000;

/** 100 ms of audio per character of text, so durations are easy to predict. */
function fakeSynth(): Synthesizer & { calls: { text: string; voice: string }[]; speeds: (number | undefined)[] } {
  const calls: { text: string; voice: string }[] = [];
  const speeds: (number | undefined)[] = [];
  return {
    calls,
    speeds,
    async speak(text, voice, speed) {
      calls.push({ text, voice });
      speeds.push(speed);
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
      .update([NARRATION_CACHE_VERSION, KOKORO_REVISION, KOKORO_TIMESTAMPED_REVISION, MISAKI_REVISION, "af_heart", "Hi there. Bye now."].join("\0"))
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

  it("speaks at the option speed, else the storyboard voiceSpeed, else 1", async () => {
    const a = fakeSynth();
    await narrateStoryboard(board({ voiceSpeed: 1.2 }), { synthesizer: a, outDir, speed: 0.9 });
    expect(new Set(a.speeds)).toEqual(new Set([0.9]));

    const b = fakeSynth();
    await narrateStoryboard(board({ voiceSpeed: 1.2 }), { synthesizer: b, outDir });
    expect(new Set(b.speeds)).toEqual(new Set([1.2]));

    const c = fakeSynth();
    await narrateStoryboard(board(), { synthesizer: c, outDir });
    expect(new Set(c.speeds)).toEqual(new Set([1]));
  });

  it("re-narrates at a different speed and reuses the cache at the same one", async () => {
    await narrateStoryboard(board({ voiceSpeed: 1.3 }), { synthesizer: fakeSynth(), outDir });
    const same = fakeSynth();
    await narrateStoryboard(board({ voiceSpeed: 1.3 }), { synthesizer: same, outDir });
    expect(same.calls).toEqual([]);

    const other = fakeSynth();
    await narrateStoryboard(board({ voiceSpeed: 1 }), { synthesizer: other, outDir });
    expect(other.calls.length).toBeGreaterThan(0);
    expect((await readdir(outDir)).sort()).toHaveLength(4);
    expect((await loadCachedNarration(board({ voiceSpeed: 1.1 }), { outDir })).missing).toEqual(["a"]);
    expect((await loadCachedNarration(board(), { outDir, speed: 1.3 })).missing).toEqual([]);
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

  it("speaks the pronounce map's spoken form but keeps the written words for captions", async () => {
    const synth = fakeSynth();
    const pronounce = { JSON: "Jaysawn", nsh: "NSH" };
    const result = await narrateStoryboard(board({ pronounce }, "Run (nsh) for a JSON: report."), { synthesizer: synth, outDir });
    expect(synth.calls.map((c) => c.text)).toEqual(["Run (NSH) for a Jaysawn: report."]);
    expect(result["a"]!.words.map((w) => w.text)).toEqual(["Run", "(nsh)", "for", "a", "JSON:", "report."]);
    const sidecar = JSON.parse(await readFile(result["a"]!.wavPath.replace(/\.wav$/, ".json"), "utf8")) as { words: { text: string }[] };
    expect(sidecar.words.map((w) => w.text)).toEqual(["Run", "(nsh)", "for", "a", "JSON:", "report."]);
  });

  it("re-speaks when a pronunciation the scene uses changes, and only then", async () => {
    const narration = "A nsh report.";
    const plain = await narrateStoryboard(board({}, narration), { synthesizer: fakeSynth(), outDir });
    const unused = await narrateStoryboard(board({ pronounce: { qux: "Kwux" } }, narration), { synthesizer: fakeSynth(), outDir });
    expect(unused["a"]!.wavPath).toBe(plain["a"]!.wavPath);

    const first = await narrateStoryboard(board({ pronounce: { nsh: "NSH" } }, narration), { synthesizer: fakeSynth(), outDir });
    const changed = fakeSynth();
    const second = await narrateStoryboard(board({ pronounce: { nsh: "N S H" } }, narration), { synthesizer: changed, outDir });
    expect(first["a"]!.wavPath).not.toBe(plain["a"]!.wavPath);
    expect(second["a"]!.wavPath).not.toBe(first["a"]!.wavPath);
    expect(changed.calls.map((c) => c.text)).toEqual(["A N S H report."]);
    expect(await readdir(outDir)).toHaveLength(6);
  });

  it("says developer terms from the built-in table, and a storyboard entry overrides it", async () => {
    const synth = fakeSynth();
    const builtin = await narrateStoryboard(board({}, "Run npm on the JSON file."), { synthesizer: synth, outDir });
    expect(synth.calls.map((c) => c.text)).toEqual(["Run N P M on the Jaysawn file."]);
    expect(builtin["a"]!.words.map((w) => w.text)).toEqual(["Run", "npm", "on", "the", "JSON", "file."]);

    const override = fakeSynth();
    const mine = await narrateStoryboard(board({ pronounce: { JSON: "Jayson" } }, "Run npm on the JSON file."), { synthesizer: override, outDir });
    expect(override.calls.map((c) => c.text)).toEqual(["Run N P M on the Jayson file."]);
    expect(mine["a"]!.wavPath).not.toBe(builtin["a"]!.wavPath);
  });

  it("keys a scene that uses a built-in term by it, and one that uses none as before", async () => {
    const keyOf = (text: string, extra: string[] = []) =>
      createHash("sha1")
        .update([NARRATION_CACHE_VERSION, KOKORO_REVISION, KOKORO_TIMESTAMPED_REVISION, MISAKI_REVISION, "af_heart", text, ...extra].join("\0"))
        .digest("hex");
    const plain = await narrateStoryboard(board({}, "Hi there."), { synthesizer: fakeSynth(), outDir });
    expect(plain["a"]!.wavPath).toBe(join(outDir, `${keyOf("Hi there.")}.wav`));
    const term = await narrateStoryboard(board({}, "Use npm."), { synthesizer: fakeSynth(), outDir });
    expect(term["a"]!.wavPath).toBe(join(outDir, `${keyOf("Use npm.", [JSON.stringify([["npm", "N P M"]])])}.wav`));
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

  it("trims the silence around each piece so words and gaps line up with the sound", async () => {
    // 300 ms silence + 1 s tone + 200 ms silence per piece, as Kokoro returns it.
    const padded: Synthesizer = {
      async speak() {
        const samples = new Float32Array(1500 * 24);
        samples.fill(0.5, 300 * 24, 1300 * 24);
        return { samples, sampleRate: SAMPLE_RATE };
      },
    };
    const scene = (await narrateStoryboard(board(), { synthesizer: padded, outDir }))["a"]!;
    const wav = decodeWav(new Uint8Array(await readFile(scene.wavPath)));

    // 30 ms lead + 1000 tone + 60 tail = 1090; 250 gap; again 1090.
    expect(wav.samples).toHaveLength((1090 + 250 + 1090) * 24);
    expect(scene.audioMs).toBe(2430);
    const firstTone = wav.samples.findIndex((x) => Math.abs(x) >= 0.01);
    expect(firstTone / 24).toBeCloseTo(30, 0);
    const secondTone = wav.samples.findIndex((x, i) => i > 1090 * 24 && Math.abs(x) >= 0.01);
    expect(secondTone / 24 - (30 + 1000)).toBeCloseTo(60 + 250 + 30, 0);

    const words = scene.words;
    expect(words[0]!.startMs).toBeCloseTo(30, 0);
    expect(words[1]!.endMs).toBeCloseTo(1030, 0);
    expect(words[2]!.startMs).toBeCloseTo(firstTone / 24 + 1000 + 340, 0);
    expect(words[3]!.endMs).toBeCloseTo(2370, 0);
  });

  it("keeps the words of an all-silent piece at a point instead of losing them", async () => {
    const mute: Synthesizer = { async speak() { return { samples: new Float32Array(2400), sampleRate: SAMPLE_RATE }; } };
    const scene = (await narrateStoryboard(board({}, "Hello there."), { synthesizer: mute, outDir }))["a"]!;
    expect(scene.audioMs).toBe(0);
    expect(scene.words.map((w) => w.text)).toEqual(["Hello", "there."]);
    expect(scene.words.every((w) => w.startMs === 0 && w.endMs === 0)).toBe(true);
  });
});

describe("word times from the synthesizer", () => {
  const ms = (t: number) => Math.round(t * 24); // samples at 24 kHz

  /** 300 ms silence, 1 s tone, 200 ms silence per piece; words as the voice reports them, in ms of the raw buffer. */
  function timed(words: Record<string, [number, number][]>): Synthesizer {
    return {
      async speak(text) {
        const samples = new Float32Array(ms(1500));
        samples.fill(0.5, ms(300), ms(1300));
        return {
          samples,
          sampleRate: SAMPLE_RATE,
          words: words[text]!.map(([a, b]) => ({ startSample: ms(a), endSample: ms(b) })),
        };
      },
    };
  }

  it("offsets each word by the trim, earlier pieces and the 250 ms gap between sentences", async () => {
    const synth = timed({ "Hi there.": [[300, 700], [700, 1300]], "Bye now.": [[350, 800], [800, 1250]] });
    const scene = (await narrateStoryboard(board(), { synthesizer: synth, outDir }))["a"]!;

    expect(scene.words.map((w) => w.text)).toEqual(["Hi", "there.", "Bye", "now."]);
    // The first piece keeps from 270 ms of the buffer.
    expect(scene.words[0]!.startMs).toBeCloseTo(30, 3);
    expect(scene.words[0]!.endMs).toBeCloseTo(430, 3);
    expect(scene.words[1]!.startMs).toBeCloseTo(430, 3);
    expect(scene.words[1]!.endMs).toBeCloseTo(1030, 3);
    // The second starts at 1090 + 250 = 1340 ms.
    expect(scene.words[2]!.startMs).toBeCloseTo(1340 + 80, 3);
    expect(scene.words[2]!.endMs).toBeCloseTo(1340 + 530, 3);
    expect(scene.words[3]!.startMs).toBeCloseTo(1340 + 530, 3);
    expect(scene.words[3]!.endMs).toBeCloseTo(1340 + 980, 3);
  });

  it("keeps gaps between words and clamps times to the piece's sound", async () => {
    const synth = timed({ "Hi there.": [[100, 500], [900, 1700]], "Bye now.": [[300, 500], [500, 600]] });
    const words = (await narrateStoryboard(board(), { synthesizer: synth, outDir }))["a"]!.words;
    expect(words[0]!.startMs).toBeCloseTo(0, 3); // before the sound: clamped to its start
    expect(words[0]!.endMs).toBeCloseTo(230, 3);
    expect(words[1]!.startMs).toBeCloseTo(630, 3); // a gap after "Hi"
    expect(words[1]!.endMs).toBeCloseTo(1090, 3); // past the sound: clamped to its end
    expect(words[2]!.startMs).toBeCloseTo(1340 + 30, 3);
  });

  it("falls back to the letter-count estimate for a piece whose word count does not match", async () => {
    const synth = timed({ "Hi there.": [[300, 1300]], "Bye now.": [[300, 800], [800, 1300]] });
    const words = (await narrateStoryboard(board(), { synthesizer: synth, outDir }))["a"]!.words;
    expect(words.map((w) => w.text)).toEqual(["Hi", "there.", "Bye", "now."]);
    expect(words[0]!.startMs).toBeCloseTo(30, 3);
    expect(words[1]!.endMs).toBeCloseTo(1030, 3);
    expect(words[0]!.endMs).toBeCloseTo(words[1]!.startMs, 6); // an even estimate has no gaps
  });

  it("merges the times of a term said as several words back onto the written word", async () => {
    // One timed word per spoken word: "Run N P M install" in 100 ms steps from 300 ms.
    const synth = timed({ "Run N P M install": [[300, 400], [400, 500], [500, 600], [600, 700], [700, 1300]] });
    const scene = (await narrateStoryboard(board({}, "Run npm install"), { synthesizer: synth, outDir }))["a"]!;
    expect(scene.words.map((w) => w.text)).toEqual(["Run", "npm", "install"]);
    const npm = scene.words[1]!;
    expect(npm.startMs).toBeCloseTo(130, 3); // start of "N"
    expect(npm.endMs).toBeCloseTo(430, 3); // end of "M"
    expect(scene.words[2]!.startMs).toBeCloseTo(430, 3);
    const sidecar = JSON.parse(await readFile(scene.wavPath.replace(/\.wav$/, ".json"), "utf8")) as { words: unknown[] };
    expect(sidecar.words).toEqual(scene.words);
  });

  it("falls back to the estimate when the voice's words do not match the spoken words", async () => {
    const synth = timed({ "Run N P M install": [[300, 600], [600, 900], [900, 1300]] });
    const words = (await narrateStoryboard(board({}, "Run npm install"), { synthesizer: synth, outDir }))["a"]!.words;
    expect(words.map((w) => w.text)).toEqual(["Run", "npm", "install"]);
    expect(words[0]!.startMs).toBeCloseTo(30, 3);
    expect(words[2]!.endMs).toBeCloseTo(1030, 3);
    expect(words[0]!.endMs).toBeCloseTo(words[1]!.startMs, 6);
  });

  it("is a new cache version, so estimated times are never reused", () => {
    expect(NARRATION_CACHE_VERSION).toBe(6);
  });
});

describe("the real voice", () => {
  // Downloads ~100 MB once into ~/.cache/motioncraft.
  it.skipIf(process.env["MOTIONCRAFT_TTS_TEST"] !== "1")(
    "times a sentence's words inside its sound, in order",
    async () => {
      const { kokoroSynthesizer } = await import("../src/narration/kokoro");
      const text = "Type one prompt, and get a finished video.";
      const scene = (await narrateStoryboard(board({}, text), { synthesizer: kokoroSynthesizer(), outDir }))["a"]!;
      const wav = decodeWav(new Uint8Array(await readFile(scene.wavPath)));
      const loud = (x: number) => Math.abs(x) >= 0.01;
      const soundStart = (wav.samples.findIndex(loud) / wav.sampleRate) * 1000;
      const soundEnd = ((wav.samples.length - 1 - [...wav.samples].reverse().findIndex(loud)) / wav.sampleRate) * 1000;
      const words = scene.words;
      expect(words).toHaveLength(8);
      for (const [i, word] of words.entries()) {
        expect(word.endMs).toBeGreaterThanOrEqual(word.startMs);
        if (i > 0) expect(word.startMs).toBeGreaterThanOrEqual(words[i - 1]!.startMs);
      }
      expect(Math.abs(words[0]!.startMs - soundStart)).toBeLessThanOrEqual(100);
      expect(Math.abs(words[7]!.endMs - soundEnd)).toBeLessThanOrEqual(150);
    },
    600_000,
  );
});
