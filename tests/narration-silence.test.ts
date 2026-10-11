import { describe, expect, it } from "vitest";
import { trimSilence } from "../src/narration/silence";

const RATE = 1000; // 1 sample per ms keeps the arithmetic obvious

function signal(lead: number, tone: number, tail: number): Float32Array {
  const out = new Float32Array(lead + tone + tail);
  out.fill(0.5, lead, lead + tone);
  return out;
}

describe("trimSilence", () => {
  it("drops leading and trailing silence, keeping 30 ms before and 60 ms after the speech", () => {
    const { samples: trimmed, leadSamples, tailSamples, startSample } = trimSilence(signal(300, 1000, 200), RATE);
    expect([leadSamples, tailSamples]).toEqual([30, 60]);
    expect(startSample).toBe(270); // where the kept samples begin in the original
    expect(trimmed).toHaveLength(30 + 1000 + 60);
    expect(trimmed[29]).toBe(0);
    expect(trimmed[30]).toBe(0.5);
    expect(trimmed[1029]).toBe(0.5);
  });

  it("treats samples under 0.01 as silence", () => {
    const samples = signal(300, 100, 300);
    samples[10] = 0.009;
    samples[500] = -0.011; // just over the threshold counts as speech
    const trimmed = trimSilence(samples, RATE).samples;
    expect(trimmed).toHaveLength(561 - 270); // from 30 ms before sample 300 to 60 ms after sample 500
  });

  it("clamps the margins to the buffer", () => {
    const samples = signal(5, 100, 10);
    const clamped = trimSilence(samples, RATE);
    expect(clamped.samples).toHaveLength(115);
    expect([clamped.leadSamples, clamped.tailSamples]).toEqual([5, 10]);
  });

  it("leaves already-tight input unchanged", () => {
    const samples = signal(0, 100, 0);
    expect(Array.from(trimSilence(samples, RATE).samples)).toEqual(Array.from(samples));
  });

  it("returns nothing for all-silent input", () => {
    expect(trimSilence(new Float32Array(500), RATE)).toEqual({ samples: new Float32Array(0), leadSamples: 0, tailSamples: 0, startSample: 0 });
    expect(trimSilence(new Float32Array(0), RATE).samples).toHaveLength(0);
  });
});
