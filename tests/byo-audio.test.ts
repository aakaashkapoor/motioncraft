import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkSceneAudio } from "../src/checks/sceneAudio";
import { evenWordTimes } from "../src/kit/captionWords";
import { parseWordTimes, wordMismatch } from "../src/narration/audioWords";
import type { Synthesizer } from "../src/narration/kokoro";
import { loadCachedNarration, narrateStoryboard, narrationDir } from "../src/narration/narrate";
import { loadSceneAudio } from "../src/narration/sceneAudio";
import { encodeWav } from "../src/narration/wav";
import { toneWav } from "./toneWav";
import { readWavInfo } from "../src/narration/wavInfo";
import { narrationDurations, sceneDurations } from "../src/render/durations";
import { resolveTheme } from "../src/render/themes";
import { validateStoryboard, type Storyboard } from "../src/index";

function board(scenes: unknown[], aspect = "9:16"): Storyboard {
  const result = validateStoryboard({ title: "T", aspect, scenes });
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.storyboard;
}

const NARRATION = "Split the bill in seconds.";
const WORDS = [
  { text: "Split", startMs: 100, endMs: 400 },
  { text: "the", startMs: 400, endMs: 500 },
  { text: "bill", startMs: 500, endMs: 800 },
  { text: "in", startMs: 900, endMs: 1000 },
  { text: "seconds.", startMs: 1000, endMs: 1600 },
];

function neverSpeaks(): Synthesizer & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async speak(text) {
      calls.push(text);
      return { samples: new Float32Array(text.length * 2400).fill(0.1), sampleRate: 24_000 };
    },
  };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mc-byo-audio-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("readWavInfo", () => {
  it("reads the length of 16-bit PCM mono, float stereo and any rate", () => {
    expect(readWavInfo(toneWav(1500))).toMatchObject({ format: "pcm", bits: 16, channels: 1, sampleRate: 44_100, audioMs: 1500 });
    expect(readWavInfo(toneWav(800, { rate: 48_000, channels: 2, float: true }))).toMatchObject({ format: "float", bits: 32, channels: 2, audioMs: 800 });
    expect(readWavInfo(encodeWav(new Float32Array(24_000), 24_000)).audioMs).toBe(1000);
    expect(readWavInfo(toneWav(600, { rate: 96_000, bits: 24 }))).toMatchObject({ format: "pcm", bits: 24, audioMs: 600 });
  });

  it("rejects what is not a WAV, and encodings the page cannot decode", () => {
    expect(() => readWavInfo(new TextEncoder().encode("ID3 not a wav at all"))).toThrow(/not a WAV/);
    const bytes = toneWav(100);
    new DataView(bytes.buffer).setUint16(20, 85, true); // MP3 in a WAV
    expect(() => readWavInfo(bytes)).toThrow(/16-bit PCM|float/);
  });
});

describe("parseWordTimes", () => {
  it("takes the TimedWord shape", () => {
    expect(parseWordTimes(WORDS)).toEqual({ ok: true, words: WORDS });
  });

  it("names what is wrong with a bad file", () => {
    expect(parseWordTimes({ words: [] })).toMatchObject({ ok: false });
    const bad = parseWordTimes([{ text: "a", startMs: 0, endMs: 10 }, { text: 3, startMs: 0 }]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/\[1\]/);
    expect(parseWordTimes([{ text: "a", startMs: 50, endMs: 10 }]).ok).toBe(false);
  });
});

describe("wordMismatch", () => {
  it("is undefined when the words match the narration in order, ignoring case and punctuation", () => {
    expect(wordMismatch(NARRATION, WORDS)).toBeUndefined();
    expect(wordMismatch("split, the BILL in seconds", WORDS)).toBeUndefined();
  });

  it("names the first word that differs, or a count that differs", () => {
    expect(wordMismatch("Split the check in seconds.", WORDS)).toMatch(/word 3.*"check".*"bill"/);
    expect(wordMismatch("Split the bill in seconds flat.", WORDS)).toMatch(/6 words.*5/);
  });
});

