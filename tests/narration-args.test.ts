import { describe, expect, it } from "vitest";
import { parseNarrateArgs } from "../src/render/args";
import { validateStoryboard } from "../src/index";

describe("parseNarrateArgs", () => {
  it("takes one storyboard, with optional --voice and --offline", () => {
    expect(parseNarrateArgs(["board.json"])).toEqual({ storyboard: "board.json", offline: false });
    expect(parseNarrateArgs(["board.json", "--voice", "af_bella", "--offline"])).toEqual({
      storyboard: "board.json",
      voice: "af_bella",
      offline: true,
    });
  });

  it("rejects a missing storyboard", () => {
    expect(() => parseNarrateArgs([])).toThrow(/expected one storyboard/);
  });
});

describe("storyboard voice", () => {
  const board = (voice: unknown) => ({
    title: "T",
    aspect: "9:16",
    voice,
    scenes: [{ id: "a", component: "Title", props: {}, durationMs: 1000 }],
  });

  it("accepts a non-empty string and keeps it", () => {
    const result = validateStoryboard(board("af_bella"));
    expect(result.ok && result.storyboard.voice).toBe("af_bella");
  });

  it("rejects an empty or non-string voice", () => {
    for (const voice of ["", "  ", 3]) {
      const result = validateStoryboard(board(voice));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.errors.join()).toMatch(/voice must be a non-empty string/);
    }
  });
});
