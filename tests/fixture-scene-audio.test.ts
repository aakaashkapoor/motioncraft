// Every committed fixture can be checked and rendered on its own: the WAVs its
// scenes bring (`audio.file`) are committed beside it, usable, and as long as
// their words file. byo-audio.json and byo-audio-wide.json once referenced
// WAVs only tests/byo-audio.test.ts made, in a temporary folder.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSceneAudio } from "../src/checks/sceneAudio";
import { loadAudioNarration } from "../src/narration/sceneAudio";
import { validateStoryboard } from "../src/index";

const FIXTURES = join(__dirname, "fixtures");
const withAudio = readdirSync(FIXTURES)
  .filter((name) => name.endsWith(".json"))
  .flatMap((name) => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as { scenes?: { audio?: unknown }[] };
    return Array.isArray(raw.scenes) && raw.scenes.some((scene) => scene.audio !== undefined) ? [name] : [];
  });

describe("fixtures that bring their own audio", () => {
  it("include the byo-audio pair", () => {
    expect(withAudio).toEqual(expect.arrayContaining(["byo-audio.json", "byo-audio-wide.json"]));
  });

  it.each(withAudio)("%s: its audio files are committed and load, each as long as its words", async (name) => {
    const result = validateStoryboard(JSON.parse(readFileSync(join(FIXTURES, name), "utf8")));
    if (!result.ok) throw new Error(result.errors.join("; "));
    const issues = await checkSceneAudio(result.storyboard, FIXTURES);
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const narration = await loadAudioNarration(result.storyboard, FIXTURES);
    for (const scene of result.storyboard.scenes.filter((s) => s.audio !== undefined)) {
      const loaded = narration[scene.id]!;
      expect(loaded.audioMs, scene.id).toBeGreaterThan(0);
      const lastWord = loaded.words.at(-1);
      if (lastWord !== undefined) expect(loaded.audioMs, scene.id).toBeGreaterThanOrEqual(lastWord.endMs);
    }
  });
});
