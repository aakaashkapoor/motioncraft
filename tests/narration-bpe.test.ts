import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHATTERBOX_FILES, defaultCacheDir } from "../src/narration/assets";
import { bytesToUnicode, createBpeTokenizer, type TokenizerJson } from "../src/narration/bpe";

const tiny: TokenizerJson = {
  added_tokens: [
    { id: 9, content: "[laugh]" },
    { id: 10, content: "<|end|>" },
  ],
  model: {
    vocab: { h: 0, i: 1, "Ġ": 2, hi: 3, "Ġhi": 4, "!": 5, "Ġt": 6, t: 7 },
    merges: [
      ["h", "i"],
      ["Ġ", "hi"],
      ["Ġ", "t"],
    ],
  },
  post_processor: {
    single: [{ Sequence: { id: "A" } }, { SpecialToken: { id: "<|end|>" } }],
    special_tokens: { "<|end|>": { ids: [10] } },
  },
};

describe("bytesToUnicode", () => {
  it("maps a space to Ġ, printable ASCII to itself, and every byte to its own character", () => {
    const table = bytesToUnicode();
    expect(table[32]).toBe("Ġ");
    expect(table[65]).toBe("A");
    expect(new Set(table).size).toBe(256);
  });
});

describe("createBpeTokenizer", () => {
  const encode = createBpeTokenizer(tiny);

  it("merges by rank and appends the template's special tokens", () => {
    expect(encode("hi hi!")).toEqual([3, 4, 5, 10]);
  });

  it("splits out added tokens; a space before one is a word of its own", () => {
    expect(encode("hi [laugh] hi")).toEqual([3, 2, 9, 4, 10]);
  });

  it("reads merges written as 'a b' strings too", () => {
    const fromStrings = createBpeTokenizer({ ...tiny, model: { ...tiny.model, merges: ["h i", "Ġ hi", "Ġ t"] } });
    expect(fromStrings("hi hi!")).toEqual([3, 4, 5, 10]);
  });

  it("names a piece with no token", () => {
    expect(() => encode("zz")).toThrow(/no token for "z"/);
  });
});

// The real tokenizer, cached by the Chatterbox model tests; ids from Python `tokenizers` 0.22.
describe.skipIf(process.env["MOTIONCRAFT_TTS_TEST"] !== "1")("the Chatterbox-Turbo tokenizer", () => {
  it("gives the reference ids", async () => {
    const json = JSON.parse(await readFile(join(defaultCacheDir(), CHATTERBOX_FILES.tokenizer.path), "utf8")) as TokenizerJson;
    const encode = createBpeTokenizer(json);
    expect(encode("Welcome to motion craft.")).toEqual([14618, 284, 6268, 5977, 13, 50256, 50256]);
    expect(encode("It's 4.8x faster, isn't it? $12.50!")).toEqual([
      1026, 338, 604, 13, 23, 87, 5443, 11, 2125, 470, 340, 30, 720, 1065, 13, 1120, 0, 50256, 50256,
    ]);
    expect(encode("Oh, that is hilarious! [chuckle] Um anyway.")).toEqual([5812, 11, 326, 318, 20105, 0, 220, 50274, 21039, 6949, 13, 50256, 50256]);
    expect(encode("  Two  spaces—and café.")).toEqual([220, 4930, 220, 9029, 960, 392, 40304, 13, 50256, 50256]);
  });
});
