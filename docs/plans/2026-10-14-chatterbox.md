# Chatterbox voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Chatterbox-Turbo the default narration voice: more natural and more expressive than Kokoro, still fully local, with captions still in sync.

**Architecture:** A new `Synthesizer` (`chatterboxSynthesizer`) runs Resemble AI's official Chatterbox-Turbo ONNX export on `onnxruntime-node`: GPT-2 BPE tokens → token-by-token speech generation with a KV cache and seeded sampling → audio decoder. The voice is a precomputed conditioning file (`assets/voices/chatterbox.json`) made once from a pinned reference recording. Chatterbox gives no word timings, so each line is also spoken by Kokoro (timestamped) and Kokoro's word times are stretched onto Chatterbox's sound; Kokoro's length also catches a mis-spoken line, which is regenerated with the next seed. A router picks the engine from the voice name, so Kokoro voices keep working.

**Tech Stack:** TypeScript (strict), `onnxruntime-node` 1.21.0 (already a dependency), vitest.

**Decided in the listening test (2026-10-13/14, "clip 3"):** Turbo from `ResembleAI/chatterbox-turbo-ONNX`; `language_model_q4` (8-bit is pathologically slow on CPU: 640 ms/step against 29 ms for 4-bit), `embed_tokens_quantized`, `conditional_decoder_quantized`; sampling at temperature 0.8, top-k 1000, top-p 0.95, repetition penalty 1.2; reference voice `default_voice.wav` from `onnx-community/chatterbox-ONNX`. Not production: Chatterbox simply becomes the default.

Rules (`AGENTS.md`): test first; `npm run check` passes before every commit; `node:path` only; pin and hash every download; record licenses; keep files small, one responsibility each.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/narration/assets.ts` (modify) | Pins for the Chatterbox files (model graphs and weights, tokenizer, reference voice, speech encoder). |
| `src/narration/bpe.ts` (new) | GPT-2 byte-level BPE tokenizer read from a `tokenizer.json`. Pure. |
| `src/narration/sampling.ts` (new) | Picks the next speech token from logits: repetition penalty, temperature, top-k, top-p. Pure. |
| `src/narration/chatterboxVoice.ts` (new) | The voice conditioning file: encode and decode (base64 little-endian tensors). Pure. |
| `src/narration/chatterboxModel.ts` (new) | The generation loop over four ONNX sessions, behind a small `Run` interface so tests can fake it. |
| `src/narration/borrowedWords.ts` (new) | Stretches one recording's word times onto another recording of the same line; length plausibility. Pure. |
| `src/narration/chatterbox.ts` (new) | The `Synthesizer`: loads files, tokenizes, generates, retries a mis-spoken line, borrows Kokoro's word times. |
| `src/narration/synthesizer.ts` (new) | `voiceSynthesizer()`: routes a voice name to Chatterbox or Kokoro. |
| `src/narration/voices.ts` (modify) | `KOKORO_VOICES`, `CHATTERBOX_VOICES`, `STOCK_VOICES` = both. |
| `src/narration/narrate.ts` (modify) | Default voice `chatterbox`; cache key covers the Chatterbox revision; cache version 7. |
| `src/narration/wav.ts` (modify) | `decodeWav` also reads 32-bit float WAV (the reference voice is one). |
| `scripts/chatterbox-voice.ts` (new) | One-off: runs the pinned speech encoder on the pinned reference and writes `assets/voices/chatterbox.json`. |
| `scripts/narrate.ts`, `scripts/render.ts` (modify) | Use `voiceSynthesizer`. |
| `assets/voices/chatterbox.json` (new, generated) | The default voice's conditioning (~1 MB). |
| docs, `licenses/README.md` | Chatterbox, the reference voice, the voice list. |

---

### Task 1: Pin the Chatterbox files

**Files:** Modify `src/narration/assets.ts`; Test `tests/narration-assets.test.ts`

- [ ] **Step 1: Failing test** (append to `tests/narration-assets.test.ts`):

```ts
import { CHATTERBOX_FILES, CHATTERBOX_REVISION, REFERENCE_VOICE_FILE, SPEECH_ENCODER_FILES } from "../src/narration/assets";

