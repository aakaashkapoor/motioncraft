import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildTimeline } from "../src/engine/timeline";
import { Frame } from "../src/render/page";
import { CROSSFADE_TRANSITIONS, cutsAtMidpoint } from "../src/render/fieldCut";
import { TRANSITION_TYPES, type PaletteSpec, type SceneGround, type Storyboard, type StoryboardScene, type TransitionType } from "../src/storyboard/types";
import { validateStoryboard } from "../src/storyboard/validate";
import { AA_CONTRAST, contrastRatio } from "../src/theme/contrast";
import { fieldColors, fieldTheme, sceneTheme } from "../src/theme/field";
import { lightTheme } from "../src/theme/light";
import { PALETTE_PRESETS, paletteSwatches } from "../src/theme/palettes";
import { resolveTheme } from "../src/theme/resolve";
import type { Theme } from "../src/theme/types";
import { withAlpha } from "../src/theme/color";
import { OVERLAY_PILL_ALPHA } from "../src/overlays/layout";
import type { SharedBox, SharedMeasurements } from "../src/transitions/shared";

const BASES = ["light", "dark", "neutral"] as const;

function rawBoard(extra: Record<string, unknown>, scenes: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    title: "Fields",
    aspect: "9:16",
    ...extra,
    scenes: scenes.map((s, i) => ({ id: `s${i}`, component: "TitleCard", props: { title: `Scene ${i}` }, durationMs: 2000, ...s })),
  };
}

const errorsOf = (extra: Record<string, unknown>, scenes: Array<Record<string, unknown>>) => {
  const result = validateStoryboard(rawBoard(extra, scenes));
  return result.ok ? [] : result.errors;
};

