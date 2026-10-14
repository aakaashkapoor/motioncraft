import { describe, expect, it } from "vitest";
import {
  HARMONIES,
  PALETTE_BALANCE,
  derivePalette,
  harmonyAngles,
  hexToOklch,
  oklchToHex,
  oklchToRgb,
  parseHex,
  toHex,
} from "../src/theme/color";
import { checkThemeColors } from "../src/checks/storyboard";
import { validateStoryboard } from "../src/storyboard/validate";
import type { PaletteSpec, Storyboard } from "../src/storyboard/types";
import { AA_CONTRAST, contrastRatio, roleColorIssues } from "../src/theme/contrast";
import { darkTheme } from "../src/theme/dark";
import { lightTheme } from "../src/theme/light";
import { PALETTE_PRESETS, buildPalette, paletteSwatches } from "../src/theme/palettes";
import { resolveTheme } from "../src/theme/resolve";
import { PALETTE_ROLES, type Theme } from "../src/theme/types";

/** Signed-free hue difference `b - a`, wrapped to 0..360. */
const hueOffset = (a: number, b: number) => (((b - a) % 360) + 360) % 360;
/** Shortest angular distance between two hues. */
const hueDistance = (a: number, b: number) => {
  const d = hueOffset(a, b);
  return Math.min(d, 360 - d);
};

describe("OKLCH", () => {
  it("matches known values", () => {
    const white = hexToOklch("#ffffff");
    expect(white.l).toBeCloseTo(1, 3);
    expect(white.c).toBeCloseTo(0, 3);
    expect(white.h).toBe(0);
    expect(hexToOklch("#000000").l).toBeCloseTo(0, 6);
    const red = hexToOklch("#ff0000");
    expect(Math.abs(red.l - 0.628)).toBeLessThan(1e-3);
    expect(Math.abs(red.c - 0.2577)).toBeLessThan(1e-3);
    expect(Math.abs(red.h - 29.23)).toBeLessThan(1e-2);
    // Mid-tones catch a missing or wrong gamma step.
    const grey = hexToOklch("#808080");
    expect(Math.abs(grey.l - 0.5999)).toBeLessThan(1e-3);
    expect(grey.c).toBeCloseTo(0, 3);
    const navy = hexToOklch("#14213d");
    expect(Math.abs(navy.l - 0.2522)).toBeLessThan(1e-3);
    expect(Math.abs(navy.c - 0.0562)).toBeLessThan(1e-3);
    expect(Math.abs(navy.h - 264.0)).toBeLessThan(0.5);
  });

  it("round-trips sRGB within 1/255 and hex exactly", () => {
    for (let r = 0; r <= 255; r += 17)
      for (let g = 0; g <= 255; g += 17)
        for (let b = 0; b <= 255; b += 17) {
          const hex = toHex([r, g, b]);
          const o = hexToOklch(hex);
          const back = oklchToRgb(o);
          [r, g, b].forEach((c, i) => expect(Math.abs(back[i]! - c)).toBeLessThanOrEqual(1));
          expect(oklchToHex(o)).toBe(hex);
        }
  });

  it("gamut-maps out-of-sRGB colours by chroma, keeping lightness", () => {
    for (const o of [
      { l: 0.7, c: 0.4, h: 145 },
      { l: 0.5, c: 0.5, h: 270 },
      { l: 0.9, c: 0.3, h: 30 },
    ]) {
      const rgb = oklchToRgb(o);
      expect(rgb.some((c) => c < 0 || c > 255)).toBe(true);
      const hex = oklchToHex(o);
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      const back = hexToOklch(hex);
      expect(Math.abs(back.l - o.l)).toBeLessThan(0.01);
      expect(hueDistance(back.h, o.h)).toBeLessThan(3);
      expect(back.c).toBeLessThan(o.c);
    }
  });
});

