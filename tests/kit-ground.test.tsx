import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ACCENT_INTENSITIES,
  ASPECTS,
  BigNumber,
  FlowDiagram,
  Ground,
  GROUND_STYLES,
  TitleCard,
  accentInk,
  buildTimeline,
  contrastRatio,
  darkTheme,
  frameSize,
  grainSeed,
  gridBreath,
  groundStyle,
  groundTint,
  lightTheme,
  meshBlobs,
  meshFalloff,
  meshLayout,
  mixColors,
  neutralTheme,
  resolveTheme,
  validateStoryboard,
  type Aspect,
  type GroundStyle,
  type MeshBlob,
  type Storyboard,
  type Theme,
} from "../src/index";
import { GROUND_TINT_ATTRIBUTE } from "../src/checks/measure";
import { parseHex } from "../src/theme/color";
import { Frame } from "../src/render/page";

const withGround = (style: GroundStyle, seed = 1, base: Theme = lightTheme): Theme => ({ ...base, ground: { ...base.ground, style, seed } });

describe("groundStyle", () => {
  it("draws nothing extra for solid", () => {
    expect(groundStyle(withGround("solid"))).toEqual({});
  });

  it("draws a radial gradient for vignette, from the theme's colors", () => {
    const { backgroundImage } = groundStyle(withGround("vignette"));
    expect(backgroundImage).toMatch(/^radial-gradient\(/);
    expect(backgroundImage).toContain(lightTheme.colors.ground);
  });

  it("draws a dot grid on the spacing scale for grid", () => {
    const style = groundStyle(withGround("grid"));
    expect(style.backgroundImage).toMatch(/radial-gradient\(circle/);
    expect(style.backgroundSize).toBe(`${lightTheme.spacing.lg}px ${lightTheme.spacing.lg}px`);
  });
});

describe.each(ASPECTS)("Ground (%s)", (aspect) => {
  const render = (theme: Theme) => renderToStaticMarkup(<Ground theme={theme} aspect={aspect} />);

  it.each(GROUND_STYLES)("covers the frame in %s without painting a background color", (style) => {
    const html = render(withGround(style));
    expect(html).toContain(`data-ground="${style}"`);
    const [width, height] = aspect === "9:16" ? [1080, 1920] : [1920, 1080];
    expect(html).toContain(`width:${width}px;height:${height}px`);
    expect(html).not.toContain("background-color");
  });

  it("seeds the noise grain, deterministically", () => {
    expect(render(withGround("noise", 7))).toContain('seed="7"');
    expect(render(withGround("noise", 7))).toBe(render(withGround("noise", 7)));
    expect(render(withGround("noise", 7))).not.toBe(render(withGround("noise", 8)));
  });

  const at = (theme: Theme, ms: number) => renderToStaticMarkup(<Ground theme={theme} aspect={aspect} ms={ms} />);

  it("draws one soft radial blob per mesh blob, where meshBlobs puts it", () => {
    const theme = withGround("mesh");
    const html = at(theme, 1500);
    const blobs = meshBlobs(theme, aspect, 1500);
    expect(html.match(/data-mesh-blob/g)).toHaveLength(blobs.length);
    expect(html.match(/radial-gradient\(circle closest-side/g)).toHaveLength(blobs.length);
    for (const blob of blobs) expect(html).toContain(`width:${blob.size}px;height:${blob.size}px`);
  });

  it.each(GROUND_STYLES)("draws the same %s ground for the same moment, every time", (style) => {
    const theme = withGround(style);
    expect(at(theme, 2345)).toBe(at(theme, 2345));
  });

  it("moves the mesh and the grid with time; a still style stays still", () => {
    for (const style of ["mesh", "grid"] as const) expect(at(withGround(style), 1000), style).not.toBe(at(withGround(style), 2000));
    for (const style of ["solid", "vignette", "noise"] as const) expect(at(withGround(style), 1000), style).toBe(at(withGround(style), 2000));
  });

  it("breathes the grid by scale and opacity, about the frame's center", () => {
    const html = at(withGround("grid"), 4000);
    expect(html).toContain("transform:scale(1.04)");
    expect(html).toContain("opacity:1");
    expect(at(withGround("grid"), 0)).toContain("transform:scale(1)");
  });

  it("marks the mesh layer with the ground colour text can end up on, for the contrast check", () => {
    const theme = withGround("mesh", 1, darkTheme);
    expect(at(theme, 0)).toContain(`${GROUND_TINT_ATTRIBUTE}="${groundTint(theme, aspect)}"`);
    expect(at(withGround("grid"), 0)).not.toContain(GROUND_TINT_ATTRIBUTE);
  });

  it("lays optional grain over any style, re-seeded with time and blended so it keeps the ground's tone", () => {
    const mesh = withGround("mesh");
    const grainy: Theme = { ...mesh, ground: { ...mesh.ground, grain: 0.18 } };
    const html = at(grainy, 500);
    expect(html).toContain(`seed="${grainSeed(grainy, 500)}"`);
    expect(html).toContain('opacity="0.18"');
    expect(html).toContain("mix-blend-mode:overlay");
    expect(at(grainy, 500)).not.toBe(at(grainy, 600));
    expect(at(mesh, 500)).not.toContain("feTurbulence");
  });
});

describe("meshBlobs", () => {
  const mesh = withGround("mesh");

  it.each(ASPECTS)("places the theme's blobs, 900-1200 px across, at 10-22%% alpha, spread over the %s frame", (aspect) => {
    const { width, height } = frameSize(aspect);
    const { blobs: count, minPx, maxPx, minAlpha, maxAlpha } = mesh.ground.mesh;
    expect([count, minPx, maxPx, minAlpha, maxAlpha]).toEqual([3, 900, 1200, 0.1, 0.22]);
    const blobs = meshBlobs(mesh, aspect, 0);
    expect(blobs).toHaveLength(count);
    for (const blob of blobs) {
      expect(blob.size).toBeGreaterThanOrEqual(minPx);
      expect(blob.size).toBeLessThanOrEqual(maxPx);
      expect(blob.alpha).toBeGreaterThanOrEqual(minAlpha);
      expect(blob.alpha).toBeLessThanOrEqual(maxAlpha);
      expect(blob.homeX).toBeGreaterThan(0);
      expect(blob.homeX).toBeLessThan(width);
      expect(blob.homeY).toBeGreaterThan(0);
      expect(blob.homeY).toBeLessThan(height);
    }
    // No two blobs rest on top of each other.
    for (let i = 0; i < blobs.length; i++) {
      for (let j = i + 1; j < blobs.length; j++) {
        const gap = Math.hypot(blobs[i]!.homeX - blobs[j]!.homeX, blobs[i]!.homeY - blobs[j]!.homeY);
        expect(gap).toBeGreaterThan(Math.min(width, height) / 3);
      }
    }
  });

  it("is the same for the same moment and seed, and differs by seed", () => {
    expect(meshBlobs(mesh, "9:16", 1234)).toEqual(meshBlobs(mesh, "9:16", 1234));
    expect(meshBlobs(withGround("mesh", 2), "9:16", 1234)).not.toEqual(meshBlobs(mesh, "9:16", 1234));
  });

  it("wanders each blob up to motion.drift.px from home along a seeded loop of 4-6 s, visibly within a second", () => {
    const { px, minMs, maxMs } = mesh.motion.drift;
    expect([px, minMs, maxMs]).toEqual([60, 4000, 6000]);
    const rest = meshBlobs(mesh, "16:9", 0);
    expect(new Set(rest.map((b) => b.periodMs)).size).toBe(rest.length);
    rest.forEach((blob, i) => {
      expect(blob.periodMs).toBeGreaterThanOrEqual(minMs);
      expect(blob.periodMs).toBeLessThanOrEqual(maxMs);
      let furthest = 0;
      for (let ms = 0; ms <= 12_000; ms += 50) {
        const now = meshBlobs(mesh, "16:9", ms)[i]!;
        expect([now.homeX, now.homeY, now.size, now.color, now.alpha]).toEqual([blob.homeX, blob.homeY, blob.size, blob.color, blob.alpha]);
        expect(Math.abs(now.x - now.homeX)).toBeLessThanOrEqual(px);
        expect(Math.abs(now.y - now.homeY)).toBeLessThanOrEqual(px);
        furthest = Math.max(furthest, Math.hypot(now.x - now.homeX, now.y - now.homeY));
      }
      expect(furthest, `blob ${i} wanders`).toBeGreaterThan(px / 3);
      // A loop: one period later it is back where it was.
      const now = meshBlobs(mesh, "16:9", 777)[i]!;
      const later = meshBlobs(mesh, "16:9", 777 + blob.periodMs)[i]!;
      expect(later.x).toBeCloseTo(now.x, 6);
      expect(later.y).toBeCloseTo(now.y, 6);
      // A second later it has moved.
      const next = meshBlobs(mesh, "16:9", 1777)[i]!;
      expect(Math.hypot(next.x - now.x, next.y - now.y)).toBeGreaterThan(1);
    });
  });
});

/** The ground the frame shows at (x, y) under `blobs`: each blob over the last, at its strength there, as drawn. */
function groundAt(theme: Theme, blobs: readonly MeshBlob[], x: number, y: number): string {
  return blobs.reduce((color, b) => mixColors(color, b.color, b.alpha * meshFalloff(Math.hypot(x - b.x, y - b.y) / (b.size / 2))), theme.colors.ground);
}

/** Every ground colour the mesh shows at points 60 px apart over the frame and at each blob's center, every `stepMs` for 6 s. */
function groundsSeen(theme: Theme, aspect: Aspect, stepMs = 500): string[] {
  const { width, height } = frameSize(aspect);
  const seen = new Set<string>();
  for (let ms = 0; ms <= 6000; ms += stepMs) {
    const blobs = meshBlobs(theme, aspect, ms);
    for (const b of blobs) seen.add(groundAt(theme, blobs, b.x, b.y));
    for (let y = 30; y < height; y += 60) for (let x = 30; x < width; x += 60) seen.add(groundAt(theme, blobs, x, y));
  }
  return [...seen];
}

describe("meshLayout", () => {
  it("paints the blobs in the accent and a lighter tint of it, where the accent can take it", () => {
    const [first, second] = meshLayout(withGround("mesh", 1, darkTheme), "9:16");
    const { ground, accent } = darkTheme.colors;
    expect(first!.color).toBe(accent);
    expect(contrastRatio(second!.color, ground)).toBeGreaterThan(contrastRatio(accent, ground));
  });

  const ACCENTS = [undefined, "#22c55e", "#ffd400", "#7c3aed"];
  const cases = [lightTheme, darkTheme, neutralTheme].flatMap((base) =>
    ACCENT_INTENSITIES.flatMap((accentIntensity) =>
      ACCENTS.map((accent) => {
        const theme = resolveTheme(
          board({ theme: base.name, accentIntensity, ...(accent === undefined ? {} : { accent }), themeOverrides: { ground: { style: "mesh" } } }),
        );
        return [`${base.name} ${accentIntensity} ${accent ?? "accent"}`, theme] as const;
      }),
    ),
  );

  it.each(cases)("keeps text, muted text and accent text at AA everywhere on the frame as the blobs drift (%s)", (_, theme) => {
    const roles = [theme.colors.text, theme.colors.textMuted, accentInk(theme)];
    for (const aspect of ASPECTS) {
      for (const ground of groundsSeen(theme, aspect, 1000)) {
        for (const role of roles) {
          const floor = Math.min(4.5, contrastRatio(role, theme.colors.ground));
          expect(contrastRatio(role, ground), `${aspect}: ${role} on ${ground}`).toBeGreaterThanOrEqual(floor);
        }
      }
      for (const blob of meshLayout(theme, aspect)) {
        expect(blob.alpha).toBeGreaterThanOrEqual(theme.ground.mesh.minAlpha);
        expect(blob.alpha).toBeLessThanOrEqual(theme.ground.mesh.maxAlpha);
      }
    }
  });

  it.each(ASPECTS)("still shows on the light theme's flat ground (%s)", (aspect) => {
    const theme = withGround("mesh");
    const blobs = meshBlobs(theme, aspect, 0);
    const ground = parseHex(lightTheme.colors.ground);
    for (const b of blobs) {
      const shown = parseHex(groundAt(theme, blobs, b.x, b.y));
      expect(Math.max(...shown.map((c, i) => Math.abs(c - ground[i]!)))).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("groundTint", () => {
  it("is nothing for grounds that do not move under the text", () => {
    for (const style of ["solid", "vignette", "grid", "noise"] as const) expect(groundTint(withGround(style), "9:16")).toBeUndefined();
  });

  it.each(ASPECTS)("is no kinder to text than any ground the mesh shows, and text still reads on it (%s)", (aspect) => {
    for (const base of [lightTheme, darkTheme, neutralTheme]) {
      const theme = withGround("mesh", 1, base);
      const tint = groundTint(theme, aspect)!;
      expect(tint).toMatch(/^#[0-9a-f]{6}$/);
      expect(tint).not.toBe(base.colors.ground);
      const seen = Math.min(...groundsSeen(theme, aspect).map((g) => contrastRatio(base.colors.text, g)));
      expect(contrastRatio(base.colors.text, tint)).toBeLessThanOrEqual(seen + 1e-9);
      for (const role of [base.colors.textMuted, accentInk(theme)]) expect(contrastRatio(role, tint)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("gridBreath", () => {
  const grid = withGround("grid");

  it("breathes scale and opacity 1 <-> 1.04 over 8 s, sine in-out", () => {
    expect(grid.motion["grid.breathe"]).toEqual({ ms: 8000, scale: 1.04, curve: "sineInOut" });
    expect(gridBreath(grid, 0)).toEqual({ scale: 1, opacity: 1 / 1.04 });
    expect(gridBreath(grid, 4000)).toEqual({ scale: 1.04, opacity: 1 });
    expect(gridBreath(grid, 8000)).toEqual(gridBreath(grid, 0));
    expect(gridBreath(grid, 2000).scale).toBeCloseTo(1.02, 9);
    for (let ms = 0; ms <= 16_000; ms += 250) {
      const { scale, opacity } = gridBreath(grid, ms);
      expect(scale).toBeGreaterThanOrEqual(1);
      expect(scale).toBeLessThanOrEqual(1.04);
      expect(opacity).toBeCloseTo(scale / 1.04, 12);
    }
  });
});

describe("grainSeed", () => {
  it("re-seeds the grain 12 times a second, the same for the same moment and seed", () => {
    const theme = withGround("grid");
    expect(theme.motion.grainFps).toBe(12);
    const tick = 1000 / 12;
    expect(grainSeed(theme, 0)).toBe(grainSeed(theme, tick - 1));
    expect(grainSeed(theme, tick)).not.toBe(grainSeed(theme, 0));
    expect(grainSeed(theme, 2 * tick)).not.toBe(grainSeed(theme, tick));
    expect(grainSeed(theme, 1000)).toBe(grainSeed(theme, 1000));
    expect(grainSeed(withGround("grid", 2), 1000)).not.toBe(grainSeed(theme, 1000));
    expect(Number.isInteger(grainSeed(theme, 1000))).toBe(true);
    expect(grainSeed(theme, 1000)).toBeGreaterThanOrEqual(0);
  });
});

function board(input: Record<string, unknown> = {}): Storyboard {
  const result = validateStoryboard({
    title: "T",
    aspect: "9:16",
    scenes: [{ id: "a", component: "TitleCard", props: { title: "Hello" }, durationMs: 1000 }],
    ...input,
  });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

describe("Frame", () => {
  const frameHtml = (sb: Storyboard, frame: number) =>
    renderToStaticMarkup(createElement(Frame, { storyboard: sb, theme: resolveTheme(sb), timeline: buildTimeline(sb, {}), frame }));

  it("paints the ground color and draws the ground layer under the scene", () => {
    const sb = board();
    const theme = resolveTheme(sb);
    const html = frameHtml(sb, 10);
    expect(html).toContain(`background-color:${theme.colors.ground}`);
    const ground = html.indexOf(`data-ground="${theme.ground.style}"`);
    expect(ground).toBeGreaterThan(-1);
    expect(ground).toBeLessThan(html.indexOf("Hello"));
  });

  it("draws the ground at the frame's moment in the video, so it keeps moving across scenes", () => {
    const sb = board({
      themeOverrides: { ground: { style: "mesh" } },
      scenes: [
        { id: "a", component: "TitleCard", props: { title: "Hello" }, durationMs: 1000 },
        { id: "b", component: "TitleCard", props: { title: "Again" }, durationMs: 1000 },
      ],
    });
    const theme = resolveTheme(sb);
    const ground = (frame: number) => renderToStaticMarkup(<Ground theme={theme} aspect="9:16" ms={(frame * 1000) / sb.fps} />);
    for (const frame of [0, 10, 45]) expect(frameHtml(sb, frame)).toContain(ground(frame));
    expect(frameHtml(sb, 45)).toBe(frameHtml(sb, 45));
    expect(ground(15)).not.toBe(ground(45));
  });
});

describe("accent intensity in components", () => {
  const bold = resolveTheme(board({ accentIntensity: "bold" }));

  it("subtle keeps headlines in the text color", () => {
    const html = renderToStaticMarkup(<TitleCard progress={0.5} theme={lightTheme} aspect="9:16" title="Ship it" />);
    expect(html).toMatch(new RegExp(`<h1[^>]*color:${lightTheme.colors.text}`));
  });

  it("bold paints headlines and stats in the accent, deepened where needed to read", () => {
    const title = renderToStaticMarkup(<TitleCard progress={0.5} theme={bold} aspect="9:16" title="Ship it" />);
    expect(title).toMatch(new RegExp(`<h1[^>]*color:${accentInk(bold)}`));
    const stat = renderToStaticMarkup(<BigNumber progress={0.5} theme={bold} aspect="9:16" value={42} />);
    expect(stat).toMatch(new RegExp(`<h1[^>]*color:${accentInk(bold)}`));
    // The dark theme's accent already reads, so it is used as is.
    const dark = resolveTheme(board({ theme: "dark", accentIntensity: "bold" }));
    expect(renderToStaticMarkup(<TitleCard progress={0.5} theme={dark} aspect="9:16" title="Ship it" />)).toMatch(new RegExp(`<h1[^>]*color:${dark.colors.accent}`));
  });

  it("bold fills cards with the accent and labels them in accentText", () => {
    const html = renderToStaticMarkup(<FlowDiagram progress={0.5} theme={bold} aspect="16:9" nodes={["A", "B"]} />);
    expect(html).toContain(`background-color:${bold.colors.accent}`);
    expect(html).toContain(`color:${bold.colors.accentText}`);
  });
});
