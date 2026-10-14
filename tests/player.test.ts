import { describe, expect, it } from "vitest";
import { fitFrame, frameAtMs, parseHostMessage, playbackFrame, playStartMs } from "../src/render/player";

describe("fitFrame", () => {
  it("scales a wide frame to fit a wider window, centered horizontally", () => {
    expect(fitFrame({ width: 1920, height: 1080 }, { width: 1000, height: 270 })).toEqual({ scale: 0.25, x: 260, y: 0 });
  });

  it("scales a tall frame to fit a wide window, letterboxed left and right", () => {
    expect(fitFrame({ width: 1080, height: 1920 }, { width: 1920, height: 960 })).toEqual({ scale: 0.5, x: 690, y: 0 });
  });

  it("letterboxes top and bottom when the window is taller", () => {
    expect(fitFrame({ width: 1920, height: 1080 }, { width: 960, height: 1000 })).toEqual({ scale: 0.5, x: 0, y: 230 });
  });

  it("never scales to zero or below", () => {
    expect(fitFrame({ width: 1920, height: 1080 }, { width: 0, height: 0 }).scale).toBeGreaterThan(0);
  });
});

describe("parseHostMessage", () => {
  it("reads seek, play and pause", () => {
    expect(parseHostMessage({ type: "motioncraft:seek", ms: 1200 })).toEqual({ type: "motioncraft:seek", ms: 1200 });
    expect(parseHostMessage({ type: "motioncraft:play" })).toEqual({ type: "motioncraft:play", loop: false });
    expect(parseHostMessage({ type: "motioncraft:play", loop: true, fromMs: 500 })).toEqual({ type: "motioncraft:play", loop: true, fromMs: 500 });
    expect(parseHostMessage({ type: "motioncraft:pause" })).toEqual({ type: "motioncraft:pause" });
  });

  it("accepts objects without a prototype", () => {
    const data = Object.assign(Object.create(null) as object, { type: "motioncraft:pause" });
    expect(parseHostMessage(data)).toEqual({ type: "motioncraft:pause" });
  });

  it("ignores anything that is not a plain object with a known string type", () => {
    for (const data of [null, undefined, "motioncraft:pause", 3, ["motioncraft:pause"], { type: 1 }, { type: "motioncraft:ready" }, { type: "other" }, new Date(0)]) {
      expect(parseHostMessage(data)).toBeUndefined();
    }
    class Message {
      type = "motioncraft:pause";
    }
    expect(parseHostMessage(new Message())).toBeUndefined();
  });

  it("ignores a seek without a finite ms and a play with bad options", () => {
    expect(parseHostMessage({ type: "motioncraft:seek" })).toBeUndefined();
    expect(parseHostMessage({ type: "motioncraft:seek", ms: "10" })).toBeUndefined();
    expect(parseHostMessage({ type: "motioncraft:seek", ms: Number.NaN })).toBeUndefined();
    expect(parseHostMessage({ type: "motioncraft:play", loop: "yes" })).toBeUndefined();
    expect(parseHostMessage({ type: "motioncraft:play", fromMs: Infinity })).toBeUndefined();
  });
});

describe("frameAtMs", () => {
  it("maps ms to the frame on screen at that time, clamped to the timeline", () => {
    expect(frameAtMs(0, 30, 90)).toBe(0);
    expect(frameAtMs(1000, 30, 90)).toBe(30);
    expect(frameAtMs(1049, 30, 90)).toBe(31);
    expect(frameAtMs(-50, 30, 90)).toBe(0);
    expect(frameAtMs(10_000, 30, 90)).toBe(89);
  });
});

describe("playbackFrame", () => {
  const timing = { fps: 30, totalFrames: 90 };

  it("advances with elapsed time from the start position", () => {
    expect(playbackFrame(0, { ...timing, fromMs: 0, loop: false })).toEqual({ frame: 0, ended: false });
    expect(playbackFrame(500, { ...timing, fromMs: 1000, loop: false })).toEqual({ frame: 45, ended: false });
  });

  it("stops on the last frame without loop", () => {
    expect(playbackFrame(3000, { ...timing, fromMs: 0, loop: false })).toEqual({ frame: 89, ended: true });
  });

  it("wraps around with loop", () => {
    expect(playbackFrame(3500, { ...timing, fromMs: 0, loop: true })).toEqual({ frame: 15, ended: false });
  });
});

describe("playStartMs", () => {
  it("uses fromMs when given, clamped to the timeline", () => {
    expect(playStartMs(700, 10, { fps: 30, totalFrames: 90 })).toBe(700);
    expect(playStartMs(-5, 10, { fps: 30, totalFrames: 90 })).toBe(0);
    expect(playStartMs(99_999, 10, { fps: 30, totalFrames: 90 })).toBe(3000);
  });

  it("resumes from the frame on screen, or restarts from the last frame", () => {
    expect(playStartMs(undefined, 45, { fps: 30, totalFrames: 90 })).toBe(1500);
    expect(playStartMs(undefined, 89, { fps: 30, totalFrames: 90 })).toBe(0);
  });
});
