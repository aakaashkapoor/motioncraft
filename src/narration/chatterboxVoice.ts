// A Chatterbox voice: what the speech encoder makes of a reference recording,
// saved so speaking never needs the encoder (or its 350 MB of weights). Stored
// as JSON with each tensor's dims and its little-endian bytes in base64. Pure.

export interface FloatTensor {
  dims: number[];
  data: Float32Array;
}

export interface IntTensor {
  dims: number[];
  data: BigInt64Array;
}

export interface VoiceConditioning {
  /** What the language model reads before the text: `[1, n, 1024]`. */
  audioFeatures: FloatTensor;
  /** The reference's speech tokens, which the decoder continues from: `[1, m]`. */
  audioTokens: IntTensor;
  /** `[1, 192]`. */
  speakerEmbeddings: FloatTensor;
  /** `[1, frames, 80]`. */
  speakerFeatures: FloatTensor;
}

interface StoredTensor {
  dims: number[];
  base64: string;
}

export interface VoiceFile {
  /** Where the voice came from: the recording and the encoder that read it. */
  source: string;
  audioFeatures: StoredTensor;
  audioTokens: StoredTensor;
  speakerEmbeddings: StoredTensor;
  speakerFeatures: StoredTensor;
}

function store(tensor: FloatTensor | IntTensor): StoredTensor {
  const bytes = Buffer.from(tensor.data.buffer, tensor.data.byteOffset, tensor.data.byteLength);
  return { dims: [...tensor.dims], base64: bytes.toString("base64") };
}

export function encodeVoice(voice: VoiceConditioning, meta: { source: string }): VoiceFile {
  return {
    source: meta.source,
    audioFeatures: store(voice.audioFeatures),
    audioTokens: store(voice.audioTokens),
    speakerEmbeddings: store(voice.speakerEmbeddings),
    speakerFeatures: store(voice.speakerFeatures),
  };
}

function bytesOf(file: VoiceFile, name: keyof Omit<VoiceFile, "source">, width: number): { dims: number[]; buffer: ArrayBuffer } {
  const stored = file[name];
  if (!Array.isArray(stored?.dims) || typeof stored.base64 !== "string") throw new Error(`voice file: ${name} is missing`);
  const bytes = Buffer.from(stored.base64, "base64");
  const count = stored.dims.reduce((a, b) => a * b, 1);
  if (bytes.length !== count * width) {
    throw new Error(`voice file: ${name} has ${bytes.length} bytes; dims ${stored.dims.join("x")} need ${count * width}`);
  }
  return { dims: [...stored.dims], buffer: new Uint8Array(bytes).buffer };
}

export function decodeVoice(file: VoiceFile): VoiceConditioning {
  const float = (name: "audioFeatures" | "speakerEmbeddings" | "speakerFeatures"): FloatTensor => {
    const { dims, buffer } = bytesOf(file, name, 4);
    return { dims, data: new Float32Array(buffer) };
  };
  const { dims, buffer } = bytesOf(file, "audioTokens", 8);
  return {
    audioFeatures: float("audioFeatures"),
    audioTokens: { dims, data: new BigInt64Array(buffer) },
    speakerEmbeddings: float("speakerEmbeddings"),
    speakerFeatures: float("speakerFeatures"),
  };
}
