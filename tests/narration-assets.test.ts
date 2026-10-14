import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CHATTERBOX_FILES,
  CHATTERBOX_REVISION,
  ensureFile,
  GOLD_FILE,
  KOKORO_REVISION,
  KOKORO_TIMESTAMPED_REVISION,
  MODEL_FILE,
  SILVER_FILE,
  REFERENCE_VOICE_FILE,
  SPEECH_ENCODER_FILES,
  VOICE_FILES,
  type PinnedFile,
} from "../src/narration/assets";

const bytes = new TextEncoder().encode("pinned file contents");
const file: PinnedFile = {
  url: "https://example.test/file.bin",
  sha256: createHash("sha256").update(bytes).digest("hex"),
  bytes: bytes.length,
  path: join("sub", "file.bin"),
};

function fakeFetch(body: Uint8Array, status = 200): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fake = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(body as BodyInit, { status });
  }) as typeof fetch;
  return { fetch: fake, calls };
}

let cacheDir: string;
beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "mc-assets-"));
});
afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

describe("ensureFile", () => {
  it("downloads, verifies and caches a missing file", async () => {
    const { fetch, calls } = fakeFetch(bytes);
    const path = await ensureFile(file, cacheDir, { fetch });
    expect(path).toBe(join(cacheDir, "sub", "file.bin"));
    expect(new Uint8Array(await readFile(path))).toEqual(bytes);
    expect(calls).toEqual([file.url]);
    expect(await readdir(join(cacheDir, "sub"))).toEqual(["file.bin"]);
  });

  it("returns a cached file without fetching", async () => {
    await mkdir(join(cacheDir, "sub"));
    await writeFile(join(cacheDir, "sub", "file.bin"), bytes);
    const { fetch, calls } = fakeFetch(new Uint8Array());
    expect(await ensureFile(file, cacheDir, { fetch })).toBe(join(cacheDir, "sub", "file.bin"));
    expect(calls).toEqual([]);
  });

  it("downloads again over a corrupt cached file", async () => {
    await mkdir(join(cacheDir, "sub"));
    await writeFile(join(cacheDir, "sub", "file.bin"), new TextEncoder().encode("pinned file contenXs"));
    const { fetch, calls } = fakeFetch(bytes);
    const path = await ensureFile(file, cacheDir, { fetch });
    expect(new Uint8Array(await readFile(path))).toEqual(bytes);
    expect(calls).toHaveLength(1);
  });

  it("fails naming the file on a hash mismatch, and caches nothing", async () => {
    const wrong = new TextEncoder().encode("pinned file contenXs");
    await expect(ensureFile(file, cacheDir, { fetch: fakeFetch(wrong).fetch })).rejects.toThrow(/sub.file\.bin/);
    expect(await readdir(cacheDir)).toEqual([]);
  });

  it("fails on an HTTP error", async () => {
    await expect(ensureFile(file, cacheDir, { fetch: fakeFetch(new Uint8Array(), 404).fetch })).rejects.toThrow(/404/);
  });

  it("offline never fetches and says to run once online", async () => {
    const { fetch, calls } = fakeFetch(bytes);
    const error = await ensureFile(file, cacheDir, { offline: true, fetch }).catch((e: Error) => e);
    expect((error as Error).message).toMatch(/run once online to download .*file\.bin/);
    expect((error as Error).message.split("file.bin")).toHaveLength(2); // names the file once
    expect(calls).toEqual([]);
  });

  it("offline still serves a cached file", async () => {
    await mkdir(join(cacheDir, "sub"));
    await writeFile(join(cacheDir, "sub", "file.bin"), bytes);
    expect(await ensureFile(file, cacheDir, { offline: true })).toBe(join(cacheDir, "sub", "file.bin"));
  });
});

describe("the pinned files", () => {
  it("point at the pinned revisions", () => {
    expect(KOKORO_TIMESTAMPED_REVISION).toBe("dd4401a9add81ac692d20e240d22ec9dda82cc29");
    expect(MODEL_FILE.url).toBe(
      `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/resolve/${KOKORO_TIMESTAMPED_REVISION}/onnx/model_quantized.onnx`,
    );
    expect(MODEL_FILE.path).toBe(join("kokoro-timestamped", KOKORO_TIMESTAMPED_REVISION, "onnx", "model_quantized.onnx"));
    expect(MODEL_FILE.bytes).toBe(92361055);
    expect(MODEL_FILE.sha256).toBe("c0c02b3299fd97c34ea92a98e6d41eaa1a739c8f77bf685aac34bd7b34c1132c");
    expect(GOLD_FILE.url).toMatch(/raw\.githubusercontent\.com\/hexgrad\/misaki\/fba1236595f2d2bf21d414ba6e57d25256afada3\/misaki\/data\/us_gold\.json$/);
    expect(SILVER_FILE.bytes).toBe(3099517);
    expect(Object.keys(VOICE_FILES)).toEqual(["af_heart", "af_bella", "am_michael"]);
  });
});

describe("the Chatterbox files", () => {
  it("are pinned to one revision of the official ONNX export", () => {
    for (const pinned of [...Object.values(CHATTERBOX_FILES), ...SPEECH_ENCODER_FILES]) {
      expect(pinned.url).toContain(`/ResembleAI/chatterbox-turbo-ONNX/resolve/${CHATTERBOX_REVISION}/`);
      expect(pinned.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(pinned.bytes).toBeGreaterThan(0);
    }
  });

  it("keep each graph beside its weights, under the name the graph loads them by", () => {
    const pairs = [
      [CHATTERBOX_FILES.languageModel, CHATTERBOX_FILES.languageModelData],
      [CHATTERBOX_FILES.embedTokens, CHATTERBOX_FILES.embedTokensData],
      [CHATTERBOX_FILES.decoder, CHATTERBOX_FILES.decoderData],
      [SPEECH_ENCODER_FILES[0]!, SPEECH_ENCODER_FILES[1]!],
    ] as const;
    for (const [graph, weights] of pairs) {
      expect(dirname(weights.path)).toBe(dirname(graph.path));
      expect(basename(weights.path)).toBe(`${basename(graph.path)}_data`);
    }
    expect(basename(CHATTERBOX_FILES.languageModel.path)).toBe("language_model_q4.onnx");
  });

  it("pin the reference recording of the default voice", () => {
    expect(REFERENCE_VOICE_FILE.url).toMatch(/onnx-community\/chatterbox-ONNX\/resolve\/[0-9a-f]{40}\/default_voice\.wav$/);
    expect(REFERENCE_VOICE_FILE.sha256).toBe("3ebc531cdaba358a327099c1c4f0448026719957bcf4d8e9868767f227e02f4e");
  });
});
