// Makes the default Chatterbox voice: runs the pinned speech encoder on the
// pinned reference recording and writes what it gives to
// assets/voices/chatterbox.json, so speaking never needs the encoder. Run once;
// the output is committed.
//   npx tsx scripts/chatterbox-voice.ts [--offline]

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  CHATTERBOX_REVISION,
  CHATTERBOX_VOICE_REVISION,
  defaultCacheDir,
  ensureFile,
  REFERENCE_VOICE_FILE,
  SPEECH_ENCODER_FILES,
} from "../src/narration/assets";
import { CHATTERBOX_VOICE_PATH, encodeVoice } from "../src/narration/chatterboxVoice";
import { decodeWav } from "../src/narration/wav";

async function main(argv: string[]): Promise<void> {
  const options = { offline: argv.includes("--offline") };
  const cacheDir = defaultCacheDir();
  // The weights first, so the graph never loads without them.
  const [graph] = [await ensureFile(SPEECH_ENCODER_FILES[0]!, cacheDir, options), await ensureFile(SPEECH_ENCODER_FILES[1]!, cacheDir, options)];
  const reference = decodeWav(new Uint8Array(await readFile(await ensureFile(REFERENCE_VOICE_FILE, cacheDir, options))));
  if (reference.sampleRate !== 24000) throw new Error(`the reference must be 24 kHz (got ${reference.sampleRate})`);

  const ort = await import("onnxruntime-node");
  const session = await ort.InferenceSession.create(graph);
  const out = await session.run({ audio_values: new ort.Tensor("float32", reference.samples, [1, reference.samples.length]) });
  const float = (name: string) => ({ dims: [...out[name]!.dims], data: Float32Array.from(out[name]!.data as Float32Array) });
  const voice = {
    audioFeatures: float("audio_features"),
    audioTokens: { dims: [...out["audio_tokens"]!.dims], data: BigInt64Array.from(out["audio_tokens"]!.data as BigInt64Array) },
    speakerEmbeddings: float("speaker_embeddings"),
    speakerFeatures: float("speaker_features"),
  };
  const source =
    `default_voice.wav of onnx-community/chatterbox-ONNX@${CHATTERBOX_VOICE_REVISION}, ` +
    `read by speech_encoder_quantized of ResembleAI/chatterbox-turbo-ONNX@${CHATTERBOX_REVISION}`;
  await mkdir(dirname(CHATTERBOX_VOICE_PATH), { recursive: true });
  await writeFile(CHATTERBOX_VOICE_PATH, `${JSON.stringify(encodeVoice(voice, { source }), null, 2)}\n`);
  for (const [name, tensor] of Object.entries(voice)) console.log(`${name}  ${tensor.dims.join("x")}`);
  console.log(CHATTERBOX_VOICE_PATH);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