describe("validateStoryboard: scene audio", () => {
  const scene = (audio: unknown, extra: Record<string, unknown> = {}) =>
    validateStoryboard({ title: "T", aspect: "9:16", scenes: [{ id: "a", component: "TitleCard", props: { title: "x" }, narration: NARRATION, audio, ...extra }] });

  it("accepts a wav file with optional words json", () => {
    const result = scene({ file: "voice/a.WAV", words: "voice/a.json" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.storyboard.scenes[0]!.audio).toEqual({ file: "voice/a.WAV", words: "voice/a.json" });
    expect(scene({ file: "a.wav" }).ok).toBe(true);
  });

  it("rejects other shapes, other formats and absolute paths", () => {
    const errors = (audio: unknown, extra?: Record<string, unknown>) => {
      const result = scene(audio, extra);
      return result.ok ? [] : result.errors;
    };
    expect(errors("a.wav").join()).toMatch(/audio must be an object/);
    expect(errors({ file: "a.mp3" }).join()).toMatch(/audio.file must be a \.wav/);
    expect(errors({ file: "a.wav", words: "a.txt" }).join()).toMatch(/audio.words must be a \.json/);
    expect(errors({ file: "a.wav", volume: 2 }).join()).toMatch(/unknown field "volume"/);
    expect(errors({ file: "/abs/a.wav" }).join()).toMatch(/relative to the storyboard/);
    expect(errors({ file: "C:\\abs\\a.wav" }).join()).toMatch(/relative to the storyboard/);
    expect(errors({ file: "a.wav" }, { narration: undefined, durationMs: 1000 }).join()).toMatch(/narration is required with audio/);
  });
});

describe("loadSceneAudio", () => {
  it("uses the file's length and its word timings", async () => {
    await writeFile(join(dir, "a.wav"), toneWav(1800, { rate: 22_050, channels: 2 }));
    await writeFile(join(dir, "a.json"), JSON.stringify(WORDS));
    const storyboard = board([{ id: "a", component: "TitleCard", props: { title: "x" }, narration: NARRATION, audio: { file: "a.wav", words: "a.json" } }]);
    const loaded = await loadSceneAudio(storyboard.scenes[0]!, dir);
    expect(loaded).toEqual({ sceneId: "a", wavPath: join(dir, "a.wav"), audioMs: 1800, words: WORDS });
  });

  it("without words, times the narration evenly over the audio", async () => {
    await writeFile(join(dir, "a.wav"), toneWav(2000, { float: true }));
    const storyboard = board([{ id: "a", component: "TitleCard", props: { title: "x" }, narration: NARRATION, audio: { file: "a.wav" } }]);
    const loaded = await loadSceneAudio(storyboard.scenes[0]!, dir);
    expect(loaded.audioMs).toBe(2000);
    expect(loaded.words).toEqual(evenWordTimes(NARRATION, 0, 2000));
  });
});

describe("narration with scene audio files", () => {
  const mixed = () =>
    board([
      { id: "voice", component: "TitleCard", props: { title: "Kokoro" }, narration: "Hi there." },
      { id: "file", component: "TitleCard", props: { title: "File" }, narration: NARRATION, audio: { file: "file.wav", words: "file.json" } },
      { id: "even", component: "TitleCard", props: { title: "Even" }, narration: "No word times here.", audio: { file: "even.wav" } },
    ]);

  beforeEach(async () => {
    await writeFile(join(dir, "file.wav"), toneWav(1600));
    await writeFile(join(dir, "file.json"), JSON.stringify(WORDS));
    await writeFile(join(dir, "even.wav"), toneWav(3000, { rate: 48_000, channels: 2, float: true }));
  });

  it("never sends a scene with audio to Kokoro, and sizes scenes from both sources", async () => {
    const synth = neverSpeaks();
    const storyboard = mixed();
    const narration = await narrateStoryboard(storyboard, { synthesizer: synth, outDir: join(dir, ".motioncraft", "narration"), mediaDir: dir });
    expect(synth.calls).toEqual(["Hi there."]);
    expect(narration["file"]).toMatchObject({ wavPath: join(dir, "file.wav"), audioMs: 1600, words: WORDS });
    expect(narration["even"]!.audioMs).toBe(3000);
    expect(narration["voice"]!.audioMs).toBe(900); // fakeSynth: 100 ms per character

    const theme = resolveTheme(storyboard);
    const durations = sceneDurations(storyboard, narration, theme);
    // Each scene is sized from its own source's length: the voice's for "voice", the files' for the others.
    expect(durations).toEqual(narrationDurations(storyboard, { voice: { audioMs: 900 }, file: { audioMs: 1600 }, even: { audioMs: 3000 } }, theme));
    expect(durations["even"]).toBeGreaterThan(theme.motion.leadMs + 3000);
  });

  it("loads scene audio files with the cached narration, never listing them as missing", async () => {
    const cached = await loadCachedNarration(mixed(), { outDir: join(dir, ".motioncraft", "narration"), mediaDir: dir });
    expect(cached.missing).toEqual(["voice"]);
    expect(Object.keys(cached.scenes).sort()).toEqual(["even", "file"]);
    expect(cached.scenes["even"]!.words).toEqual(evenWordTimes("No word times here.", 0, 3000));
  });
});

describe("checkSceneAudio", () => {
  const scene = (audio: unknown, narration = NARRATION) => board([{ id: "a", component: "TitleCard", props: { title: "x" }, narration, audio }]);

  it("errors on a missing file", async () => {
    const issues = await checkSceneAudio(scene({ file: "gone.wav" }), dir);
    expect(issues.filter((i) => i.severity === "error")).toEqual([
      expect.objectContaining({ check: "media", severity: "error", sceneId: "a", message: expect.stringMatching(/gone\.wav.*not found/) }),
    ]);
  });

  it("errors on a file that is not a WAV it can play, and on a missing or bad words file", async () => {
    await writeFile(join(dir, "a.wav"), "not audio");
    await writeFile(join(dir, "b.wav"), toneWav(500));
    await writeFile(join(dir, "bad.json"), JSON.stringify([{ text: "Split" }]));
    expect((await checkSceneAudio(scene({ file: "a.wav" }), dir))[0]).toMatchObject({ severity: "error", message: expect.stringMatching(/not a WAV/) });
    expect((await checkSceneAudio(scene({ file: "b.wav", words: "none.json" }), dir))[0]).toMatchObject({ severity: "error", message: expect.stringMatching(/none\.json.*not found/) });
    expect((await checkSceneAudio(scene({ file: "b.wav", words: "bad.json" }), dir))[0]).toMatchObject({ severity: "error", message: expect.stringMatching(/bad\.json/) });
  });

  it("warns that captions are approximate without words", async () => {
    await writeFile(join(dir, "a.wav"), toneWav(500));
    const issues = await checkSceneAudio(scene({ file: "a.wav" }), dir);
    expect(issues).toEqual([expect.objectContaining({ severity: "warn", message: expect.stringMatching(/approximate/) })]);
  });

  it("warns when the words do not match the narration, and is quiet when they do", async () => {
    await writeFile(join(dir, "a.wav"), toneWav(2000));
    await writeFile(join(dir, "a.json"), JSON.stringify(WORDS));
    expect(await checkSceneAudio(scene({ file: "a.wav", words: "a.json" }), dir)).toEqual([]);
    const issues = await checkSceneAudio(scene({ file: "a.wav", words: "a.json" }, "Split the check in seconds."), dir);
    expect(issues).toEqual([expect.objectContaining({ severity: "warn", message: expect.stringMatching(/"check"/) })]);
  });
});

describe("byo-audio fixtures", () => {
  for (const name of ["byo-audio", "byo-audio-wide"]) {
    it(`${name}.json validates and its audio loads once the WAV is made`, async () => {
      const fixtures = join(__dirname, "fixtures");
      const result = validateStoryboard(JSON.parse(await readFile(join(fixtures, `${name}.json`), "utf8")));
      if (!result.ok) throw new Error(result.errors.join("; "));
      const audioScenes = result.storyboard.scenes.filter((s) => s.audio !== undefined);
      expect(audioScenes.length).toBeGreaterThanOrEqual(2);
      expect(result.storyboard.scenes.some((s) => s.audio === undefined && s.narration !== undefined)).toBe(true);
      for (const s of audioScenes) {
        await writeFile(join(dir, s.audio!.file), toneWav(2500));
        if (s.audio!.words !== undefined) await copyFile(join(fixtures, s.audio!.words), join(dir, s.audio!.words));
      }
      const issues = await checkSceneAudio(result.storyboard, dir);
      expect(issues.filter((i) => i.severity === "error")).toEqual([]);
      expect(issues.filter((i) => i.severity === "warn")).toHaveLength(audioScenes.filter((s) => s.audio!.words === undefined).length);
    });
  }
});

describe("narrateStoryboard without a mediaDir", () => {
  it("finds scene audio beside the storyboard its narrationDir belongs to", async () => {
    await writeFile(join(dir, "a.wav"), toneWav(700));
    const storyboard = board([{ id: "a", component: "TitleCard", props: { title: "x" }, narration: NARRATION, audio: { file: "a.wav" } }]);
    const narration = await narrateStoryboard(storyboard, { synthesizer: neverSpeaks(), outDir: narrationDir(join(dir, "board.json")) });
    expect(narration["a"]).toMatchObject({ wavPath: join(dir, "a.wav"), audioMs: 700 });
  });
});
