import { describe, expect, it } from "vitest";
import { ASPECTS, fontScale, fontSize, frameSize, neutralTheme, safeArea, type Aspect } from "../src/index";

describe("frameSize", () => {
  it("is 1080x1920 for 9:16", () => {
    expect(frameSize("9:16")).toEqual({ width: 1080, height: 1920 });
  });

  it("is 1920x1080 for 16:9", () => {
    expect(frameSize("16:9")).toEqual({ width: 1920, height: 1080 });
  });
});

describe("safeArea", () => {
  it.each(ASPECTS)("stays inside the frame for %s", (aspect: Aspect) => {
    const { width, height } = frameSize(aspect);
    const safe = safeArea(aspect);
    expect(safe.x).toBeGreaterThan(0);
    expect(safe.y).toBeGreaterThan(0);
    expect(safe.width).toBeGreaterThan(0);
    expect(safe.height).toBeGreaterThan(0);
    expect(safe.x + safe.width).toBeLessThan(width);
    expect(safe.y + safe.height).toBeLessThan(height);
  });

  it("keeps clear of the right 12%, bottom 18% and a top margin in 9:16", () => {
    const { width, height } = frameSize("9:16");
    const safe = safeArea("9:16");
    expect(safe.x + safe.width).toBeLessThanOrEqual(width * 0.88);
    expect(safe.y + safe.height).toBeLessThanOrEqual(height * 0.82);
    expect(safe.y).toBeGreaterThan(0);
  });

  it("uses a uniform 5% margin in 16:9", () => {
    const { width, height } = frameSize("16:9");
    const safe = safeArea("16:9");
    expect(safe.x).toBeGreaterThanOrEqual(width * 0.05);
    expect(safe.y).toBeGreaterThanOrEqual(height * 0.05);
    expect(width - (safe.x + safe.width)).toBeGreaterThanOrEqual(width * 0.05);
    expect(height - (safe.y + safe.height)).toBeGreaterThanOrEqual(height * 0.05);
    expect(safe).toEqual({ x: 96, y: 54, width: 1728, height: 972 });
  });
});

describe("fontScale", () => {
  it("is 1 for the primary 9:16 format", () => {
    expect(fontScale("9:16")).toBe(1);
  });

  it("is positive for every aspect", () => {
    for (const aspect of ASPECTS) expect(fontScale(aspect)).toBeGreaterThan(0);
  });

  it("keeps body text readable relative to frame height in both shapes", () => {
    for (const aspect of ASPECTS) {
      const { height } = frameSize(aspect);
      // Body text at least ~2.5% of frame height: legible on a phone held either way.
      expect(fontSize(neutralTheme, "body", aspect) / height).toBeGreaterThanOrEqual(0.025);
    }
  });

  it("applies the scale to the theme's type scale", () => {
    expect(fontSize(neutralTheme, "title", "16:9")).toBe(
      Math.round(neutralTheme.typeScale.title * fontScale("16:9")),
    );
  });
});
