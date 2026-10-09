import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  GROUND_STYLES,
  TYPE_ROLES,
  accentInk,
  contrastRatio,
  darkTheme,
  lightTheme,
  mixColors,
  neutralTheme,
  relativeLuminance,
  resolveTheme,
  themes,
  validateStoryboard,
  type Storyboard,
  type Theme,
} from "../src/index";

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

describe("mixColors", () => {
  it("blends hex colors in sRGB", () => {
    expect(mixColors("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixColors("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixColors("#000", "#fff", 0.5)).toBe("#808080");
  });
});

const BUILT_IN: Array<[string, Theme]> = [
  ["light", lightTheme],
  ["dark", darkTheme],
  ["neutral", neutralTheme],
];

const HEX = /^#[0-9a-f]{6}$/i;

describe.each(BUILT_IN)("%s theme", (name, theme) => {
  const { colors } = theme;

  it("is registered under its name", () => {
    expect(theme.name).toBe(name);
    expect(themes[name]).toBe(theme);
  });

  it("fills every color role with a hex color; neutrals are tinted, never pure black, and only cards may be pure white", () => {
    const roles = ["ground", "surface", "surfaceAlt", "text", "textMuted", "textSubtle", "accent", "accentText", "border", "shadow"];
    expect(Object.keys(colors).sort()).toEqual(roles.sort());
    for (const [role, value] of Object.entries(colors)) {
      expect(value).toMatch(HEX);
      expect(value.toLowerCase()).not.toBe("#000000");
      // The owner's reference has pure white cards; nothing else is.
      if (role !== "surface") expect(value.toLowerCase(), role).not.toBe("#ffffff");
    }
  });

  it("meets WCAG AA for text and textMuted on ground and surface", () => {
    for (const fg of [colors.text, colors.textMuted]) {
      for (const bg of [colors.ground, colors.surface, colors.surfaceAlt]) {
        expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps primary text at AAA (7:1) on ground and surface", () => {
    expect(contrastRatio(colors.text, colors.ground)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(colors.text, colors.surface)).toBeGreaterThanOrEqual(7);
  });

  it("keeps accent marks visible on cards, accent text readable, and accentText legible on the accent", () => {
    // Accent fills, rings and icons: WCAG non-text contrast (3:1) on the cards they sit on.
    expect(contrastRatio(colors.accent, colors.surface)).toBeGreaterThanOrEqual(3);
    // Text set in the accent uses accentInk, which reads at AA on the ground and the cards.
    for (const bg of [colors.ground, colors.surface]) expect(contrastRatio(accentInk(theme), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.accentText, colors.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it("orders text emphasis: text > textMuted > textSubtle, and textSubtle still shows on cards", () => {
    const vs = (c: string) => contrastRatio(c, colors.ground);
    expect(vs(colors.text)).toBeGreaterThan(vs(colors.textMuted));
    expect(vs(colors.textMuted)).toBeGreaterThan(vs(colors.textSubtle));
    // Decoration (window controls, toolbar icons) and large text on cards only.
    expect(contrastRatio(colors.textSubtle, colors.surface)).toBeGreaterThanOrEqual(3);
  });

  it("picks a known ground style", () => {
    expect(GROUND_STYLES).toContain(theme.ground.style);
    expect(Number.isInteger(theme.ground.seed)).toBe(true);
  });

  it("has a full type ramp for both aspects", () => {
    expect(Object.keys(theme.type).sort()).toEqual([...TYPE_ROLES].sort());
    for (const role of TYPE_ROLES) {
      for (const aspect of ASPECTS) {
        const spec = theme.type[role][aspect];
        expect(spec.size).toBeGreaterThan(0);
        expect(spec.weight).toBeGreaterThanOrEqual(100);
        expect(spec.weight).toBeLessThanOrEqual(900);
        expect(Number.isFinite(spec.tracking)).toBe(true);
        expect(spec.lineHeight).toBeGreaterThanOrEqual(0.85);
      }
    }
  });

  it("uses font-family stacks with a generic fallback", () => {
    expect(theme.fonts.display).toMatch(/sans-serif$/);
    expect(theme.fonts.body).toMatch(/sans-serif$/);
    expect(theme.fonts.mono).toMatch(/monospace$/);
  });

  it("has ordered type, spacing and radius scales", () => {
    const sorted = (xs: number[]) => xs.slice().sort((a, b) => a - b);
    for (const aspect of ASPECTS) {
      // Largest step first, mono aside.
      const steps = TYPE_ROLES.filter((role) => role !== "mono").map((role) => theme.type[role][aspect].size);
      expect(steps).toEqual(sorted(steps).reverse());
      expect(new Set(steps).size).toBe(steps.length);
    }
    const s = Object.values(theme.spacing);
    expect(s).toEqual(sorted(s));
    const r = theme.radius;
    expect([r.sm, r.md, r.lg, r.pill]).toEqual(sorted([r.sm, r.md, r.lg, r.pill]));
  });

  it("has a hairline border and a soft card shadow", () => {
    expect(theme.hairline).toBeGreaterThan(0);
    expect(theme.cardShadow.blur).toBeGreaterThan(theme.cardShadow.y);
    expect(theme.cardShadow.opacity).toBeGreaterThan(0);
    expect(theme.cardShadow.opacity).toBeLessThanOrEqual(1);
  });

  it("has sensible motion tokens", () => {
    const m = theme.motion;
    expect(m.easing.length).toBeGreaterThan(0);
    for (const ms of [m.enterMs, m.exitMs, m.transitionMs, m.staggerMs]) expect(ms).toBeGreaterThan(0);
    for (const preset of Object.values(m.springs)) expect(["smooth", "snappy", "gentle", "bouncy"]).toContain(preset);
  });
});

describe("built-in themes", () => {
  it("light takes its colors from the owner's reference", () => {
    const { colors } = lightTheme;
    expect(colors.ground).toBe("#e6e7df");
    expect(colors.surface).toBe("#ffffff");
    expect(colors.surfaceAlt).toBe("#f1f2ea");
    expect(colors.textSubtle).toBe("#8d8c85");
    expect(colors.accent).toBe("#fb5a1f");
    // A flat ground, soft wide card shadow and ~28 px corners.
    expect(lightTheme.ground.style).toBe("solid");
    expect(lightTheme.radius.md).toBe(28);
    expect(lightTheme.cardShadow.blur).toBeGreaterThanOrEqual(3 * lightTheme.cardShadow.y);
    expect(lightTheme.cardShadow.opacity).toBeLessThanOrEqual(0.12);
  });

  it("light keeps its secondary text and accent text readable on the reference ground", () => {
    const { colors } = lightTheme;
    for (const bg of [colors.ground, colors.surface, colors.surfaceAlt]) {
      expect(contrastRatio(colors.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(accentInk(lightTheme), bg)).toBeGreaterThanOrEqual(4.5);
    }
    // Still the reference's warm grey and orange, only deep enough to read.
    expect(contrastRatio(colors.textMuted, colors.ground)).toBeLessThan(5.5);
    expect(contrastRatio(accentInk(lightTheme), colors.ground)).toBeLessThan(5.5);
  });

  it("accentInk is the accent itself wherever the accent already reads", () => {
    expect(accentInk(darkTheme)).toBe(darkTheme.colors.accent);
    expect(accentInk(neutralTheme)).toBe(neutralTheme.colors.accent);
  });

  it("light is a light theme with white-ish cards and dark text", () => {
    expect(relativeLuminance(lightTheme.colors.ground)).toBeGreaterThan(0.7);
    expect(relativeLuminance(lightTheme.colors.surface)).toBeGreaterThan(relativeLuminance(lightTheme.colors.ground));
    expect(relativeLuminance(lightTheme.colors.text)).toBeLessThan(0.05);
    expect(lightTheme.motion.easing).toBe("expoOut");
  });

  it("dark has a deep ground and raised surfaces", () => {
    expect(relativeLuminance(darkTheme.colors.ground)).toBeLessThan(0.02);
    expect(relativeLuminance(darkTheme.colors.surface)).toBeGreaterThan(relativeLuminance(darkTheme.colors.ground));
  });

  it("neutral keeps the v1 look", () => {
    expect(neutralTheme.colors.ground).toBe("#0b0d10");
    expect(neutralTheme.colors.surface).toBe("#1a1d23");
    expect(neutralTheme.colors.text).toBe("#f5f6f8");
    expect(neutralTheme.colors.textMuted).toBe("#a3a9b3");
    expect(neutralTheme.colors.accent).toBe("#4cc2ff");
    expect(neutralTheme.ground.style).toBe("solid");
    expect(neutralTheme.radius.md).toBe(24);
    expect(neutralTheme.motion.easing).toBe("easeInOutCubic");
  });

  it("all default to subtle accent intensity", () => {
    for (const [, theme] of BUILT_IN) expect(theme.accentIntensity).toBe("subtle");
  });
});

function board(input: Record<string, unknown> = {}): Storyboard {
  const result = validateStoryboard({
    title: "T",
    aspect: "9:16",
    scenes: [{ id: "a", component: "TitleCard", props: { title: "A" }, durationMs: 1000 }],
    ...input,
  });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

describe("resolveTheme", () => {
  it("defaults to the light theme", () => {
    expect(resolveTheme(board())).toEqual(lightTheme);
  });

  it("looks up each built-in theme by name", () => {
    for (const [name, theme] of BUILT_IN) {
      expect(resolveTheme(name)).toBe(theme);
      expect(resolveTheme(board({ theme: name }))).toEqual(theme);
    }
  });

  it("names the known themes when the name is unknown", () => {
    expect(() => resolveTheme("nope")).toThrow(/unknown theme "nope" \(known: light, dark, neutral\)/);
    expect(() => resolveTheme(board({ theme: "nope" }))).toThrow(/unknown theme "nope"/);
  });

  it("deep-merges themeOverrides over the named theme", () => {
    const theme = resolveTheme(
      board({
        theme: "dark",
        themeOverrides: {
          colors: { ground: "#101820", textMuted: "#b0b8c0" },
          ground: { style: "noise", seed: 42 },
          type: { headline: { "9:16": { weight: 900 } } },
          radius: { md: 12 },
          motion: { enterMs: 250, springs: { emphasis: "snappy" } },
        },
      }),
    );
    expect(theme.name).toBe("dark");
    expect(theme.colors.ground).toBe("#101820");
    expect(theme.colors.textMuted).toBe("#b0b8c0");
    expect(theme.colors.text).toBe(darkTheme.colors.text);
    expect(theme.ground).toEqual({ style: "noise", seed: 42 });
    expect(theme.type.headline["9:16"]).toEqual({ ...darkTheme.type.headline["9:16"], weight: 900 });
    expect(theme.type.headline["16:9"]).toEqual(darkTheme.type.headline["16:9"]);
    expect(theme.radius).toEqual({ ...darkTheme.radius, md: 12 });
    expect(theme.motion).toEqual({ ...darkTheme.motion, enterMs: 250, springs: { ...darkTheme.motion.springs, emphasis: "snappy" } });
  });

  it("does not mutate the built-in themes", () => {
    const before = JSON.stringify(themes);
    resolveTheme(board({ themeOverrides: { colors: { text: "#222222" } }, accent: "#ff6a00", accentIntensity: "full" }));
    expect(JSON.stringify(themes)).toBe(before);
  });

  it("allows any color, even a low-contrast one (the checks report it, not the theme)", () => {
    const theme = resolveTheme(board({ themeOverrides: { colors: { text: "#eeeeee", ground: "#ffffff" } } }));
    expect(theme.colors.text).toBe("#eeeeee");
    expect(theme.colors.ground).toBe("#ffffff");
  });

  it("applies the accent shortcut and picks a readable accentText", () => {
    const theme = resolveTheme(board({ accent: "#ffcc00" }));
    expect(theme.colors.accent).toBe("#ffcc00");
    expect(contrastRatio(theme.colors.accentText, "#ffcc00")).toBeGreaterThanOrEqual(4.5);
    // A dark accent on the light theme gets light text.
    const deep = resolveTheme(board({ accent: "#1b3a8a" }));
    expect(relativeLuminance(deep.colors.accentText)).toBeGreaterThan(0.5);
  });

  it("keeps an explicit accentText from themeOverrides", () => {
    const theme = resolveTheme(board({ accent: "#ffcc00", themeOverrides: { colors: { accentText: "#fff8e0" } } }));
    expect(theme.colors.accentText).toBe("#fff8e0");
  });

  it("lets the accent shortcut win over themeOverrides.colors.accent", () => {
    const theme = resolveTheme(board({ accent: "#00aa55", themeOverrides: { colors: { accent: "#aa0055" } } }));
    expect(theme.colors.accent).toBe("#00aa55");
  });

  describe("accent intensity", () => {
    it("subtle leaves the colors alone", () => {
      expect(resolveTheme(board({ accentIntensity: "subtle" }))).toEqual(lightTheme);
    });

    it("bold keeps the palette and records the intensity for components", () => {
      const theme = resolveTheme(board({ accentIntensity: "bold" }));
      expect(theme.accentIntensity).toBe("bold");
      expect(theme.colors).toEqual(lightTheme.colors);
    });

    it("can also be set through themeOverrides", () => {
      expect(resolveTheme(board({ themeOverrides: { accentIntensity: "bold" } })).accentIntensity).toBe("bold");
    });

    it.each(BUILT_IN)("full makes the accent the ground in %s, keeping text readable", (name, base) => {
      const theme = resolveTheme(board({ theme: name, accentIntensity: "full" }));
      const { colors } = theme;
      expect(theme.accentIntensity).toBe("full");
      expect(colors.ground).toBe(base.colors.accent);
      expect(colors.text).toBe(base.colors.accentText);
      // Accent elements flip: filled with the old accentText, labelled in the old accent.
      expect(colors.accent).toBe(base.colors.accentText);
      expect(colors.accentText).toBe(base.colors.accent);
      expect(contrastRatio(colors.text, colors.ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.text, colors.surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(colors.accentText, colors.accent)).toBeGreaterThanOrEqual(4.5);
      for (const value of Object.values(colors)) expect(value).toMatch(HEX);
    });

    it("full with a custom accent uses that accent as the ground", () => {
      const theme = resolveTheme(board({ accent: "#e8590c", accentIntensity: "full" }));
      expect(theme.colors.ground).toBe("#e8590c");
      expect(contrastRatio(theme.colors.text, theme.colors.ground)).toBeGreaterThanOrEqual(3);
    });
  });
});
