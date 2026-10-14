import { describe, expect, it } from "vitest";
import {
  checkContrast,
  checkFieldCuts,
  checkPaletteArea,
  checkStoryboard,
  checkThemeColors,
  STORYBOARD_CHECK_NAMES,
  type FrameMeasurement,
  type MeasuredText,
} from "../src/checks";
import { validateStoryboard, type Storyboard } from "../src/index";
import { sceneTheme } from "../src/theme/field";
import { resolveTheme } from "../src/theme/resolve";

function storyboard(input: Record<string, unknown>): Storyboard {
  const result = validateStoryboard({ title: "Palette", aspect: "9:16", ...input });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

const title = (id: string, extra: Record<string, unknown> = {}, props: Record<string, unknown> = {}) => ({
  id,
  component: "TitleCard",
  props: { title: id, ...props },
  durationMs: 2000,
  ...extra,
});

// reel: p1 #ff5a1f (orange), p2 #c6f432 (lime), p3 #5b5bf0 (indigo), p4 #f1ece2 (cream)
const REEL = { p1: "#ff5a1f", p2: "#c6f432", p3: "#5b5bf0", p4: "#f1ece2" };

describe("theme-color with a palette", () => {
  it("warns on an off-palette hex in a scene on p2, naming the palette", () => {
    const sb = storyboard({ palette: "reel", scenes: [title("a", { ground: "p2" }, { color: "#123456" })] });
    const issues = checkThemeColors(sb);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ check: "theme-color", severity: "warn", sceneId: "a" });
    expect(issues[0]!.message).toContain("#123456");
    expect(issues[0]!.message).toContain(`p2 ${REEL.p2}`);
  });

  it("allows every palette hex, in any case", () => {
    const sb = storyboard({ palette: "reel", scenes: [title("a", { ground: "p2" }, { color: REEL.p3.toUpperCase() })] });
    expect(checkThemeColors(sb)).toEqual([]);
  });

  it("does not take a palette role name as a color prop (components resolve none), and says so", () => {
    const sb = storyboard({ palette: "reel", scenes: [title("a", {}, { color: "p3" })] });
    const issues = checkThemeColors(sb);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain(`p3 ${REEL.p3}`);
  });
});

const text = (color: string, backgrounds: string[]): MeasuredText => ({
  text: "On the field",
  rect: { x: 100, y: 100, width: 400, height: 80 },
  clips: [],
  opacity: 1,
  color,
  backgrounds,
  caption: false,
  fontSize: 64,
  fitted: false,
});
const frame = (texts: MeasuredText[]): FrameMeasurement => ({ texts, keys: [], blocks: [] });

describe("contrast on a colour field", () => {
  it("fails cream text on the lime field and passes the field's own ink", () => {
    const theme = resolveTheme({ theme: "dark", palette: "reel" });
    const lime = theme.colors.palette!.p2;
    expect(lime).toBe(REEL.p2);
    const fails = checkContrast(frame([text("rgb(241, 236, 226)", ["rgba(0, 0, 0, 0)", lime])]));
    expect(fails).toHaveLength(1);
    expect(fails[0]).toMatch(/below 4\.5:1/);
    expect(checkContrast(frame([text(theme.colors.palette!.onP2, [lime])]))).toEqual([]);
    const field = sceneTheme(theme, { ground: "p2" }).colors;
    expect(checkContrast(frame([text(field.text, [field.ground]), text(field.textMuted, [field.surface, field.ground])]))).toEqual([]);
  });
});

