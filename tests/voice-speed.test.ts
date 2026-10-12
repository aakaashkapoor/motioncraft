import { describe, expect, it } from "vitest";
import { parseNarrateArgs } from "../src/render/args";
import { validateStoryboard } from "../src/storyboard/validate";

const board = (extra: Record<string, unknown>) =>
  validateStoryboard({ title: "T", aspect: "9:16", scenes: [{ id: "a", component: "Title", props: {}, durationMs: 1000 }], ...extra });

describe("voiceSpeed validation", () => {
  it("accepts 0.8 to 1.4 and keeps the value", () => {
    for (const voiceSpeed of [0.8, 1, 1.3, 1.4]) {
      const result = board({ voiceSpeed });
      expect(result.ok && result.storyboard.voiceSpeed).toBe(voiceSpeed);
    }
    const none = board({});
    expect(none.ok && none.storyboard.voiceSpeed).toBeUndefined();
  });

  it("rejects 0.5, 2 and non-numbers", () => {
    for (const voiceSpeed of [0.5, 2, 0.79, 1.41, "1.2", null, Number.NaN]) {
      const result = board({ voiceSpeed });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.join("\n")).toMatch(/voiceSpeed must be a number from 0\.8 to 1\.4/);
    }
  });
});

describe("narrate --speed", () => {
  it("parses a speed in range and leaves it unset otherwise", () => {
    expect(parseNarrateArgs(["a.json", "--speed", "1.3"]).speed).toBe(1.3);
    expect(parseNarrateArgs(["a.json"]).speed).toBeUndefined();
  });

  it("rejects a speed out of range or not a number", () => {
    for (const bad of ["0.5", "2", "fast", ""]) {
      expect(() => parseNarrateArgs(["a.json", "--speed", bad])).toThrow(/--speed must be a number from 0\.8 to 1\.4/);
    }
  });
});
