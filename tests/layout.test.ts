import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  captionBand,
  captionBandHeight,
  charsPerLine,
  contentArea,
  estimateLines,
  estimateTextHeight,
  fontSize,
  frameSize,
  neutralTheme,
  safeArea,
  type Aspect,
} from "../src/index";

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

  it("keeps clear of the platform UI at the top and bottom in 9:16, symmetric left and right", () => {
    const { width, height } = frameSize("9:16");
    const safe = safeArea("9:16");
    expect(safe.y).toBeGreaterThanOrEqual(240);
    expect(height - (safe.y + safe.height)).toBeGreaterThanOrEqual(480);
    expect(safe.x).toBe(width - (safe.x + safe.width));
  });

  it("uses 96 px sides and 64 px top and bottom in 16:9", () => {
    expect(safeArea("16:9")).toEqual({ x: 96, y: 64, width: 1728, height: 952 });
  });
});

describe("type sizes", () => {
  it("keeps body text readable relative to frame height in both shapes", () => {
    for (const aspect of ASPECTS) {
      const { height } = frameSize(aspect);
      // Body text at least ~2.5% of frame height: legible on a phone held either way.
      expect(fontSize(neutralTheme, "body", aspect) / height).toBeGreaterThanOrEqual(0.025);
    }
  });

  it("reads each aspect's size straight from the ramp, with no scaling", () => {
    expect(fontSize(neutralTheme, "title", "16:9")).toBe(neutralTheme.type.title["16:9"].size);
    expect(fontSize(neutralTheme, "title", "9:16")).toBe(neutralTheme.type.title["9:16"].size);
  });

  it("never sets 16:9 text below 0.9x of 9:16: a 16:9 video plays smaller on a phone", () => {
    for (const role of ["display", "title", "body", "label"] as const) {
      expect(fontSize(neutralTheme, role, "16:9")).toBeGreaterThanOrEqual(0.9 * fontSize(neutralTheme, role, "9:16"));
    }
  });
});

describe("text fit estimate", () => {
  it("counts characters per line from font size and width", () => {
    expect(charsPerLine(600, 100)).toBe(10);
    expect(charsPerLine(10, 100)).toBe(1);
  });

  it("wraps on word boundaries", () => {
    // 10 chars per line.
    expect(estimateLines("", 600, 100)).toBe(0);
    expect(estimateLines("short", 600, 100)).toBe(1);
    expect(estimateLines("aaaa bbbbb", 600, 100)).toBe(1);
    expect(estimateLines("aaaa bbbbbb", 600, 100)).toBe(2);
    expect(estimateLines("aaa bbb ccc ddd", 600, 100)).toBe(2);
  });

  it("breaks words longer than a line", () => {
    expect(estimateLines("a".repeat(25), 600, 100)).toBe(3);
    expect(estimateLines(`aa ${"b".repeat(25)} cc`, 600, 100)).toBe(4);
  });

  it("estimates height from lines and line height", () => {
    expect(estimateTextHeight("aaa bbb ccc ddd", 600, { size: 100, lineHeight: 1.2 })).toBeCloseTo(240);
  });
});

describe("caption band", () => {
  it.each(ASPECTS)("sits low in the safe area, with content above it (%s)", (aspect: Aspect) => {
    const safe = safeArea(aspect);
    const band = captionBand(neutralTheme, aspect);
    expect(band.height).toBe(captionBandHeight(neutralTheme, aspect));
    expect(band.y + band.height).toBeLessThanOrEqual(safe.y + safe.height);
    expect(band.y).toBeGreaterThan(safe.y + safe.height / 2);
    const content = contentArea(neutralTheme, aspect);
    expect(content.y).toBe(safe.y);
    expect(content.y + content.height).toBeLessThan(band.y);
  });
});
