import { describe, expect, it } from "vitest";
import { spokenPlan } from "../src/narration/pronounce";
import { BUILTIN_PRONOUNCE } from "../src/narration/terms";

const VALUE = /^[A-Za-z']+( [A-Za-z']+){0,3}$/;

describe("BUILTIN_PRONOUNCE", () => {
  it("has only values the storyboard rule allows", () => {
    for (const [key, value] of Object.entries(BUILTIN_PRONOUNCE)) expect([key, value]).toEqual([key, expect.stringMatching(VALUE)]);
  });

  it("has written words with no whitespace", () => {
    for (const key of Object.keys(BUILTIN_PRONOUNCE)) expect(key).toMatch(/^\S+$/);
  });

  it("spells out npm and counts the spoken words of each written word", () => {
    expect(spokenPlan("Run npm install.", BUILTIN_PRONOUNCE)).toEqual({ text: "Run N P M install.", counts: [1, 3, 1] });
  });

  it("keeps the punctuation around a term", () => {
    expect(spokenPlan("(JSON):", BUILTIN_PRONOUNCE)).toEqual({ text: "(Jaysawn):", counts: [1] });
    expect(spokenPlan("Use Node.js, then nginx.", BUILTIN_PRONOUNCE).text).toBe("Use node jay ess, then engine X.");
  });

  it("lets a storyboard entry override a built-in one", () => {
    expect(spokenPlan("a JSON file", { ...BUILTIN_PRONOUNCE, ...{ JSON: "Jayson" } }).text).toBe("a Jayson file");
  });
});
