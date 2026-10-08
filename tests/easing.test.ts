import { describe, expect, it } from "vitest";
import { easeInOutCubic, easeOutBack, easeSpring, interpolate, linear, spring, type Easing } from "../src/index";

const EASINGS: [string, Easing][] = [
  ["linear", linear],
  ["easeInOutCubic", easeInOutCubic],
  ["easeOutBack", easeOutBack],
  ["easeSpring", easeSpring],
  ["spring (stiff)", spring({ damping: 12, frequency: 3 })],
];

describe("easings", () => {
  it.each(EASINGS)("%s returns 0 at 0 and 1 at 1", (_name, ease) => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it("linear is the identity", () => {
    expect(linear(0.25)).toBe(0.25);
  });

  it("easeInOutCubic is symmetric around the midpoint", () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(0.25)).toBeCloseTo(1 - easeInOutCubic(0.75));
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
  });

  it("easeOutBack overshoots past 1 before settling", () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100)));
    expect(peak).toBeGreaterThan(1);
  });

  it("easeSpring overshoots and settles", () => {
    const values = Array.from({ length: 101 }, (_, i) => easeSpring(i / 100));
    expect(Math.max(...values)).toBeGreaterThan(1);
    expect(values[95]).toBeCloseTo(1, 1);
  });

  it("spring rejects invalid options", () => {
    expect(() => spring({ damping: -1 })).toThrow(/damping/);
    expect(() => spring({ frequency: 0 })).toThrow(/frequency/);
  });
});

describe("interpolate", () => {
  it("maps linearly between ranges", () => {
    expect(interpolate(0.5, [0, 1], [0, 100])).toBe(50);
    expect(interpolate(15, [10, 20], [100, 200])).toBe(150);
    expect(interpolate(0.25, [0, 1], [1, 0])).toBe(0.75);
  });

  it("clamps by default", () => {
    expect(interpolate(-1, [0, 1], [0, 100])).toBe(0);
    expect(interpolate(2, [0, 1], [0, 100])).toBe(100);
  });

  it("extrapolates when clamp is false", () => {
    expect(interpolate(2, [0, 1], [0, 100], { clamp: false })).toBe(200);
    expect(interpolate(-0.5, [0, 1], [0, 100], { clamp: false })).toBe(-50);
  });

  it("applies the easing to the normalized input", () => {
    expect(interpolate(0.5, [0, 1], [0, 100], { easing: (t) => t * t })).toBe(25);
    expect(interpolate(0.25, [0, 0.5], [0, 10], { easing: easeInOutCubic })).toBeCloseTo(5);
  });

  it("supports a reversed input range", () => {
    expect(interpolate(0.75, [1, 0], [0, 100])).toBe(25);
  });

  it("throws on an empty input range", () => {
    expect(() => interpolate(0.5, [1, 1], [0, 1])).toThrow(/input range/);
  });

  it("throws on non-finite input", () => {
    expect(() => interpolate(Number.NaN, [0, 1], [0, 1])).toThrow(/finite/);
  });
});