describe("checkPaletteArea", () => {
  it("warns when four palette roles carry area in one scene, listing them", () => {
    // The field's accent is p1, p3 or p4; with all of them in props, four roles always carry area.
    const four = storyboard({
      palette: "reel",
      scenes: [title("a", { ground: "p2" }, { color: REEL.p4, background: REEL.p3, stroke: REEL.p1 })],
    });
    const issues = checkPaletteArea(four);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ check: "palette-area", severity: "warn", sceneId: "a" });
    expect(issues[0]!.message).toMatch(/^4 palette roles carry area in this scene \(p2 ground, p\d accent, /);
    expect(issues[0]!.message).toContain("60-30-10");
    for (const role of ["p1", "p2", "p3", "p4"]) expect(issues[0]!.message).toContain(role);
  });

  it("counts p1 as the accent on the theme's ground", () => {
    const sb = storyboard({ palette: "reel", scenes: [title("a", {}, { color: REEL.p2, background: REEL.p3, fill: REEL.p4 })] });
    const issues = checkPaletteArea(sb);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("(p1 accent, p2, p3, p4)");
  });

  it("allows three roles: a ground, one supporting colour and the accent", () => {
    const sb = storyboard({ palette: "reel", scenes: [title("a", {}, { color: REEL.p2, background: REEL.p3 }), title("b", { ground: "p2" })] });
    expect(checkPaletteArea(sb)).toEqual([]);
    const repeated = storyboard({ palette: "reel", scenes: [title("a", {}, { color: REEL.p1, background: "#FF5A1F", fill: REEL.p2 })] });
    expect(checkPaletteArea(repeated)).toEqual([]);
  });

  it("does not count role names, which render nothing (theme-color warns)", () => {
    const sb = storyboard({ palette: "reel", scenes: [title("a", {}, { color: REEL.p2, background: REEL.p3, fill: "p4" })] });
    expect(checkPaletteArea(sb)).toEqual([]);
  });

  it("does not count off-palette hexes or CSS colour functions", () => {
    const sb = storyboard({
      palette: "reel",
      scenes: [title("a", {}, { color: REEL.p2, background: REEL.p3, fill: "#123456", stroke: "rgb(1, 2, 3)", tint: "#abc" })],
    });
    expect(checkPaletteArea(sb)).toEqual([]);
  });

  it("counts a swatch in a nested array prop", () => {
    const sb = storyboard({
      palette: "reel",
      scenes: [title("a", {}, { color: REEL.p2, background: REEL.p3, items: [{ label: "x", style: { fill: REEL.p4 } }] })],
    });
    const issues = checkPaletteArea(sb);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("(p1 accent, p2, p3, p4)");
  });

  it("does nothing without a palette", () => {
    expect(checkPaletteArea(storyboard({ scenes: [title("a", {}, { color: "#ff5a1f", background: "#c6f432", fill: "#5b5bf0", stroke: "#f1ece2" })] }))).toEqual([]);
  });
});

describe("checkFieldCuts", () => {
  it("warns when a fade crosses between two field grounds", () => {
    const sb = storyboard({ palette: "reel", scenes: [title("a", { ground: "p2", transition: { type: "fade" } }), title("b", { ground: "p3" })] });
    const issues = checkFieldCuts(sb);
    expect(issues).toEqual([
      {
        check: "field-cut",
        severity: "warn",
        sceneId: "a",
        message:
          '"fade" into "b" crosses from p2 to p3; a transition that blends both scenes is drawn as a hard cut at its midpoint between two colour fields — use "cut", or "wipe", "iris" or "whipPan" to hide the change',
      },
    ]);
  });

  it("names the theme default and the theme's ground", () => {
    const sb = storyboard({ palette: "reel", scenes: [title("a"), title("b", { ground: "p1" })] });
    const theme = { ...resolveTheme(sb), motion: { ...resolveTheme(sb).motion, transition: "zoomBlur" as const } };
    const issues = checkFieldCuts(sb, theme);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/^the theme default "zoomBlur" into "b" crosses from the ground to p1;/);
  });

  it("warns on a slide between fields", () => {
    const sb = storyboard({ palette: "reel", scenes: [title("a", { ground: "p2", transition: { type: "slide" } }), title("b", { ground: "p3" })] });
    const issues = checkFieldCuts(sb);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/^"slide" into "b" crosses from p2 to p3; a transition that blends both scenes/);
  });

  it("accepts iris and whipPan between fields", () => {
    for (const type of ["iris", "whipPan"]) {
      const sb = storyboard({ palette: "reel", scenes: [title("a", { ground: "p2", transition: { type } }), title("b", { ground: "p3" })] });
      expect(checkFieldCuts(sb), type).toEqual([]);
    }
  });

  it("accepts a cut or a wipe between fields, and a fade on one ground", () => {
    const cut = storyboard({ palette: "reel", scenes: [title("a", { ground: "p2", transition: { type: "cut" } }), title("b", { ground: "p3" })] });
    const wipe = storyboard({ palette: "reel", scenes: [title("a", { ground: "p2", transition: { type: "wipe" } }), title("b", { ground: "p3" })] });
    const same = storyboard({ palette: "reel", scenes: [title("a", { ground: "p2", transition: { type: "fade" } }), title("b", { ground: "p2" })] });
    for (const sb of [cut, wipe, same]) expect(checkFieldCuts(sb)).toEqual([]);
  });
});

describe("checkStoryboard", () => {
  it("runs palette-area and field-cut", async () => {
    expect(STORYBOARD_CHECK_NAMES).toContain("palette-area");
    expect(STORYBOARD_CHECK_NAMES).toContain("field-cut");
    const sb = storyboard({
      palette: "reel",
      scenes: [title("a", { ground: "p2", transition: { type: "fade" } }, { color: REEL.p4, background: REEL.p3, stroke: REEL.p1 }), title("b", { ground: "p3" })],
    });
    const checks = (await checkStoryboard(sb)).map((i) => i.check);
    expect(checks).toContain("palette-area");
    expect(checks).toContain("field-cut");
  });
});
