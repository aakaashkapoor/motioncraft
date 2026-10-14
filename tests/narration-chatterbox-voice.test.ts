import { describe, expect, it } from "vitest";
import { decodeVoice, encodeVoice, type VoiceConditioning } from "../src/narration/chatterboxVoice";

const voice: VoiceConditioning = {
  audioFeatures: { dims: [1, 2, 2], data: Float32Array.of(1, 2, 3, 4) },
  audioTokens: { dims: [1, 3], data: BigInt64Array.of(7n, 8n, 6561n) },
  speakerEmbeddings: { dims: [1, 2], data: Float32Array.of(0.5, -0.5) },
  speakerFeatures: { dims: [1, 1, 2], data: Float32Array.of(9, 10) },
};

describe("the Chatterbox voice file", () => {
  it("round-trips through JSON", () => {
    const file = encodeVoice(voice, { source: "test" });
    expect(file.source).toBe("test");
    expect(decodeVoice(JSON.parse(JSON.stringify(file)))).toEqual(voice);
  });

  it("names a tensor whose data does not fill its dims", () => {
    const file = encodeVoice(voice, { source: "test" });
    file.audioFeatures.dims = [1, 3, 2];
    expect(() => decodeVoice(file)).toThrow(/audioFeatures/);
  });

  it("rejects a file that is not a voice", () => {
    expect(() => decodeVoice({ source: "x" } as never)).toThrow(/voice file/);
  });
});