describe("harmonies", () => {
  it("lists the harmonies with p1 at 0 degrees", () => {
    expect([...HARMONIES]).toEqual(["split", "analogous", "triad", "complement", "mono"]);
    expect(harmonyAngles("split")).toEqual([0, 150, 210]);
    expect(harmonyAngles("analogous")).toEqual([0, -30, 30]);
    expect(harmonyAngles("triad")).toEqual([0, 120, 240]);
    expect(harmonyAngles("complement")).toEqual([0, 180]);
    expect(harmonyAngles("mono")).toEqual([0, 0, 0]);
  });

  it("keeps p1 as the brand colour, normalised", () => {
    for (const h of HARMONIES) {
      expect(derivePalette("#E0562A", h)[0]).toBe("#e0562a");
      expect(derivePalette("#f00", h)[0]).toBe("#ff0000");
    }
  });

  it("rotates the hue by each harmony's angles", () => {
    for (const brand of ["#e0562a", "#14213d"])
      for (const h of HARMONIES) {
        const palette = derivePalette(brand, h);
        const angles = harmonyAngles(h);
        expect(palette).toHaveLength(angles.length);
        const h1 = hexToOklch(palette[0]!).h;
        palette.forEach((hex, i) => {
          const got = hueOffset(h1, hexToOklch(hex).h);
          expect(hueDistance(got, angles[i]!)).toBeLessThan(3);
        });
      }
  });

  it("balances a dark, low-chroma brand (#14213d) for every non-mono harmony", () => {
    for (const h of HARMONIES.filter((x) => x !== "mono")) {
      const palette = derivePalette("#14213d", h);
      const p1 = hexToOklch(palette[0]!);
      const swatches = palette.map(hexToOklch);
      for (const s of swatches) {
        expect(Math.abs(s.l - p1.l)).toBeLessThanOrEqual(PALETTE_BALANCE.maxDeltaL);
        expect(Math.abs(s.c - p1.c)).toBeLessThanOrEqual(PALETTE_BALANCE.maxDeltaC);
        expect(s.c).toBeGreaterThan(0.04); // still a colour, not grey
      }
      for (let i = 0; i < swatches.length; i++)
        for (let j = i + 1; j < swatches.length; j++)
          expect(hueDistance(swatches[i]!.h, swatches[j]!.h)).toBeGreaterThan(20);
      expect(new Set(palette).size).toBe(palette.length);
    }
  });

  it("balances vivid, pale and grey brands too", () => {
    for (const brand of ["#e0562a", "#ffe066", "#2a9d8f", "#808080", "#ffffff"])
      for (const h of HARMONIES.filter((x) => x !== "mono")) {
        const palette = derivePalette(brand, h);
        const p1 = hexToOklch(palette[0]!);
        for (const s of palette.map(hexToOklch)) {
          expect(Math.abs(s.l - p1.l)).toBeLessThanOrEqual(PALETTE_BALANCE.maxDeltaL);
          expect(Math.abs(s.c - p1.c)).toBeLessThanOrEqual(PALETTE_BALANCE.maxDeltaC);
        }
      }
  });

  it("keeps lightness in band at the edge of sRGB, where chroma is best effort", () => {
    for (const brand of ["#0000ff", "#ff0000"])
      for (const h of HARMONIES.filter((x) => x !== "mono")) {
        const [p1, ...rest] = derivePalette(brand, h).map(hexToOklch);
        for (const s of rest) {
          expect(Math.abs(s.l - p1!.l)).toBeLessThanOrEqual(PALETTE_BALANCE.maxDeltaL);
          expect(s.c).toBeGreaterThan(0.1);
        }
      }
  });

  it("mono keeps the hue and steps lightness", () => {
    const palette = derivePalette("#e0562a", "mono");
    const [p1, light, dark] = palette.map(hexToOklch);
    expect(light!.l).toBeGreaterThan(p1!.l + 0.05);
    expect(dark!.l).toBeLessThan(p1!.l - 0.05);
    for (const s of [light!, dark!]) {
      expect(hueDistance(s.h, p1!.h)).toBeLessThan(3);
      expect(Math.abs(s.c - p1!.c)).toBeLessThanOrEqual(PALETTE_BALANCE.maxDeltaC);
    }
    expect(parseHex(palette[1]!)).not.toEqual(parseHex(palette[2]!));
  });
});

