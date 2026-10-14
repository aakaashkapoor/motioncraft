import { describe, expect, it } from "vitest";
import { pickToken, TURBO_SAMPLING } from "../src/narration/sampling";

const greedy = { ...TURBO_SAMPLING, temperature: 0 };

describe("pickToken", () => {
  it("is greedy at temperature 0, after the repetition penalty", () => {
    // Token 0 leads (2.0) but was said before: 2.0 / 1.2 < 1.9.
    expect(pickToken(Float32Array.of(2.0, 1.9, -1), [0], 0.5, greedy)).toBe(1);
    expect(pickToken(Float32Array.of(2.0, 1.9, -1), [], 0.5, greedy)).toBe(0);
  });

  it("penalizes a negative logit by multiplying it", () => {
    expect(pickToken(Float32Array.of(-1, -1.1), [0], 0.5, greedy)).toBe(1);
  });

  it("penalizes a token once however often it was said", () => {
    expect(pickToken(Float32Array.of(2.0, 1.6), [0, 0, 0], 0.5, greedy)).toBe(0);
  });

  it("keeps only the top-p nucleus", () => {
    // After softmax token 0 holds about 0.99 of the mass, so the nucleus is token 0 alone.
    for (const u of [0, 0.5, 0.999]) expect(pickToken(Float32Array.of(10, 6, 5), [], u, TURBO_SAMPLING)).toBe(0);
  });

  it("draws by cumulative probability inside the nucleus", () => {
    const uniform = Float32Array.of(1, 1, 1, 1);
    const options = { ...TURBO_SAMPLING, temperature: 1 };
    expect(pickToken(uniform, [], 0.1, options)).toBe(0);
    expect(pickToken(uniform, [], 0.6, options)).toBe(2);
    expect(pickToken(uniform, [], 0.99, options)).toBe(3);
  });

  it("keeps only the top k", () => {
    expect(pickToken(Float32Array.of(1, 3, 2), [], 0.99, { ...TURBO_SAMPLING, topK: 1 })).toBe(1);
  });
});
