import { describe, expect, it } from "vitest";
import {
  Easing,
  drawPath,
  easeInOutCubic,
  expoIn,
  expoOut,
  interpolate,
  interpolateColors,
  measureSpring,
  noise2D,
  random,
  spring,
  springPresets,
  stagger,
} from "../src/index";

const FPS = 30;
const frames = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("spring", () => {
  it("starts at `from` and settles to `to`", () => {
    expect(spring({ frame: 0, fps: FPS })).toBe(0);
    expect(spring({ frame: 300, fps: FPS })).toBeCloseTo(1, 4);
    expect(spring({ frame: 0, fps: FPS, from: 10, to: 20 })).toBe(10);
    expect(spring({ frame: 600, fps: FPS, from: 10, to: 20 })).toBeCloseTo(20, 3);
  });

  it("bounces past the target with the default config", () => {
    const peak = Math.max(...frames(60).map((frame) => spring({ frame, fps: FPS })));
    expect(peak).toBeGreaterThan(1.1);
  });

  it("never overshoots with the smooth preset", () => {
    const values = frames(600).map((frame) => spring({ frame, fps: FPS, config: "smooth" }));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeLessThanOrEqual(1);
      expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!);
    }
    expect(values.at(-1)!).toBeCloseTo(1, 2);
  });

  it("accepts a preset object and partial config", () => {
    expect(springPresets.smooth.damping).toBe(200);
    expect(springPresets.snappy).toMatchObject({ damping: 20, stiffness: 200 });
    expect(springPresets.gentle).toMatchObject({ damping: 30, stiffness: 60 });
    expect(springPresets.bouncy.damping).toBe(8);
    const named = spring({ frame: 5, fps: FPS, config: "snappy" });
    const object = spring({ frame: 5, fps: FPS, config: springPresets.snappy });
    expect(named).toBe(object);
  });

  it("clamps overshoot when overshootClamping is set", () => {
    const values = frames(120).map((frame) =>
      spring({ frame, fps: FPS, config: { damping: 5, overshootClamping: true } }),
    );
    expect(Math.max(...values)).toBe(1);
  });

  it("lands exactly on `to` at the end of durationInFrames", () => {
    for (const config of ["smooth", "bouncy", "gentle"] as const) {
      const at = (frame: number) => spring({ frame, fps: FPS, config, durationInFrames: 20, from: 3, to: 7 });
      expect(at(0)).toBe(3);
      expect(at(20)).toBe(7);
      expect(at(40)).toBe(7);
      expect(at(10)).not.toBe(7);
    }
  });

  it("stretches the natural curve to durationInFrames", () => {
    const natural = measureSpring({ fps: FPS });
    const half = spring({ frame: natural / 2, fps: FPS });
    expect(spring({ frame: 10, fps: FPS, durationInFrames: 20 })).toBeCloseTo(half, 6);
  });

  it("holds at `from` until the delay has passed", () => {
    expect(spring({ frame: 5, fps: FPS, delay: 10 })).toBe(0);
    expect(spring({ frame: 15, fps: FPS, delay: 10 })).toBe(spring({ frame: 5, fps: FPS }));
  });

  it("rejects invalid input", () => {
    expect(() => spring({ frame: 0, fps: 0 })).toThrow(/fps/);
    expect(() => spring({ frame: 0, fps: FPS, config: { mass: 0 } })).toThrow(/mass/);
    expect(() => spring({ frame: 0, fps: FPS, config: { stiffness: -1 } })).toThrow(/stiffness/);
    expect(() => spring({ frame: Number.NaN, fps: FPS })).toThrow(/frame/);
    expect(() => spring({ frame: 0, fps: FPS, durationInFrames: 0 })).toThrow(/durationInFrames/);
  });

  it("keeps the v1 easing-factory form", () => {
    const ease = spring({ damping: 12, frequency: 3 });
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });
});

