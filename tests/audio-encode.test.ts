import { describe, expect, it } from "vitest";
import { aacAudioSpecificConfig, chunkTicks, opusDOps, usToTicks } from "../src/render/audioEncode";
import { UnsupportedAudioCodecError } from "../src/render/video";

describe("aacAudioSpecificConfig", () => {
  it("is AAC-LC with the sample rate index and channel configuration", () => {
    expect(Buffer.from(aacAudioSpecificConfig(48_000, 1)).toString("hex")).toBe("1188");
    expect(Buffer.from(aacAudioSpecificConfig(44_100, 2)).toString("hex")).toBe("1210");
    expect(() => aacAudioSpecificConfig(12_345, 1)).toThrow(/sample rate/);
  });
});

describe("opusDOps", () => {
  it("falls back to the usual defaults without an OpusHead", () => {
    // version 0, 1 channel, pre-skip 312, 48000 Hz, gain 0, mapping family 0 (big-endian)
    expect(Buffer.from(opusDOps(48_000, 1)).toString("hex")).toBe(["00", "01", "0138", "0000bb80", "0000", "00"].join(""));
  });

  it("converts a little-endian OpusHead to the big-endian dOps payload", () => {
    const head = Buffer.alloc(19);
    head.write("OpusHead", 0, "latin1");
    head[8] = 1; // version
    head[9] = 2; // channels
    head.writeUInt16LE(500, 10); // pre-skip
    head.writeUInt32LE(44_100, 12); // input sample rate
    head.writeInt16LE(-256, 16); // gain
    head[18] = 0;
    const dOps = Buffer.from(opusDOps(48_000, 1, head));
    expect(dOps.readUInt8(0)).toBe(0);
    expect(dOps.readUInt8(1)).toBe(2);
    expect(dOps.readUInt16BE(2)).toBe(500);
    expect(dOps.readUInt32BE(4)).toBe(44_100);
    expect(dOps.readInt16BE(8)).toBe(-256);
    expect(dOps.readUInt8(10)).toBe(0);
  });

  it("rejects channel mapping families it does not write", () => {
    const head = Buffer.alloc(19);
    head.write("OpusHead", 0, "latin1");
    head[18] = 1;
    expect(() => opusDOps(48_000, 6, head)).toThrow(/mapping/);
  });
});

describe("chunkTicks", () => {
  it("makes the samples tile the timeline, whatever microsecond rounding does", () => {
    const frame = (1024 * 1_000_000) / 48_000; // 21333.33 us
    const chunks = Array.from({ length: 6 }, (_, i) => ({ timestampUs: Math.round(i * frame), durationUs: Math.round(frame) }));
    expect(chunkTicks(chunks, 48_000)).toEqual([1024, 1024, 1024, 1024, 1024, 1024]);
    expect(usToTicks(20_000, 48_000)).toBe(960);
  });

  it("gives the last chunk its own duration", () => {
    expect(chunkTicks([{ timestampUs: 0, durationUs: 20_000 }], 48_000)).toEqual([960]);
  });
});

describe("UnsupportedAudioCodecError", () => {
  it("names the browser and what was tried", () => {
    const error = new UnsupportedAudioCodecError("Microsoft Edge 120.0", ["mp4a.40.2", "opus"]);
    expect(error.message).toMatch(/^Microsoft Edge 120\.0 cannot encode AAC or Opus audio/);
    expect(error.message).toContain("mp4a.40.2, opus");
  });
});