describe("palettes", () => {
  const SCENES = [{ id: "a", component: "TitleCard", props: { title: "A" }, durationMs: 1000 }];
  const errorsOf = (input: Record<string, unknown>): string[] => {
    const result = validateStoryboard({ title: "T", aspect: "9:16", scenes: SCENES, ...input });
    return result.ok ? [] : result.errors;
  };
  const board = (input: Record<string, unknown> = {}): Storyboard => {
    const result = validateStoryboard({ title: "T", aspect: "9:16", scenes: SCENES, ...input });
    if (!result.ok) throw new Error(result.errors.join("\n"));
    return result.storyboard;
  };
  const BASES = ["light", "dark", "neutral"] as const;
  const swatchesOf = (theme: Theme) => paletteSwatches(theme.colors.palette!);
  const colorsOf = (theme: Theme) => swatchesOf(theme).map((s) => s.color);

  it("lists the roles and presets", () => {
    expect([...PALETTE_ROLES]).toEqual(["p1", "p2", "p3", "p4"]);
    expect([...PALETTE_PRESETS]).toEqual(["reel", "editorial", "pastel", "mono", "brand"]);
  });

  it("resolves every preset on every base theme with 2-4 swatches", () => {
    for (const base of BASES)
      for (const preset of PALETTE_PRESETS) {
        const swatches = swatchesOf(resolveTheme(board({ theme: base, palette: preset })));
        expect(swatches.length).toBeGreaterThanOrEqual(2);
        expect(swatches.length).toBeLessThanOrEqual(4);
        expect(swatches.map((s) => s.role)).toEqual(PALETTE_ROLES.slice(0, swatches.length));
      }
  });

  it("reel is orange, lime, indigo and cream on near-black", () => {
    const theme = resolveTheme(board({ palette: "reel" }));
    expect(colorsOf(theme)).toEqual(["#ff5a1f", "#c6f432", "#5b5bf0", "#f1ece2"]);
    expect(theme.colors.ground).toBe("#0e0e10");
  });

  it("every ink is the text or the ground and meets AA on its swatch", () => {
    const specs: PaletteSpec[] = [...PALETTE_PRESETS, ...HARMONIES.map((harmony) => ({ from: "#14213d", harmony }))];
    for (const base of BASES)
      for (const palette of specs) {
        const theme = resolveTheme(board({ theme: base, palette }));
        for (const s of swatchesOf(theme)) {
          expect(contrastRatio(s.ink, s.color), `${base} ${JSON.stringify(palette)} ${s.role}`).toBeGreaterThanOrEqual(AA_CONTRAST);
          expect([theme.colors.text, theme.colors.ground]).toContain(s.ink);
        }
      }
  });

  it("each preset's neutrals read: text and muted AA on ground and surface, subtle 3:1, roles pass", () => {
    for (const base of BASES)
      for (const preset of PALETTE_PRESETS) {
        const c = resolveTheme(board({ theme: base, palette: preset })).colors;
        for (const bg of [c.ground, c.surface]) {
          expect(contrastRatio(c.text, bg), `${base} ${preset} text`).toBeGreaterThanOrEqual(AA_CONTRAST);
          expect(contrastRatio(c.textMuted, bg), `${base} ${preset} textMuted`).toBeGreaterThanOrEqual(AA_CONTRAST);
        }
        // brand keeps the base theme's neutrals, whose subtle text is the theme's own business.
        if (preset !== "brand") expect(contrastRatio(c.textSubtle, c.ground), `${base} ${preset} textSubtle`).toBeGreaterThanOrEqual(3);
        expect(roleColorIssues(c)).toEqual([]);
      }
  });

  it("presets other than brand bring their own neutrals; brand keeps the base theme's", () => {
    for (const preset of ["reel", "editorial", "pastel", "mono"] as const) {
      expect(resolveTheme(board({ theme: "light", palette: preset })).colors.ground).toBe(resolveTheme(board({ theme: "dark", palette: preset })).colors.ground);
    }
    const brand = resolveTheme(board({ theme: "dark", palette: "brand" }));
    expect(brand.colors.ground).toBe(darkTheme.colors.ground);
    expect(brand.colors.text).toBe(darkTheme.colors.text);
  });

  it("mono is one hue at three lightnesses", () => {
    const [p1, p2, p3] = colorsOf(resolveTheme(board({ palette: "mono" }))).map(hexToOklch);
    expect(hueDistance(p1!.h, p2!.h)).toBeLessThan(3);
    expect(hueDistance(p1!.h, p3!.h)).toBeLessThan(3);
    expect(p2!.l).toBeGreaterThan(p1!.l);
    expect(p3!.l).toBeLessThan(p1!.l);
  });

  it("makes p1 the accent and onP1 its text", () => {
    for (const palette of [...PALETTE_PRESETS, { from: "#14213d", harmony: "triad" }] as PaletteSpec[]) {
      const c = resolveTheme(board({ palette })).colors;
      expect(c.accent).toBe(c.palette!.p1);
      expect(c.accentText).toBe(c.palette!.onP1);
    }
  });

  it("never throws on a black or white brand, and keeps 2+ distinct swatches with readable inks", () => {
    for (const base of BASES)
      for (const from of ["#000000", "#ffffff"])
        for (const palette of [...HARMONIES.map((harmony) => ({ from, harmony })), "brand"] as PaletteSpec[]) {
          const theme = resolveTheme(board({ theme: base, palette, accent: palette === "brand" ? from : undefined }));
          const colors = colorsOf(theme);
          const label = `${base} ${from} ${JSON.stringify(palette)}`;
          expect(colors.length, label).toBeGreaterThanOrEqual(2);
          expect(new Set(colors).size, label).toBe(colors.length);
          for (const s of swatchesOf(theme)) expect(contrastRatio(s.ink, s.color), label).toBeGreaterThanOrEqual(AA_CONTRAST);
        }
  });

  it("fills a one-colour palette with the neutral furthest from p1", () => {
    expect(buildPalette(["#000000", "#000"], { text: "#111111", ground: "#f5f5f5" })).toMatchObject({ p1: "#000000", p2: "#f5f5f5" });
    expect(buildPalette(["#FF5A1F", "#ff5a1f", "#C6F432", "#c6f432", "#5b5bf0"], lightTheme.colors)).toMatchObject({
      p1: "#ff5a1f",
      p2: "#c6f432",
      p3: "#5b5bf0",
    });
  });

  it("leads with themeOverrides.colors.accent like the accent field", () => {
    const c = resolveTheme(board({ palette: "reel", themeOverrides: { colors: { accent: "#2a9d8f" } } })).colors;
    expect(c.accent).toBe("#2a9d8f");
    expect(colorsOf({ colors: c } as Theme)).toEqual(["#2a9d8f", "#ff5a1f", "#c6f432", "#5b5bf0"]);
  });

  it("keeps an overridden accentText", () => {
    const c = resolveTheme(board({ palette: "reel", themeOverrides: { colors: { accentText: "#000000" } } })).colors;
    expect(c.accentText).toBe("#000000");
    expect(c.palette!.onP1).not.toBe("#000000");
  });

  it("puts the storyboard's accent first and shifts the swatches down", () => {
    const c = resolveTheme(board({ palette: "reel", accent: "#2a9d8f" })).colors;
    expect(c.accent).toBe("#2a9d8f");
    expect(paletteSwatches(c.palette!).map((s) => s.color)).toEqual(["#2a9d8f", "#ff5a1f", "#c6f432", "#5b5bf0"]);
    // An accent already in the palette moves to the front instead of repeating.
    const lime = resolveTheme(board({ palette: "reel", accent: "#C6F432" })).colors;
    expect(paletteSwatches(lime.palette!).map((s) => s.color)).toEqual(["#c6f432", "#ff5a1f", "#5b5bf0", "#f1ece2"]);
    const derived = resolveTheme(board({ palette: { from: "#14213d", harmony: "complement" }, accent: "#e0562a" })).colors;
    expect(paletteSwatches(derived.palette!).map((s) => s.color)).toEqual(["#e0562a", ...derivePalette("#14213d", "complement")]);
  });

  it("derives brand from the accent, or the base theme's accent", () => {
    const withAccent = resolveTheme(board({ palette: "brand", accent: "#e0562a" })).colors;
    expect(paletteSwatches(withAccent.palette!).map((s) => s.color)).toEqual(derivePalette("#e0562a", "split"));
    expect(withAccent.accent).toBe("#e0562a");
    const fromBase = resolveTheme(board({ theme: "dark", palette: "brand" })).colors;
    expect(paletteSwatches(fromBase.palette!).map((s) => s.color)).toEqual(derivePalette(darkTheme.colors.accent, "split"));
  });

  it("derives {from, harmony} swatches over the base theme's neutrals", () => {
    const theme = resolveTheme(board({ theme: "dark", palette: { from: "#14213d", harmony: "split" } }));
    expect(colorsOf(theme)).toEqual(derivePalette("#14213d", "split"));
    expect(theme.colors.ground).toBe(darkTheme.colors.ground);
  });

  it("computes inks after themeOverrides", () => {
    const c = resolveTheme(board({ palette: "reel", themeOverrides: { colors: { ground: "#000000" } } })).colors;
    expect(c.palette!.onP2).toBe("#000000");
  });

  it("survives accentIntensity full", () => {
    const theme = resolveTheme(board({ palette: "reel", accentIntensity: "full" }));
    expect(theme.colors.ground).toBe("#ff5a1f");
    expect(theme.colors.palette).toBeDefined();
  });

  it("changes nothing without a palette", () => {
    for (const base of BASES) {
      expect(resolveTheme(board({ theme: base, accent: "#e0562a" })).colors.palette).toBeUndefined();
      expect(resolveTheme(board({ theme: base }))).toEqual(resolveTheme(base));
    }
  });

  it("validates the palette field", () => {
    expect(board({ palette: "reel" }).palette).toBe("reel");
    expect(board({ palette: { from: "#14213d", harmony: "mono" } }).palette).toEqual({ from: "#14213d", harmony: "mono" });
    expect(errorsOf({ palette: "neon" })).toEqual([
      'palette must be "reel", "editorial", "pastel", "mono" or "brand", or { "from": "#rrggbb", "harmony": ... } (got "neon")',
    ]);
    expect(errorsOf({ palette: { from: "navy", harmony: "tetrad" } })).toEqual([
      'palette.from must be a hex color like "#ff6a00" (got "navy"); palette.harmony must be "split", "analogous", "triad", "complement" or "mono" (got "tetrad")',
    ]);
    expect(errorsOf({ palette: { from: "#14213d" } })).toEqual([
      'palette.harmony must be "split", "analogous", "triad", "complement" or "mono" (got undefined)',
    ]);
    expect(errorsOf({ palette: { from: "#14213d", harmony: "split", extra: 1 } })).toEqual(['palette: unknown field "extra"']);
    expect(errorsOf({ palette: 3 })[0]).toMatch(/^palette must be "reel"/);
  });

  it("rejects a palette in themeOverrides", () => {
    expect(errorsOf({ themeOverrides: { colors: { palette: { p1: "#ff0000" } } } })).toEqual(['themeOverrides.colors: unknown field "palette"']);
  });

  it("allows palette colours in props and keeps palette out of the role names", () => {
    const ok = board({ palette: "reel", scenes: [{ id: "a", component: "TitleCard", props: { title: "A", color: "#5b5bf0" }, durationMs: 1000 }] });
    expect(checkThemeColors(ok)).toEqual([]);
    const bad = board({ palette: "reel", scenes: [{ id: "a", component: "TitleCard", props: { title: "A", color: "palette" }, durationMs: 1000 }] });
    const issues = checkThemeColors(bad);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).not.toMatch(/\bpalette,/);
  });
});