describe("measureSpring", () => {
  it("counts frames until the spring stays within 0.005 of the target", () => {
    for (const config of ["smooth", "snappy", "gentle", "bouncy"] as const) {
      const n = measureSpring({ fps: FPS, config });
      expect(Number.isInteger(n)).toBe(true);
      expect(Math.abs(1 - spring({ frame: n - 1, fps: FPS, config }))).toBeGreaterThanOrEqual(0.005);
      for (const frame of frames(200)) {
        expect(Math.abs(1 - spring({ frame: n + frame, fps: FPS, config }))).toBeLessThan(0.005);
      }
    }
  });

  it("settles stiffer springs sooner", () => {
    expect(measureSpring({ fps: FPS, config: "snappy" })).toBeLessThan(measureSpring({ fps: FPS, config: "gentle" }));
  });

  it("rejects an undamped spring", () => {
    expect(() => measureSpring({ fps: FPS, config: { damping: 0 } })).toThrow(/damping/);
  });
});

describe("easing curves", () => {
  it("bezier matches known CSS curves", () => {
    const ease = Easing.bezier(0.25, 0.1, 0.25, 1); // CSS `ease`
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.8024, 3);
    expect(ease(0.25)).toBeCloseTo(0.4085, 3);
    const linearish = Easing.bezier(0.3, 0.3, 0.7, 0.7);
    expect(linearish(0.37)).toBeCloseTo(0.37, 6);
    const easeInOut = Easing.bezier(0.42, 0, 0.58, 1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
    expect(easeInOut(0.25)).toBeCloseTo(0.1291, 3);
  });

  it("bezier rejects x control points outside 0..1", () => {
    expect(() => Easing.bezier(-0.1, 0, 1, 1)).toThrow(/x1/);
    expect(() => Easing.bezier(0, 0, 1.5, 1)).toThrow(/x2/);
  });

  it("expoOut and expoIn follow 2^(-10t) and its mirror", () => {
    expect(expoOut(0)).toBe(0);
    expect(expoOut(1)).toBe(1);
    expect(expoOut(0.5)).toBeCloseTo(1 - 2 ** -5, 10);
    expect(expoIn(0)).toBe(0);
    expect(expoIn(1)).toBe(1);
    expect(expoIn(0.3)).toBeCloseTo(1 - expoOut(0.7), 10);
    expect(Easing.expoOut).toBe(expoOut);
  });
});

describe("interpolate v2", () => {
  it("interpolates across multiple keyframes", () => {
    const at = (v: number) => interpolate(v, [0, 10, 30], [0, 100, 0]);
    expect(at(5)).toBe(50);
    expect(at(10)).toBe(100);
    expect(at(20)).toBe(50);
    expect(at(30)).toBe(0);
  });

  it("applies one easing per segment", () => {
    const square = (t: number) => t * t;
    const at = (v: number) => interpolate(v, [0, 1, 2], [0, 10, 20], { easing: [square, (t) => t] });
    expect(at(0.5)).toBe(2.5);
    expect(at(1.5)).toBe(15);
  });

  it("supports clamp, extend and identity extrapolation per side", () => {
    expect(interpolate(-5, [0, 10], [0, 100])).toBe(0);
    expect(interpolate(15, [0, 10], [0, 100], { extrapolateRight: "extend" })).toBe(150);
    expect(interpolate(-5, [0, 10], [0, 100], { extrapolateLeft: "extend" })).toBe(-50);
    expect(interpolate(-5, [0, 10], [0, 100], { extrapolateLeft: "identity" })).toBe(-5);
    expect(interpolate(15, [0, 10], [0, 100], { extrapolateRight: "identity" })).toBe(15);
    expect(interpolate(15, [0, 10, 20], [0, 100, 0], { extrapolateRight: "extend" })).toBe(50);
    expect(interpolate(-5, [0, 10, 20], [0, 100, 0], { extrapolateLeft: "extend" })).toBe(-50);
    // clamp: false keeps meaning "extend both sides".
    expect(interpolate(15, [0, 10], [0, 100], { clamp: false })).toBe(150);
  });

  it("handles a decreasing input range with several keyframes", () => {
    expect(interpolate(15, [20, 10, 0], [0, 1, 2])).toBe(0.5);
    expect(interpolate(5, [20, 10, 0], [0, 1, 2])).toBe(1.5);
  });

  it("validates keyframes", () => {
    expect(() => interpolate(0, [0], [0])).toThrow(/two/);
    expect(() => interpolate(0, [0, 1], [0, 1, 2])).toThrow(/same length/);
    expect(() => interpolate(0, [0, 2, 1], [0, 1, 2])).toThrow(/monotonic/);
    expect(() => interpolate(0, [0, 1, 2], [0, 1, 2], { easing: [easeInOutCubic] })).toThrow(/easing/);
  });
});