function board(extra: Record<string, unknown>, scenes: Array<Record<string, unknown>>): Storyboard {
  const result = validateStoryboard(rawBoard(extra, scenes));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

describe("fieldTheme", () => {
  const palettes: PaletteSpec[] = [...PALETTE_PRESETS, { from: "#14213d", harmony: "split" }, { from: "#e0562a", harmony: "triad" }];
  for (const base of BASES) {
    for (const palette of palettes) {
      for (const intensity of ["subtle", "full"] as const) {
        it(`reads on every swatch: ${base} / ${JSON.stringify(palette)} / ${intensity}`, () => {
          const theme = resolveTheme({ theme: base, palette, accentIntensity: intensity });
          for (const { role, color, ink } of paletteSwatches(theme.colors.palette!)) {
            const c = fieldTheme(theme, role).colors;
            expect(c.ground).toBe(color);
            expect(c.text).toBe(ink);
            for (const bg of [c.ground, c.surface]) {
              expect(contrastRatio(c.text, bg), `${role} text on ${bg}`).toBeGreaterThanOrEqual(AA_CONTRAST);
              expect(contrastRatio(c.textMuted, bg), `${role} textMuted on ${bg}`).toBeGreaterThanOrEqual(AA_CONTRAST);
            }
            expect(contrastRatio(c.textSubtle, c.ground)).toBeGreaterThanOrEqual(3);
            expect(c.accent).not.toBe(c.ground);
            expect(contrastRatio(c.accent, c.ground)).toBeGreaterThanOrEqual(3);
            expect(contrastRatio(c.accentText, c.accent)).toBeGreaterThanOrEqual(AA_CONTRAST);
            expect(c.palette).toEqual(theme.colors.palette);
          }
        });
      }
    }
  }

  it("returns the theme itself for the ground or no ground", () => {
    const theme = resolveTheme({ theme: "dark", palette: "reel" });
    expect(fieldTheme(theme, undefined)).toBe(theme);
    expect(fieldTheme(theme, "ground")).toBe(theme);
    expect(sceneTheme(theme, { ground: "ground" })).toBe(theme);
    expect(sceneTheme(theme, {})).toBe(theme);
    expect(sceneTheme(theme, { ground: "p2" }).colors.ground).toBe(theme.colors.palette!.p2);
  });

  it("throws on a role the palette lacks, or without a palette", () => {
    const editorial = resolveTheme({ theme: "light", palette: "editorial" });
    expect(() => fieldTheme(editorial, "p4")).toThrow(/ground "p4" is not in the palette \(it has p1, p2, p3\)/);
    expect(() => fieldTheme(lightTheme, "p2")).toThrow(/ground "p2" needs a palette/);
  });

  it("picks the most contrasting other swatch as the accent, else the ink", () => {
    const theme = resolveTheme({ theme: "dark", palette: "reel" });
    const p = theme.colors.palette!;
    const c = fieldColors(theme.colors, p.p2, p.onP2);
    const others = paletteSwatches(p).filter((s) => s.color !== p.p2 && contrastRatio(s.color, p.p2) >= 3);
    if (others.length > 0) {
      expect(others.map((s) => s.color)).toContain(c.accent);
    } else {
      expect(c.accent).toBe(p.onP2);
      expect(c.accentText).toBe(p.p2);
    }
  });

  it("is fullAccent without a palette: accent flips to the ink, labelled in the fill", () => {
    const c = fieldColors(lightTheme.colors, lightTheme.colors.accent, lightTheme.colors.accentText);
    expect(c.accent).toBe(lightTheme.colors.accentText);
    expect(c.accentText).toBe(lightTheme.colors.accent);
    expect(resolveTheme({ theme: "light", accentIntensity: "full" }).colors).toEqual(c);
  });
});

describe("scene ground validation", () => {
  it("accepts a palette role or the ground", () => {
    const sb = board({ palette: "reel" }, [{ ground: "p2" }, { ground: "ground" }, {}]);
    expect(sb.scenes.map((s) => s.ground)).toEqual(["p2", "ground", undefined]);
  });

  it("rejects an unknown value", () => {
    expect(errorsOf({ palette: "reel" }, [{ ground: "p5" }])).toEqual(['scenes[0] ("s0"): ground must be "ground", "p1", "p2", "p3" or "p4" (got "p5")']);
  });

  it("needs a palette for a swatch", () => {
    expect(errorsOf({}, [{}, { ground: "p2" }])).toEqual(['scenes[1] ("s1"): ground "p2" needs a top-level "palette"']);
    expect(errorsOf({}, [{ ground: "ground" }])).toEqual([]);
  });

  it("reports a theme that does not resolve instead of skipping the check", () => {
    const errors = errorsOf({ palette: "reel", themeOverrides: { colors: { positive: "#0e0e10" } } }, [{ ground: "p2" }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^palette: the theme does not resolve, so scene grounds cannot be checked: themeOverrides\.colors: positive/);
  });

  it("rejects a role the palette does not have", () => {
    expect(errorsOf({ palette: "editorial" }, [{ ground: "p3" }, { ground: "p4" }])).toEqual(['scenes[1] ("s1"): ground "p4" is not in the palette (it has p1, p2, p3)']);
  });
});

describe("cutsAtMidpoint", () => {
  const theme = (transition: TransitionType): Theme => ({ ...lightTheme, motion: { ...lightTheme.motion, transition } });
  const two = (a: SceneGround | undefined, b: SceneGround | undefined, type?: TransitionType): Storyboard =>
    ({
      title: "t",
      aspect: "9:16",
      fps: 30,
      theme: "light",
      palette: "reel",
      scenes: [
        { id: "a", component: "TitleCard", props: {}, durationMs: 1000, ...(a && { ground: a }), ...(type && { transition: { type } }) },
        { id: "b", component: "TitleCard", props: {}, durationMs: 1000, ...(b && { ground: b }) },
      ] as StoryboardScene[],
    }) as Storyboard;

  it("crossfades are fade, zoomBlur and slide", () => {
    expect([...CROSSFADE_TRANSITIONS]).toEqual(["fade", "zoomBlur", "slide"]);
  });

  it.each(TRANSITION_TYPES.map((t) => [t]))("%s between two different fields", (type) => {
    expect(cutsAtMidpoint(two("p2", "p3", type), 0, lightTheme)).toBe((CROSSFADE_TRANSITIONS as readonly string[]).includes(type));
  });

  it("never cuts between the same grounds", () => {
    for (const type of TRANSITION_TYPES) {
      expect(cutsAtMidpoint(two("p2", "p2", type), 0, lightTheme)).toBe(false);
      expect(cutsAtMidpoint(two(undefined, "ground", type), 0, lightTheme)).toBe(false);
    }
  });

  it("treats a missing ground as the theme's ground", () => {
    expect(cutsAtMidpoint(two(undefined, "p2", "fade"), 0, lightTheme)).toBe(true);
    expect(cutsAtMidpoint(two("ground", "p2", "fade"), 0, lightTheme)).toBe(true);
  });

  it("uses the theme's default transition", () => {
    expect(cutsAtMidpoint(two("p2", "p3"), 0, theme("fade"))).toBe(true);
    expect(cutsAtMidpoint(two("p2", "p3"), 0, theme("wipe"))).toBe(false);
    expect(cutsAtMidpoint(two("p2", "p3"), 0, theme("cut"))).toBe(false);
  });
});

describe("Frame with fields", () => {
  const make = (type: TransitionType, second: SceneGround = "p3", extra: Record<string, unknown> = {}) => {
    const sb = board({ theme: "dark", palette: "reel", ...extra }, [
      { props: { title: "Alpha" }, ground: "p2", transition: { type, durationMs: 600 } },
      { props: { title: "Bravo" }, ground: second },
    ]);
    const theme = resolveTheme(sb);
    const timeline = buildTimeline(sb, {}, theme);
    const render = (frame: number, shared?: SharedMeasurements) =>
      renderToStaticMarkup(<Frame storyboard={sb} theme={theme} timeline={timeline} frame={frame} {...(shared && { shared })} />);
    return { sb, theme, timeline, render, t: timeline.transitions[0]! };
  };

  it("hard-cuts a fade between two fields at its midpoint", () => {
    const { render, t } = make("fade");
    const half = t.frames / 2;
    const before = render(t.startFrame + Math.ceil(half) - 1);
    const after = render(t.startFrame + Math.ceil(half));
    expect(before).toContain("Alpha");
    expect(before).not.toContain("Bravo");
    expect(after).toContain("Bravo");
    expect(after).not.toContain("Alpha");
    for (const html of [before, after]) expect(html).not.toMatch(/inset:0;[^"]*opacity/);
    // One scene on screen: the frame itself is the field, with one ground.
    expect(before).toContain('data-frame-field="p2"');
    expect(after).toContain('data-frame-field="p3"');
    for (const html of [before, after]) {
      expect(html).not.toContain("data-field=");
      expect(html.match(/data-ground=/g)).toHaveLength(1);
    }
  });

  it("keeps a wipe between two fields, each scene on its own field", () => {
    const { render, t, theme } = make("wipe");
    const html = render(t.startFrame + Math.floor(t.frames / 2));
    expect(html).toContain("Alpha");
    expect(html).toContain("Bravo");
    const p = theme.colors.palette!;
    expect(html).toMatch(new RegExp(`data-field="p2"[^>]*background-color:${p.p2}`));
    expect(html).toMatch(new RegExp(`data-field="p3"[^>]*background-color:${p.p3}`));
    // Alpha sits inside the p2 field, Bravo inside the p3 field.
    expect(html.indexOf('data-field="p2"')).toBeLessThan(html.indexOf("Alpha"));
    expect(html.indexOf('data-field="p3"')).toBeLessThan(html.indexOf("Bravo"));
    expect(html.indexOf("Alpha")).toBeLessThan(html.indexOf('data-field="p3"'));
  });

  it("draws a transition between scenes on the same field over one shared ground", () => {
    const { render, t, theme } = make("fade", "p2");
    const html = render(t.startFrame + Math.floor(t.frames / 2));
    expect(html).toContain("Alpha");
    expect(html).toContain("Bravo");
    expect(html).not.toContain("data-field=");
    expect(html).toContain('data-frame-field="p2"');
    expect(html).toMatch(new RegExp(`^<div data-frame-field="p2" style="[^"]*background-color:${theme.colors.palette!.p2}`));
    expect(html.match(/data-ground=/g)).toHaveLength(1);
    expect(html).toMatch(/inset:0;opacity/);
  });

  it("morphs no shared element across a field cut", () => {
    const box: SharedBox = { x: 100, y: 200, width: 800, height: 1000, radius: 24, background: "#ffffff", opacity: 1 };
    const shared: SharedMeasurements = new Map([[0, { from: { win: box }, to: { win: { ...box, x: 300 } } }]]);
    for (const type of ["fade", "wipe"] as const) {
      const { render, t } = make(type);
      const html = render(t.startFrame + Math.floor(t.frames / 2), shared);
      if (type === "fade") {
        expect(html).not.toContain("data-morph-box");
        expect(html).not.toContain("data-shared-scene");
      } else {
        expect(html).toContain('data-morph-box="win"');
      }
    }
  });

  it("gives the overlays the theme of the scene that reads as on screen", () => {
    const { render, t, theme } = make("wipe", "p3", { overlays: [{ text: "Sponsored", corner: "top-right" }] });
    const pill = (role: "p2" | "p3") => `background-color:${withAlpha(fieldTheme(theme, role).colors.surface, OVERLAY_PILL_ALPHA)}`;
    const half = t.frames / 2;
    const before = render(t.startFrame + Math.ceil(half) - 1);
    const after = render(t.startFrame + Math.ceil(half));
    expect(before).toContain(pill("p2"));
    expect(before).not.toContain(pill("p3"));
    expect(after).toContain(pill("p3"));
    expect(after).not.toContain(pill("p2"));
  });

  it("draws text in the field's ink", () => {
    const { render, theme } = make("cut");
    expect(render(0)).toContain(`color:${theme.colors.palette!.onP2}`);
  });

  it("adds no field wrapper without scene grounds", () => {
    const sb = board({ theme: "dark", palette: "reel" }, [{ transition: { type: "fade" } }, {}]);
    const theme = resolveTheme(sb);
    const timeline = buildTimeline(sb, {}, theme);
    for (const frame of [0, timeline.transitions[0]!.startFrame + 2]) {
      const html = renderToStaticMarkup(<Frame storyboard={sb} theme={theme} timeline={timeline} frame={frame} />);
      expect(html).not.toContain("data-field");
      expect(html).not.toContain("data-frame-field");
    }
  });
});
