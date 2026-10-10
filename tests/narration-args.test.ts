import { describe, expect, it } from "vitest";
import { parseNarrateArgs } from "../src/render/args";
import { VOICE_FILES } from "../src/narration/assets";
import { STOCK_VOICES } from "../src/narration/voices";
import { validateStoryboard } from "../src/index";

describe("parseNarrateArgs", () => {
  it("takes one storyboard, with optional --offline", () => {
    expect(parseNarrateArgs(["board.json"])).toEqual({ storyboard: "board.json", offline: false });
    expect(parseNarrateArgs(["board.json", "--offline"])).toEqual({ storyboard: "board.json", offline: true });
  });

  it("has no --voice flag: the voice comes from the storyboard", () => {
    expect(() => parseNarrateArgs(["board.json", "--voice", "af_bella"])).toThrow();
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

  it("accepts a stock voice and keeps it", () => {
    const result = validateStoryboard(board("af_bella"));
    expect(result.ok && result.storyboard.voice).toBe("af_bella");
  });

  it("accepts every stock voice and rejects any other, listing the stock ones", () => {
    for (const voice of STOCK_VOICES) expect(validateStoryboard(board(voice)).ok).toBe(true);
    const result = validateStoryboard(board("af_nope"));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join()).toMatch(/voice must be one of af_heart, af_bella, am_michael/);
  });

  it("has a pinned voice file for each stock voice", () => {
    expect(Object.keys(VOICE_FILES).sort()).toEqual([...STOCK_VOICES].sort());
  });

  it("rejects an empty or non-string voice", () => {
    for (const voice of ["", "  ", 3]) {
      const result = validateStoryboard(board(voice));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.errors.join()).toMatch(/voice must be a non-empty string/);
    }
  });
});
