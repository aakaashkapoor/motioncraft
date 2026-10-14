// The pinned files the local voices need (models, tokenizers, voices and
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
/**
 * onnx-community/Kokoro-82M-v1.0-ONNX-timestamped (Apache-2.0): the same
 * weights and tokenizer, whose model also returns each input id's duration.
 */
export const KOKORO_TIMESTAMPED_REVISION = "dd4401a9add81ac692d20e240d22ec9dda82cc29";
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

export const MODEL_FILE: PinnedFile = {
  url: `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/resolve/${KOKORO_TIMESTAMPED_REVISION}/onnx/model_quantized.onnx`,
  sha256: "c0c02b3299fd97c34ea92a98e6d41eaa1a739c8f77bf685aac34bd7b34c1132c",
  bytes: 92361055,
  path: join("kokoro-timestamped", KOKORO_TIMESTAMPED_REVISION, "onnx", "model_quantized.onnx"),
};
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

/**
 * What speaking with Chatterbox needs. Each `.onnx` graph loads its weights
 * from the `.onnx_data` file beside it, by name. The language model is the
 * 4-bit one: on CPU the 8-bit one is about twenty times slower.
 */
export const CHATTERBOX_FILES = {
  tokenizer: chatterboxFile("tokenizer.json", 3562272, "3f04e34bea22f9144d1a19151154095bc9ce0430bf421304f5797e716288a906"),
  languageModel: chatterboxFile("onnx/language_model_q4.onnx", 274572, "b39d03d3f8b943b9e60c6fce3fb41191dbc1df4589f913291db1e214eef669b1"),
  languageModelData: chatterboxFile(
    "onnx/language_model_q4.onnx_data",
    204456572,
    "2c029dc0acf48752473d8c74c72b5ceaaad76b9886fe106eaf2022142d5b5d5e",
  ),
  embedTokens: chatterboxFile("onnx/embed_tokens_quantized.onnx", 2887, "0efe1bc01c2c48a98425a74444fd9887924d887f922c2722a6ec961ebb9e1db6"),
  embedTokensData: chatterboxFile(
    "onnx/embed_tokens_quantized.onnx_data",
    67297376,
    "9025d04c124899823124b1d7bb7069b1f535fb8a6c2d88f97520eb6fecced986",
  ),
  decoder: chatterboxFile("onnx/conditional_decoder_quantized.onnx", 2202035, "2af3b150196d9d559cd3c91e03da80eb27a466032369dc2b57ea729cddad3ebb"),
  decoderData: chatterboxFile(
    "onnx/conditional_decoder_quantized.onnx_data",
    326548688,
    "4918ca09e05e41d2b4aa1ace6201d1cd911ffc58a42801002bab177d495cfe0a",
  ),
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
