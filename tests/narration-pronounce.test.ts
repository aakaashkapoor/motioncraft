import { describe, expect, it } from "vitest";
import { pronunciationsIn, sayAs, spokenPlan } from "../src/narration/pronounce";
import { validateStoryboard } from "../src/index";

const MAP = { JSON: "Jaysawn", nsh: "NSH" };

describe("sayAs", () => {
  it("replaces a mapped word", () => {
    expect(sayAs("a JSON report", MAP)).toBe("a Jaysawn report");
  });

  it("keeps the punctuation around the word", () => {
    expect(sayAs("JSON:", MAP)).toBe("Jaysawn:");
    expect(sayAs("(nsh)", MAP)).toBe("(NSH)");
    expect(sayAs("Run nsh, then read the JSON.", MAP)).toBe("Run NSH, then read the Jaysawn.");
  });

  it("is case-sensitive and matches whole words only", () => {
    expect(sayAs("json and Json", MAP)).toBe("json and Json");
    expect(sayAs("a JSONL file", MAP)).toBe("a JSONL file");
  });

  it("keeps the spacing between words", () => {
    expect(sayAs("  JSON\tnsh  ", MAP)).toBe("  Jaysawn\tNSH  ");
  });

  it("returns the text unchanged for an empty or missing map", () => {
    expect(sayAs("a JSON report", {})).toBe("a JSON report");
    expect(sayAs("a JSON report", undefined)).toBe("a JSON report");
  });

  it("ignores inherited object keys", () => {
    expect(sayAs("toString constructor", MAP)).toBe("toString constructor");
  });
});

describe("spokenPlan", () => {
  it("counts how many spoken words each written word became", () => {
    expect(spokenPlan("Open the nsh JSON file", { nsh: "N S H" })).toEqual({ text: "Open the N S H JSON file", counts: [1, 1, 3, 1, 1] });
    expect(spokenPlan("  a	b  ", { b: "bee bee" })).toEqual({ text: "  a	bee bee  ", counts: [1, 2] });
    expect(spokenPlan("", { b: "bee" })).toEqual({ text: "", counts: [] });
    expect(spokenPlan("a b", undefined)).toEqual({ text: "a b", counts: [1, 1] });
  });
});

describe("pronunciationsIn", () => {
  it("lists the entries a text uses, sorted by key", () => {
    expect(pronunciationsIn("nsh writes JSON. JSON!", MAP)).toEqual([
      ["JSON", "Jaysawn"],
      ["nsh", "NSH"],
    ]);
    expect(pronunciationsIn("nothing here", MAP)).toEqual([]);
    expect(pronunciationsIn("JSON", undefined)).toEqual([]);
  });
});

function validate(pronounce: unknown) {
  return validateStoryboard({
    title: "T",
    aspect: "9:16",
    pronounce,
    scenes: [{ id: "a", component: "Title", props: {}, durationMs: 1000 }],
  });
}

describe("storyboard pronounce", () => {
  it("lands a good map on the parsed storyboard", () => {
    const result = validate(MAP);
    expect(result.ok && result.storyboard.pronounce).toEqual(MAP);
    expect(result.ok && "pronounce" in validateStoryboard({ title: "T", aspect: "9:16", scenes: [] })).toBe(false);
  });

  it("accepts apostrophes in a spoken word", () => {
    expect(validate({ dont: "don't" }).ok).toBe(true);
  });

  it("accepts up to four spoken words", () => {
    expect(validate({ JSON: "Jay sawn" }).ok).toBe(true);
    expect(validate({ npm: "N P M" }).ok).toBe(true);
    expect(validate({ PostgreSQL: "post gress Q L" }).ok).toBe(true);
  });

  it.each([
    ["five words", "a b c d e"],
    ["a double space", "Jay  sawn"],
    ["a leading space", " Jaysawn"],
    ["a trailing space", "Jaysawn "],
    ["a digit", "Jay2"],
    ["an empty string", ""],
    ["a non-string", 3],
  ])("rejects a value with %s, naming the key", (_, value) => {
    const result = validate({ JSON: value });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toMatch(/pronounce\["JSON"\]/);
  });

  it("rejects a key with whitespace or an empty key", () => {
    for (const key of ["two words", " JSON", ""]) {
      const result = validate({ [key]: "Word" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.join("\n")).toContain(`pronounce[${JSON.stringify(key)}]`);
    }
  });

  it("rejects a pronounce that is not an object", () => {
    for (const bad of ["JSON", ["JSON"], null]) {
      const result = validate(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.join("\n")).toMatch(/pronounce must be an object/);
    }
  });
});