describe("Chatterbox pins", () => {
  it("keeps each graph next to its weights, under the pinned revision", () => {
    for (const file of [...Object.values(CHATTERBOX_FILES), ...SPEECH_ENCODER_FILES]) {
      expect(file.url).toContain(CHATTERBOX_REVISION);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(file.bytes).toBeGreaterThan(0);
    }
    const dir = (path: string) => path.slice(0, path.lastIndexOf(path.includes("\\") ? "\\" : "/"));
    expect(dir(CHATTERBOX_FILES.languageModel.path)).toBe(dir(CHATTERBOX_FILES.languageModelData.path));
    expect(CHATTERBOX_FILES.languageModelData.path.endsWith("language_model_q4.onnx_data")).toBe(true);
    expect(REFERENCE_VOICE_FILE.sha256).toBe("3ebc531cdaba358a327099c1c4f0448026719957bcf4d8e9868767f227e02f4e");
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/narration-assets.test.ts` → FAIL (exports missing).
- [ ] **Step 3: Implement** (append to `assets.ts`, after `SILVER_FILE`):

```ts
/** ResembleAI/chatterbox-turbo-ONNX (MIT, Resemble AI). */
export const CHATTERBOX_REVISION = "d21799bd0354adb85e348b8a0442a8405110a2cf";
/** onnx-community/chatterbox-ONNX (MIT): only its reference recording, `default_voice.wav`. */
export const CHATTERBOX_VOICE_REVISION = "3cab09af388d3f02bba43443fce88c1f4525ac43";

function chatterboxFile(name: string, bytes: number, sha256: string): PinnedFile {
  return {
    url: `https://huggingface.co/ResembleAI/chatterbox-turbo-ONNX/resolve/${CHATTERBOX_REVISION}/${name}`,
    sha256,
    bytes,
    path: join("chatterbox-turbo", CHATTERBOX_REVISION, ...name.split("/")),
  };
}

/** What speaking needs. Each `.onnx` graph loads its `.onnx_data` weights from the same folder by name. */
export const CHATTERBOX_FILES = {
  tokenizer: chatterboxFile("tokenizer.json", 3562272, "3f04e34bea22f9144d1a19151154095bc9ce0430bf421304f5797e716288a906"),
  languageModel: chatterboxFile("onnx/language_model_q4.onnx", 274572, "b39d03d3f8b943b9e60c6fce3fb41191dbc1df4589f913291db1e214eef669b1"),
  languageModelData: chatterboxFile("onnx/language_model_q4.onnx_data", 204456572, "2c029dc0acf48752473d8c74c72b5ceaaad76b9886fe106eaf2022142d5b5d5e"),
  embedTokens: chatterboxFile("onnx/embed_tokens_quantized.onnx", 2887, "0efe1bc01c2c48a98425a74444fd9887924d887f922c2722a6ec961ebb9e1db6"),
  embedTokensData: chatterboxFile("onnx/embed_tokens_quantized.onnx_data", 67297376, "9025d04c124899823124b1d7bb7069b1f535fb8a6c2d88f97520eb6fecced986"),
  decoder: chatterboxFile("onnx/conditional_decoder_quantized.onnx", 2202035, "2af3b150196d9d559cd3c91e03da80eb27a466032369dc2b57ea729cddad3ebb"),
  decoderData: chatterboxFile("onnx/conditional_decoder_quantized.onnx_data", 326548688, "4918ca09e05e41d2b4aa1ace6201d1cd911ffc58a42801002bab177d495cfe0a"),
} as const;

/** Only `scripts/chatterbox-voice.ts` needs these: they turn a recording into a voice file. */
export const SPEECH_ENCODER_FILES: readonly PinnedFile[] = [
  chatterboxFile("onnx/speech_encoder_quantized.onnx", 1205728, "5b6f15870a43cf97892df86fc550a0ef4763522d527cde72b2a4316f80a34de4"),
  chatterboxFile("onnx/speech_encoder_quantized.onnx_data", 354676576, "d59861fb55e806fbeee731da9d4f8ff819fb5735de5d15e262d902594ee4dbb6"),
];

/** The recording the default Chatterbox voice is made from (24 kHz mono, 32-bit float, 7.44 s). */
export const REFERENCE_VOICE_FILE: PinnedFile = {
  url: `https://huggingface.co/onnx-community/chatterbox-ONNX/resolve/${CHATTERBOX_VOICE_REVISION}/default_voice.wav`,
  sha256: "3ebc531cdaba358a327099c1c4f0448026719957bcf4d8e9868767f227e02f4e",
  bytes: 714320,
  path: join("chatterbox-voice", CHATTERBOX_VOICE_REVISION, "default_voice.wav"),
};
```

- [ ] **Step 4:** test passes. **Step 5:** `npm run check`, commit `Pin the Chatterbox-Turbo ONNX files`.

### Task 2: GPT-2 byte-level BPE tokenizer

**Files:** Create `src/narration/bpe.ts`; Test `tests/narration-bpe.test.ts`

- [ ] **Step 1: Failing tests**:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { bytesToUnicode, createBpeTokenizer, type TokenizerJson } from "../src/narration/bpe";
import { CHATTERBOX_FILES } from "../src/narration/assets";

const tiny: TokenizerJson = {
  added_tokens: [{ id: 9, content: "[laugh]" }, { id: 10, content: "<|end|>" }],
  model: {
    vocab: { "h": 0, "i": 1, "Ġ": 2, "hi": 3, "Ġhi": 4, "!": 5, "Ġt": 6, "t": 7 },
    merges: [["h", "i"], ["Ġ", "hi"], ["Ġ", "t"]],
  },
  post_processor: {
    single: [{ Sequence: { id: "A" } }, { SpecialToken: { id: "<|end|>" } }],
    special_tokens: { "<|end|>": { ids: [10] } },
  },
};

describe("bytesToUnicode", () => {
  it("maps a space to Ġ and printable ASCII to itself", () => {
    const map = bytesToUnicode();
    expect(map[32]).toBe("Ġ");
    expect(map[65]).toBe("A");
    expect(new Set(map).size).toBe(256);
  });
});

describe("createBpeTokenizer", () => {
  const encode = createBpeTokenizer(tiny);
  it("merges by rank and appends the template's special tokens", () => {
    expect(encode("hi hi!")).toEqual([3, 4, 5, 10]);
  });
  it("splits out added tokens, keeping the space before one as its own word", () => {
    expect(encode("hi [laugh] hi")).toEqual([3, 2, 9, 4, 10]);
  });
  it("accepts merges written as 'a b' strings", () => {
    const strings = createBpeTokenizer({ ...tiny, model: { ...tiny.model, merges: ["h i", "Ġ hi", "Ġ t"] } });
    expect(strings("hi hi!")).toEqual([3, 4, 5, 10]);
  });
  it("throws on a piece with no token", () => {
    expect(() => encode("zz")).toThrow(/no token/);
  });
});

// The real tokenizer (downloaded by the Chatterbox tests); ids from Python `tokenizers`.
const real = join(homedir(), ".cache", "motioncraft", CHATTERBOX_FILES.tokenizer.path);
describe.skipIf(process.env["MOTIONCRAFT_TTS_TEST"] !== "1")("the Chatterbox tokenizer", () => {
  it("matches the reference ids", async () => {
    const encode = createBpeTokenizer(JSON.parse(await readFile(real, "utf8")) as TokenizerJson);
    expect(encode("Welcome to motion craft.")).toEqual([14618, 284, 6268, 5977, 13, 50256, 50256]);
    expect(encode("It's 4.8x faster, isn't it? $12.50!")).toEqual([1026, 338, 604, 13, 23, 87, 5443, 11, 2125, 470, 340, 30, 720, 1065, 13, 1120, 0, 50256, 50256]);
    expect(encode("Oh, that is hilarious! [chuckle] Um anyway.")).toEqual([5812, 11, 326, 318, 20105, 0, 220, 50274, 21039, 6949, 13, 50256, 50256]);
    expect(encode("  Two  spaces—and café.")).toEqual([220, 4930, 220, 9029, 960, 392, 40304, 13, 50256, 50256]);
  });
});
```

Note the tiny case `"hi [laugh] hi"`: the text between added tokens is `"hi "` and `" hi"`; `"hi "` pre-tokenizes to `"hi"`, `" "` (GPT-2's `\s+(?!\S)` rule at the end of a chunk), which is ids 3, 2.

- [ ] **Step 2:** FAIL. **Step 3: Implement** `src/narration/bpe.ts`:

```ts
// GPT-2 byte-level BPE, as Hugging Face `tokenizers` runs it for Chatterbox-Turbo's
// `tokenizer.json`: added tokens are split out first, the rest is cut by GPT-2's
// pattern, each piece's UTF-8 bytes are mapped to printable characters and merged
// by rank, and the template's special tokens are appended. Pure.

export interface TokenizerJson {
  added_tokens: { id: number; content: string }[];
  model: { vocab: Record<string, number>; merges: (string | [string, string])[] };
  post_processor?: {
    single?: ({ Sequence: { id: string } } | { SpecialToken: { id: string } })[];
    special_tokens?: Record<string, { ids: number[] }>;
  } | null;
}

const PATTERN = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

/** GPT-2's byte to character table: printable bytes keep their character, the rest move above 255. */
export function bytesToUnicode(): string[] {
  const table: string[] = [];
  let next = 256;
  for (let b = 0; b < 256; b++) {
    const printable = (b >= 33 && b <= 126) || (b >= 161 && b <= 172) || (b >= 174 && b <= 255);
    table[b] = String.fromCodePoint(printable ? b : next++);
  }
  return table;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createBpeTokenizer(json: TokenizerJson): (text: string) => number[] {
  const { vocab } = json.model;
  const ranks = new Map<string, number>();
  json.model.merges.forEach((merge, rank) => {
    const [a, b] = typeof merge === "string" ? (merge.split(" ") as [string, string]) : merge;
    ranks.set(`${a} ${b}`, rank);
  });
  const byteChar = bytesToUnicode();
  const encoder = new TextEncoder();
  const cache = new Map<string, number[]>();
  const added = new Map(json.added_tokens.map((token) => [token.content, token.id]));
  const addedPattern =
    added.size === 0 ? undefined : new RegExp(`(${[...added.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|")})`);

  function bpe(piece: string): number[] {
    const hit = cache.get(piece);
    if (hit !== undefined) return hit;
    let parts = [...encoder.encode(piece)].map((byte) => byteChar[byte]!);
    for (;;) {
      let best = -1;
      let bestRank = Infinity;
      for (let i = 0; i < parts.length - 1; i++) {
        const rank = ranks.get(`${parts[i]} ${parts[i + 1]}`);
        if (rank !== undefined && rank < bestRank) [best, bestRank] = [i, rank];
      }
      if (best < 0) break;
      const merged = parts[best]! + parts[best + 1]!;
      const next: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        if (i < parts.length - 1 && parts[i] === parts[best] && parts[i + 1] === parts[best + 1]) {
          next.push(merged);
          i++;
        } else next.push(parts[i]!);
      }
      parts = next;
    }
    const ids = parts.map((part) => {
      const id = vocab[part];
      if (id === undefined) throw new Error(`tokenizer: no token for "${part}" in "${piece}"`);
      return id;
    });
    cache.set(piece, ids);
    return ids;
  }

  const suffix: number[] = [];
  for (const item of json.post_processor?.single ?? []) {
    if ("SpecialToken" in item) suffix.push(...(json.post_processor?.special_tokens?.[item.SpecialToken.id]?.ids ?? []));
  }

  return (text) => {
    const ids: number[] = [];
    const chunks = addedPattern === undefined ? [text] : text.split(addedPattern);
    for (const chunk of chunks) {
      const special = added.get(chunk);
      if (special !== undefined) ids.push(special);
      else for (const match of chunk.matchAll(PATTERN)) ids.push(...bpe(match[0]));
    }
    return [...ids, ...suffix];
  };
}
```

(The merge loop above merges every occurrence of the best pair in one pass, as GPT-2's reference `bpe()` does.)

- [ ] **Step 4:** tests pass (the real-tokenizer test runs in Task 9 with `MOTIONCRAFT_TTS_TEST=1`). **Step 5:** check, commit `GPT-2 byte-level BPE tokenizer for Chatterbox`.

### Task 3: Token sampling

**Files:** Create `src/narration/sampling.ts`; Test `tests/narration-sampling.test.ts`

- [ ] **Step 1: Failing tests**:

```ts
import { describe, expect, it } from "vitest";
import { pickToken } from "../src/narration/sampling";

const opts = { temperature: 0.8, topK: 1000, topP: 0.95, repetitionPenalty: 1.2 };

describe("pickToken", () => {
  it("is greedy at temperature 0, after the repetition penalty", () => {
    // Token 0 leads (2.0) but was said before: 2.0 / 1.2 < 1.9.
    expect(pickToken(Float32Array.of(2.0, 1.9, -1), [0], 0.5, { ...opts, temperature: 0 })).toBe(1);
  });
  it("penalizes a negative logit by multiplying", () => {
    expect(pickToken(Float32Array.of(-1, -1.1), [0], 0.5, { ...opts, temperature: 0 })).toBe(1);
  });
  it("keeps only the top-p nucleus", () => {
    // After softmax, token 0 holds ~0.98 of the mass: the nucleus is just token 0.
    const logits = Float32Array.of(10, 6, 5);
    for (const u of [0, 0.5, 0.999]) expect(pickToken(logits, [], u, opts)).toBe(0);
  });
  it("draws by cumulative probability inside the nucleus", () => {
    const logits = Float32Array.of(1, 1, 1, 1); // uniform: the nucleus holds all four
    expect(pickToken(logits, [], 0.1, { ...opts, temperature: 1 })).toBe(0);
    expect(pickToken(logits, [], 0.6, { ...opts, temperature: 1 })).toBe(2);
    expect(pickToken(logits, [], 0.99, { ...opts, temperature: 1 })).toBe(3);
  });
  it("keeps only the top k", () => {
    expect(pickToken(Float32Array.of(1, 3, 2), [], 0.99, { ...opts, topK: 1 })).toBe(1);
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3: Implement**:

```ts
// Picks the next speech token from the language model's logits the way the
// chatterbox-tts package does for Turbo: a repetition penalty on every token
// already said, then temperature, top-k and top-p (nucleus) sampling. `u` is a
// uniform draw in [0, 1) from the caller's seeded generator, so a seed always
// picks the same tokens. Temperature 0 is greedy. Pure.

export interface SamplingOptions {
  temperature: number;
  topK: number;
  topP: number;
  repetitionPenalty: number;
}

export const TURBO_SAMPLING: SamplingOptions = { temperature: 0.8, topK: 1000, topP: 0.95, repetitionPenalty: 1.2 };

export function pickToken(logits: ArrayLike<number>, said: Iterable<number>, u: number, options: SamplingOptions): number {
  const scores = Float64Array.from(logits);
  for (const token of new Set(said)) {
    const s = scores[token]!;
    scores[token] = s < 0 ? s * options.repetitionPenalty : s / options.repetitionPenalty;
  }
  if (options.temperature === 0) {
    let best = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i]! > scores[best]!) best = i;
    return best;
  }
  const order = Array.from(scores.keys()).sort((a, b) => scores[b]! - scores[a]! || a - b).slice(0, options.topK);
  const top = scores[order[0]!]!;
  const weights = order.map((i) => Math.exp((scores[i]! - top) / options.temperature));
  const total = weights.reduce((sum, w) => sum + w, 0);
  // The nucleus: the most likely tokens up to and including the one that reaches top-p.
  let keep = 0;
  for (let mass = 0; keep < weights.length; keep++) {
    mass += weights[keep]! / total;
    if (mass >= options.topP) {
      keep++;
      break;
    }
  }
  const kept = weights.slice(0, Math.max(1, keep));
  const target = u * kept.reduce((sum, w) => sum + w, 0);
  let acc = 0;
  for (let i = 0; i < kept.length; i++) {
    acc += kept[i]!;
    if (target < acc) return order[i]!;
  }
  return order[kept.length - 1]!;
}
```

- [ ] **Step 4:** pass. **Step 5:** check, commit `Seeded top-k/top-p sampling for speech tokens`.

### Task 4: 32-bit float WAV and the voice file format

**Files:** Modify `src/narration/wav.ts`; Create `src/narration/chatterboxVoice.ts`; Tests `tests/narration-text.test.ts` (or wherever `decodeWav` is tested; grep), `tests/narration-chatterbox-voice.test.ts`

- [ ] **Step 1: Failing tests.** WAV: build a 32-bit float mono RIFF by hand (`fmt ` format 3, 32 bits) with samples `[0.5, -0.25]`, expect `decodeWav` to return them exactly. Voice file:

```ts
import { describe, expect, it } from "vitest";
import { decodeVoice, encodeVoice, type VoiceConditioning } from "../src/narration/chatterboxVoice";

const voice: VoiceConditioning = {
  audioFeatures: { dims: [1, 2, 2], data: Float32Array.of(1, 2, 3, 4) },
  audioTokens: { dims: [1, 3], data: BigInt64Array.of(7n, 8n, 6561n) },
  speakerEmbeddings: { dims: [1, 2], data: Float32Array.of(0.5, -0.5) },
  speakerFeatures: { dims: [1, 1, 2], data: Float32Array.of(9, 10) },
};

describe("voice file", () => {
  it("round-trips through JSON", () => {
    const back = decodeVoice(JSON.parse(JSON.stringify(encodeVoice(voice, { source: "test" }))));
    expect(back).toEqual(voice);
  });
  it("rejects data that does not fill its dims", () => {
    const file = encodeVoice(voice, { source: "test" });
    file.audioFeatures.dims = [1, 3, 2];
    expect(() => decodeVoice(file)).toThrow(/audioFeatures/);
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3: Implement.** In `wav.ts` `decodeWav`, accept `format === 3 && bits === 32` (read `getFloat32` little-endian per sample) beside 16-bit PCM; update the error to "only 16-bit PCM or 32-bit float mono WAV is supported". `chatterboxVoice.ts`:

```ts
// A Chatterbox voice: what the speech encoder makes of a reference recording,
// saved so speaking never needs the encoder. Stored as JSON with each tensor's
// dims and its little-endian bytes in base64. Pure.

export interface FloatTensor { dims: number[]; data: Float32Array }
export interface IntTensor { dims: number[]; data: BigInt64Array }

export interface VoiceConditioning {
  /** Prefix for the language model: `[1, n, 1024]`. */
  audioFeatures: FloatTensor;
  /** Speech tokens of the reference, which the decoder continues from: `[1, m]`. */
  audioTokens: IntTensor;
  speakerEmbeddings: FloatTensor;
  speakerFeatures: FloatTensor;
}

const NAMES = ["audioFeatures", "audioTokens", "speakerEmbeddings", "speakerFeatures"] as const;
type Stored = { dims: number[]; base64: string };
export type VoiceFile = { source: string } & Record<(typeof NAMES)[number], Stored>;

const bytesOf = (data: Float32Array | BigInt64Array) => Buffer.from(data.buffer, data.byteOffset, data.byteLength);

export function encodeVoice(voice: VoiceConditioning, meta: { source: string }): VoiceFile {
  const store = (t: FloatTensor | IntTensor): Stored => ({ dims: [...t.dims], base64: bytesOf(t.data).toString("base64") });
  return { source: meta.source, audioFeatures: store(voice.audioFeatures), audioTokens: store(voice.audioTokens), speakerEmbeddings: store(voice.speakerEmbeddings), speakerFeatures: store(voice.speakerFeatures) };
}

export function decodeVoice(file: VoiceFile): VoiceConditioning {
  const read = (name: (typeof NAMES)[number], width: 4 | 8) => {
    const stored = file[name];
    const bytes = Buffer.from(stored.base64, "base64");
    const count = stored.dims.reduce((a, b) => a * b, 1);
    if (bytes.length !== count * width) throw new Error(`voice file: ${name} has ${bytes.length} bytes, dims ${stored.dims.join("x")} need ${count * width}`);
    const copy = new Uint8Array(bytes).buffer;
    return { dims: [...stored.dims], data: width === 4 ? new Float32Array(copy) : new BigInt64Array(copy) };
  };
  return {
    audioFeatures: read("audioFeatures", 4) as FloatTensor,
    audioTokens: read("audioTokens", 8) as IntTensor,
    speakerEmbeddings: read("speakerEmbeddings", 4) as FloatTensor,
    speakerFeatures: read("speakerFeatures", 4) as FloatTensor,
  };
}
```

- [ ] **Step 4:** pass. **Step 5:** check, commit `Voice conditioning file; decode 32-bit float WAV`.

### Task 5: The generation loop

**Files:** Create `src/narration/chatterboxModel.ts`; Test `tests/narration-chatterbox-model.test.ts`

Port of the README / `gen2.py` Turbo loop. Constants: `START_SPEECH = 6561`, `STOP_SPEECH = 6562`, `SILENCE = 4299`, `MAX_NEW_TOKENS = 1000` (40 s; a line never needs it), KV heads 16, head dim 64.

```ts
export interface Tensorish { dims: readonly number[]; data: unknown }
/** One ONNX session: feeds in, outputs out (the real one wraps `InferenceSession.run`). */
export type Run = (feeds: Record<string, Tensorish>) => Promise<Record<string, Tensorish>>;
export interface ChatterboxSessions {
  embed: Run;
  languageModel: Run;
  decoder: Run;
  /** The language model's `past_key_values.*` input names, in order. */
  pastNames: readonly string[];
  /** Makes a tensor (wraps `new ort.Tensor`). */
  tensor: (type: "float32" | "int64", data: Float32Array | BigInt64Array, dims: readonly number[]) => Tensorish;
}
export interface Generated { samples: Float32Array; tokens: number; finished: boolean }
export async function generateSpeech(
  sessions: ChatterboxSessions, voice: VoiceConditioning, textIds: readonly number[],
  draw: (step: number) => number, sampling?: SamplingOptions,
): Promise<Generated>
```

Loop: step 0 embeds `textIds`, prepends `voice.audioFeatures` along the sequence axis (concatenate floats: features first), `attention_mask` all ones, `position_ids` 0..n-1, every past an empty `[1, 16, 0, 64]` float32. Each step: run the LM; take the last row of `logits` (`[1, seq, 6563]`); `pickToken(row, generated, draw(step), sampling)`; stop on `STOP_SPEECH`; otherwise embed `[[token]]`, append 1 to the mask, `position_ids = [[last + 1]]`, pasts = the `present.*` outputs in order. `generated` starts as `[START_SPEECH]` (as the reference does, so START is penalized too). Decode `[...voice.audioTokens, ...tokens, SILENCE×3]` with `speaker_embeddings`/`speaker_features`; `samples` = `waveform` data. `finished` is false when it hit `MAX_NEW_TOKENS`.

- [ ] **Step 1: Failing tests** with fake sessions (no model): a fake LM whose logits favour token `100 + step` for 3 steps and then `STOP_SPEECH`; assert (a) the decoder got `[...audioTokens, 100, 101, 102, 4299, 4299, 4299]`, (b) the first LM call's `inputs_embeds` dims are `[1, featuresLen + textLen, 1024]` (fake embed returns `[1, len, 1024]` zeros), later calls `[1, 1, 1024]`, (c) `attention_mask` grows by one per step and `position_ids` continue from the prefix length, (d) `finished` false and 1000 tokens when STOP never comes (fake LM always favours token 5).
- [ ] **Step 2:** FAIL. **Step 3:** implement as specified. **Step 4:** pass. **Step 5:** check, commit `Chatterbox-Turbo generation loop (KV cache, seeded sampling)`.

### Task 6: Borrowed word times and the length check

**Files:** Create `src/narration/borrowedWords.ts`; Test `tests/narration-borrowed-words.test.ts`

```ts
export interface WordSpan { startSample: number; endSample: number }
/** Where sound is in a recording: [first, last] loud sample (`SPEECH_LEVEL`), or undefined when silent. */
export function soundSpan(samples: Float32Array): { first: number; last: number } | undefined
/**
 * `words` timed on recording `from` (sound span `fromSound`), moved onto another recording of the same
 * line (sound span `toSound`) by a linear map of one sound span onto the other.
 */
export function stretchWords(words: readonly WordSpan[], fromSound: { first: number; last: number }, toSound: { first: number; last: number }): WordSpan[]
/** Whether a line that took `seconds` is a plausible saying of one Kokoro said in `referenceSeconds`: between 0.6x and 1.6x. */
export function plausibleLength(seconds: number, referenceSeconds: number): boolean
```

Export `SPEECH_LEVEL` from `silence.ts` and reuse it. Tests: a span of samples maps proportionally (`fromSound 100..1100`, `toSound 0..2000`: a word at 600..1100 becomes 1000..2000); words are clamped to the target span; `plausibleLength(5, 4.6)` true, `(9, 4.6)` and `(2, 4.6)` false; `soundSpan` of all-silence is undefined.

- [ ] Steps 1–5 as usual; commit `Stretch Kokoro word times onto another recording`.

### Task 7: The Chatterbox synthesizer and the voice router

**Files:** Create `src/narration/chatterbox.ts`, `src/narration/synthesizer.ts`; Modify `src/narration/voices.ts`, `src/narration/silence.ts` (export), `tests/narration-args.test.ts`; Test `tests/narration-chatterbox.test.ts`

`voices.ts`:

```ts
export const CHATTERBOX_VOICES = ["chatterbox"] as const;
export const KOKORO_VOICES = ["af_heart", "af_bella", "am_michael"] as const;
export const STOCK_VOICES = [...CHATTERBOX_VOICES, ...KOKORO_VOICES] as const;
export type StockVoice = (typeof STOCK_VOICES)[number];
export const isChatterboxVoice = (voice: string): boolean => (CHATTERBOX_VOICES as readonly string[]).includes(voice);
```

`tests/narration-args.test.ts`: the `VOICE_FILES` keys now equal `KOKORO_VOICES`.

`chatterbox.ts`:

```ts
export interface ChatterboxOptions {
  cacheDir?: string;
  offline?: boolean;
  /** Times the words and sets the expected length: Kokoro, saying the same text. */
  timing: Synthesizer;
  /** For tests: replaces loading the model files. */
  load?: () => Promise<{ sessions: ChatterboxSessions; encode: (text: string) => number[] }>;
  /** For tests: the voice instead of `assets/voices/chatterbox.json`. */
  voice?: VoiceConditioning;
}
export const TIMING_VOICE = "af_heart";
export const ATTEMPTS = 3;
export function chatterboxSynthesizer(options: ChatterboxOptions): Synthesizer
```

`speak(text, voice)`: unknown voice → error listing `CHATTERBOX_VOICES`. Lazy load (same failed-load-doesn't-stick pattern as Kokoro): `ensureFile` every `CHATTERBOX_FILES` entry (weights first so a graph never loads without them), `ort.InferenceSession.create(graphPath)` for the three graphs, tokenizer via `createBpeTokenizer`, voice via `decodeVoice` of `assets/voices/chatterbox.json` (resolved from this module: `fileURLToPath(new URL("../../assets/voices/chatterbox.json", import.meta.url))`; check how `src/render/fonts.ts` finds `assets/fonts` and do the same). Then: `timing = await options.timing.speak(text, TIMING_VOICE, 1)`; for `attempt` 0..2, `generateSpeech(..., (step) => random(\`${text}\u0000${attempt}\u0000${step}\`))`; accept the first `finished` result whose sound length is `plausibleLength` of the timing's sound length; otherwise keep the finished one closest to a ratio of 1 (any one, if none finished). Words: `stretchWords(timing.words, soundSpan(timing.samples), soundSpan(samples))` when timing has words and both spans exist, else `undefined` (narrate falls back to its estimate). `speed` is ignored (Chatterbox has no pace control).

`synthesizer.ts`:

```ts
// Picks the engine for a voice: Chatterbox voices, else Kokoro. Both load lazily, so a
// storyboard that only uses one engine never downloads the other's model.
export function voiceSynthesizer(options: { cacheDir?: string; offline?: boolean } = {}): Synthesizer {
  const kokoro = kokoroSynthesizer(options);
  const chatterbox = chatterboxSynthesizer({ ...options, timing: kokoro });
  return { speak: (text, voice, speed) => (isChatterboxVoice(voice) ? chatterbox : kokoro).speak(text, voice, speed) };
}
```

Tests with fakes (`load` and `voice` injected, a fake `timing` synthesizer): words are stretched onto the Chatterbox sound; an implausibly long first attempt is retried and the second kept (fake LM keyed by the draw sequence, or simpler: inject a fake `generate` via `load` returning sessions whose decoder output length depends on a call counter); the router sends `chatterbox` to Chatterbox and `af_heart` to Kokoro (fake both through a small `routeVoice(chatterbox, kokoro)` helper that `voiceSynthesizer` uses, so the routing is testable without models); an unknown voice is rejected before loading.

- [ ] Steps 1–5; commit `Chatterbox synthesizer with Kokoro word times; route voices by name`.

### Task 8: Default voice, cache key, scripts

**Files:** Modify `src/narration/narrate.ts`, `scripts/narrate.ts`, `scripts/render.ts`; Tests `tests/narration-narrate.test.ts`

- `DEFAULT_VOICE = "chatterbox"`; `NARRATION_CACHE_VERSION = 7`; add `CHATTERBOX_REVISION` to the cache key parts. Fix existing narrate tests that assume `af_heart` is the default (they pass a fake synthesizer, so only expectations on the voice name change).
- Both scripts: `voiceSynthesizer({ offline })` instead of `kokoroSynthesizer`. Update the header comment of `scripts/narrate.ts` ("locally (Chatterbox, or Kokoro)").
- Test: a storyboard with no `voice` is spoken with `chatterbox`.
- [ ] check; commit `Chatterbox is the default voice`.

### Task 9: The voice file and the real model

- [ ] `scripts/chatterbox-voice.ts`: `ensureFile` `SPEECH_ENCODER_FILES` and `REFERENCE_VOICE_FILE`, `decodeWav` the reference, run the encoder (`audio_values` `[1, n]`), map outputs `audio_features`, `audio_tokens`, `speaker_embeddings`, `speaker_features` into `VoiceConditioning`, write `assets/voices/chatterbox.json` with `encodeVoice(…, { source: "onnx-community/chatterbox-ONNX@<rev> default_voice.wav, encoded by ResembleAI/chatterbox-turbo-ONNX@<rev> speech_encoder_quantized" })`. Run it; commit the JSON.
- [ ] Opt-in tests (`MOTIONCRAFT_TTS_TEST=1`) in `tests/narration-chatterbox.test.ts`: the real voice speaks "Type one prompt, and get a finished video." at 24 kHz, 1.5–6 s, 8 words in order; the real tokenizer test from Task 2. Run them: `MOTIONCRAFT_TTS_TEST=1 npx vitest run tests/narration-chatterbox.test.ts tests/narration-bpe.test.ts`. Record the speed (seconds of audio per second of compute).
- [ ] commit `Default Chatterbox voice file; real-model tests`.

### Task 10: Docs and licenses

- `licenses/README.md`: a "Voice models" entry: Chatterbox-Turbo ONNX (MIT, Resemble AI, pinned revision), the reference recording `default_voice.wav` (MIT, onnx-community/chatterbox-ONNX; speaker not documented by the source), and the derived `assets/voices/chatterbox.json`.
- `docs/design.md`: narration is Chatterbox-Turbo (Kokoro for word timing and as alternative voices); drop "custom voices" from out of scope only if needed (we ship one stock voice, so leave "voice cloning" there).
- `docs/agent-guide.md`: the voice list (`chatterbox` default; Kokoro voices), `voiceSpeed` applies to Kokoro voices only.
- `README.md`: wherever it names Kokoro as the voice.
- [ ] check; commit `Docs and licenses for the Chatterbox voice`.

### Task 11: Hear it

- [ ] Re-narrate `examples/welcome/storyboard.json` (`npx tsx scripts/render.ts examples/welcome/storyboard.json --out <scratch>/welcome-chatterbox.mp4`), confirm every scene's length is plausible, render stills at a few caption cues to check sync, and ask the user before playing it.
