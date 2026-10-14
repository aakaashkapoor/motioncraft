import { describe, expect, it } from "vitest";
import { plausibleLength, soundSpan, stretchWords } from "../src/narration/borrowedWords";

describe("soundSpan", () => {
  it("finds the first and last loud sample", () => {
    expect(soundSpan(Float32Array.of(0, 0.001, 0.5, 0, -0.2, 0.001))).toEqual({ first: 2, last: 4 });
  });
  it("is undefined for silence", () => {
    expect(soundSpan(new Float32Array(10))).toBeUndefined();
  });
});

describe("stretchWords", () => {
  it("maps one recording's sound span onto the other's", () => {
    const words = [
      { startSample: 100, endSample: 600 },
      { startSample: 600, endSample: 1100 },
    ];
    expect(stretchWords(words, { first: 100, last: 1100 }, { first: 0, last: 2000 })).toEqual([
      { startSample: 0, endSample: 1000 },
      { startSample: 1000, endSample: 2000 },
    ]);
  });
  it("keeps words inside the target's sound", () => {
    const [word] = stretchWords([{ startSample: 0, endSample: 1200 }], { first: 100, last: 1100 }, { first: 50, last: 1050 });
    expect(word).toEqual({ startSample: 50, endSample: 1050 });
  });
});

describe("plausibleLength", () => {
  it("accepts a line between 0.6x and 1.6x of the reference length", () => {
    expect(plausibleLength(5, 4.6)).toBe(true);
    expect(plausibleLength(2.8, 4.6)).toBe(true);
    expect(plausibleLength(7.3, 4.6)).toBe(true);
  });
  it("rejects a line that dropped or repeated words", () => {
    expect(plausibleLength(2, 4.6)).toBe(false);
    expect(plausibleLength(9, 4.6)).toBe(false);
  });
});
