// The pinned files the local voice needs (model, tokenizer, voices and
// pronunciation dictionaries) and a fetcher that downloads each once into a
// cache, checking its size and SHA-256. This is the only network use in
// motioncraft, and `offline` turns it off.

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface PinnedFile {
  url: string;
  sha256: string;
  bytes: number;
  /** Relative to the cache directory. */
  path: string;
}

/** onnx-community/Kokoro-82M-v1.0-ONNX (Apache-2.0, hexgrad). */
export const KOKORO_REVISION = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
/** hexgrad/misaki (Apache-2.0). */
export const MISAKI_REVISION = "fba1236595f2d2bf21d414ba6e57d25256afada3";

function modelFile(name: string, bytes: number, sha256: string): PinnedFile {
  return {
    url: `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/${KOKORO_REVISION}/${name}`,
    sha256,
    bytes,
    path: join("kokoro", KOKORO_REVISION, ...name.split("/")),
  };
}

function dictionaryFile(name: string, bytes: number, sha256: string): PinnedFile {
  return {
    url: `https://raw.githubusercontent.com/hexgrad/misaki/${MISAKI_REVISION}/misaki/data/${name}`,
    sha256,
    bytes,
    path: join("misaki", MISAKI_REVISION, name),
  };
}

export const MODEL_FILE = modelFile(
  "onnx/model_quantized.onnx",
  92361116,
  "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478",
);
export const TOKENIZER_FILE = modelFile(
  "tokenizer.json",
  3497,
  "77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34",
);
export const VOICE_FILES: Readonly<Record<string, PinnedFile>> = {
  af_heart: modelFile("voices/af_heart.bin", 522240, "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b"),
  af_bella: modelFile("voices/af_bella.bin", 522240, "f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b"),
  am_michael: modelFile("voices/am_michael.bin", 522240, "1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1"),
};
export const GOLD_FILE = dictionaryFile(
  "us_gold.json",
  3000469,
  "dc414872a49a28ae6c141463d502fd945f3b2fde040484fdc47d00cc4612686f",
);
export const SILVER_FILE = dictionaryFile(
  "us_silver.json",
  3099517,
  "de8f67be911bb6c659187b4a65fd966b6a30e56350e0f790d763210b053ac475",
);

const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

export function defaultCacheDir(): string {
  return join(homedir(), ".cache", "motioncraft");
}

function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The cached copy's path when it is the right size and hash, else undefined. */
async function cachedCopy(file: PinnedFile, target: string): Promise<string | undefined> {
  try {
    if ((await stat(target)).size !== file.bytes) return undefined;
    return sha256Of(await readFile(target)) === file.sha256 ? target : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The local path of `file`, downloaded into `cacheDir` first if it is not
 * there with the right size and hash. A download is verified before it is
 * moved into place, so a partial or wrong file is never cached.
 */
export async function ensureFile(
  file: PinnedFile,
  cacheDir: string,
  options: { offline?: boolean; fetch?: typeof fetch } = {},
): Promise<string> {
  const target = join(cacheDir, file.path);
  const cached = await cachedCopy(file, target);
  if (cached !== undefined) return cached;
  if (options.offline) throw new Error(`not cached while offline: run once online to download ${file.path}`);

  const response = await (options.fetch ?? fetch)(file.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`downloading ${file.path} failed: HTTP ${response.status} from ${file.url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== file.bytes || sha256Of(bytes) !== file.sha256) {
    throw new Error(`${file.path} does not match its pinned hash (expected ${file.bytes} bytes, sha256 ${file.sha256}); refusing to use it`);
  }

  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.part`;
  try {
    await writeFile(temp, bytes);
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
  return target;
}
