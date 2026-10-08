import { describe, expect, it } from "vitest";
import { contrastRatio, neutralTheme, relativeLuminance } from "../src/index";

describe("WCAG contrast", () => {
  it("computes luminance of black and white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
  });

  it("gives 21:1 for black on white, in either order", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 10);
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 10);
  });

  it("matches a known reference value", () => {
    // #777777 on white is the classic 4.48:1 example.
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("rejects colors that are not hex", () => {
    expect(() => relativeLuminance("red")).toThrow();
  });
});

describe("neutralTheme", () => {
  const { colors } = neutralTheme;

  it("has a dark background and light text", () => {
    expect(relativeLuminance(colors.background)).toBeLessThan(0.05);
    expect(relativeLuminance(colors.text)).toBeGreaterThan(0.8);
  });

  it("has text-vs-background contrast of at least 7:1", () => {
    expect(contrastRatio(colors.text, colors.background)).toBeGreaterThanOrEqual(7);
  });

  it("has text-vs-surface contrast of at least 7:1", () => {
    expect(contrastRatio(colors.text, colors.surface)).toBeGreaterThanOrEqual(7);
  });

  it("keeps muted text and accents legible on the background (4.5:1)", () => {
    expect(contrastRatio(colors.muted, colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.accent, colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.accentAlt, colors.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("uses font-family stacks with a generic fallback", () => {
    expect(neutralTheme.fonts.display).toMatch(/sans-serif$/);
    expect(neutralTheme.fonts.body).toMatch(/sans-serif$/);
    expect(neutralTheme.fonts.mono).toMatch(/monospace$/);
  });

  it("has increasing type and spacing scales", () => {
    const t = neutralTheme.typeScale;
    expect([t.caption, t.body, t.subtitle, t.title, t.display]).toEqual(
      [t.caption, t.body, t.subtitle, t.title, t.display].slice().sort((a, b) => a - b),
    );
    const s = neutralTheme.spacing;
    expect([s.xs, s.sm, s.md, s.lg, s.xl]).toEqual([s.xs, s.sm, s.md, s.lg, s.xl].slice().sort((a, b) => a - b));
  });

  it("has sensible motion defaults", () => {
    expect(neutralTheme.motion.easing.length).toBeGreaterThan(0);
    expect(neutralTheme.motion.sceneEnterMs).toBeGreaterThan(0);
    expect(neutralTheme.motion.sceneExitMs).toBeGreaterThan(0);
  });
});