describe("interpolateColors", () => {
  it("returns the keyframe colors at the keyframes", () => {
    expect(interpolateColors(0, [0, 1], ["#ff0000", "#0000ff"])).toBe("rgb(255, 0, 0)");
    expect(interpolateColors(1, [0, 1], ["#ff0000", "rgb(0, 0, 255)"])).toBe("rgb(0, 0, 255)");
    expect(interpolateColors(2, [0, 1], ["#f00", "#00f"])).toBe("rgb(0, 0, 255)");
  });

  it("mixes in linear-light RGB", () => {
    // Halfway between black and white in linear light is sRGB 188, not 128.
    expect(interpolateColors(0.5, [0, 1], ["#000000", "#ffffff"])).toBe("rgb(188, 188, 188)");
    expect(interpolateColors(0.5, [0, 1], ["#ff0000", "#00ff00"])).toBe("rgb(188, 188, 0)");
  });

  it("interpolates alpha", () => {
    expect(interpolateColors(0.5, [0, 1], ["rgba(0, 0, 0, 0)", "#000000"])).toBe("rgba(0, 0, 0, 0.5)");
    expect(interpolateColors(0, [0, 1], ["#ffffff80", "#fff"])).toBe("rgba(255, 255, 255, 0.502)");
  });

  it("supports several keyframes", () => {
    expect(interpolateColors(1.5, [0, 1, 2], ["#000", "#fff", "#fff"])).toBe("rgb(255, 255, 255)");
  });

  it("rejects colors it cannot parse", () => {
    expect(() => interpolateColors(0, [0, 1], ["red", "#fff"])).toThrow(/color/);
  });
});

describe("stagger", () => {
  it("offsets each item by step from start", () => {
    expect(stagger(0, { start: 10, step: 4 })).toBe(10);
    expect(stagger(3, { start: 10, step: 4 })).toBe(22);
    expect(stagger(2, { step: 5 })).toBe(10);
  });

  it("rejects a negative or fractional index", () => {
    expect(() => stagger(-1, { step: 1 })).toThrow(/index/);
    expect(() => stagger(1.5, { step: 1 })).toThrow(/index/);
  });
});

describe("drawPath", () => {
  it("hides the path at 0, half-draws at 0.5, and shows it at 1", () => {
    expect(drawPath(0, 200)).toEqual({ strokeDasharray: "200 200", strokeDashoffset: 200 });
    expect(drawPath(0.5, 200)).toEqual({ strokeDasharray: "200 200", strokeDashoffset: 100 });
    expect(drawPath(1, 200)).toEqual({ strokeDasharray: "200 200", strokeDashoffset: 0 });
  });

  it("clamps progress to 0..1", () => {
    expect(drawPath(-1, 50).strokeDashoffset).toBe(50);
    expect(drawPath(2, 50).strokeDashoffset).toBe(0);
  });

  it("rejects a negative length", () => {
    expect(() => drawPath(0.5, -1)).toThrow(/length/);
  });
});

describe("random and noise", () => {
  it("random is deterministic and in [0, 1)", () => {
    expect(random(42)).toBe(random(42));
    expect(random("title")).toBe(random("title"));
    expect(random(1)).not.toBe(random(2));
    const values = frames(2000).map((i) => random(i));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it("noise2D is deterministic, smooth, and in [-1, 1]", () => {
    expect(noise2D(7, 1.3, 2.7)).toBe(noise2D(7, 1.3, 2.7));
    expect(noise2D(7, 1.3, 2.7)).not.toBe(noise2D(8, 1.3, 2.7));
    let spread = 0;
    for (let i = 0; i < 2000; i++) {
      const x = i * 0.137;
      const y = i * 0.071;
      const v = noise2D("seed", x, y);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(noise2D("seed", x + 0.001, y) - v)).toBeLessThan(0.01);
      spread = Math.max(spread, Math.abs(v));
    }
    expect(spread).toBeGreaterThan(0.3);
  });

  it("noise2D is zero on integer lattice points", () => {
    expect(noise2D(3, 4, 5)).toBe(0);
  });
});
