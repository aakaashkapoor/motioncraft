// The shine (design v3, life #9): a diagonal band of light, transparent ->
// white 35% -> transparent, 30% of the element's width and leaning 20 deg,
// crosses the element once in 800 ms on (0.6, 0.6, 0, 1), clipped to its
// radius. It never loops.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Shine, bezier, lightTheme, shineBand, shineGradient, shineText, type ShineBand } from "../src/index";

const theme = lightTheme;
const { shine } = theme.motion;
const size = { width: 840, height: 300 };
const tan = Math.tan((shine.skewDeg * Math.PI) / 180);
/** How far the band's middle travels from the element's center: until no part of the leaning band is over it. */
const reach = size.width / 2 + (size.width * shine.widthShare) / 2 + (tan * size.height) / 2;
const ease = bezier(0.6, 0.6, 0, 1);

/** The band's left and right edges at the element's top and bottom, px from its center. */
function edges(band: ShineBand) {
  const lean = (tan * size.height) / 2;
  return { topRight: band.center + band.width / 2 + lean, bottomLeft: band.center - band.width / 2 - lean };
}

describe("shineBand", () => {
  it("is 30% of the element's width", () => {
    expect(shineBand(theme, size, 0)?.width).toBeCloseTo(size.width * 0.3, 6);
  });

  it("starts just clear of the element's left edge and crosses to its right on (0.6, 0.6, 0, 1)", () => {
    expect(shineBand(theme, size, 0)!.center).toBeCloseTo(-reach, 6);
    for (const ms of [100, 200, 400, 600, 799]) {
      expect(shineBand(theme, size, ms)!.center, `at ${ms} ms`).toBeCloseTo(-reach + 2 * reach * ease(ms / shine.ms), 6);
    }
    // Halfway through its time, the curve has the band well past the middle.
    expect(shineBand(theme, size, 400)!.center).toBeGreaterThan(0);
    expect(shineBand(theme, size, 799)!.center).toBeCloseTo(reach, 0);
  });

  it("is off the element at both ends of the crossing, leaning band and all", () => {
    expect(edges(shineBand(theme, size, 0)!).topRight).toBeLessThanOrEqual(-size.width / 2 + 1e-9);
    expect(edges(shineBand(theme, size, shine.ms - 0.001)!).bottomLeft).toBeGreaterThanOrEqual(size.width / 2 - 0.01);
  });

  it("only moves forward", () => {
    const centers = Array.from({ length: 81 }, (_, i) => shineBand(theme, size, i * 10 - 0.5 * (i === 80 ? 1 : 0))!.center);
    for (let i = 1; i < centers.length; i++) expect(centers[i]!).toBeGreaterThan(centers[i - 1]!);
  });

  it("crosses once and never loops", () => {
    expect(shineBand(theme, size, -1)).toBeUndefined();
    for (const ms of [shine.ms, shine.ms + 1, 2 * shine.ms, 2 * shine.ms + 400, 60_000]) expect(shineBand(theme, size, ms), `at ${ms} ms`).toBeUndefined();
  });

  it("is off when the shine token has no duration", () => {
    const off = { ...theme, motion: { ...theme.motion, shine: { ...shine, ms: 0 } } };
    expect(shineBand(off, size, 0)).toBeUndefined();
  });
});

describe("shineGradient", () => {
  it("draws transparent -> white 35% -> transparent across the band, leaning 20 deg", () => {
    const band = { center: 100, width: 252 };
    const css = shineGradient(theme, band);
    const s = Math.sin((110 * Math.PI) / 180);
    const stops = [...css.matchAll(/calc\(50% \+ (-?[\d.]+)px\)/g)].map((m) => parseFloat(m[1]!));
    expect(css.startsWith("linear-gradient(110deg, transparent calc(")).toBe(true);
    expect(css).toContain("rgba(255, 255, 255, 0.35) calc(");
    expect(stops).toHaveLength(3);
    // Along the gradient's line, the band is its width times sin(110deg): its edges are lines 20 deg off vertical.
    expect(stops[0]).toBeCloseTo((band.center - band.width / 2) * s, 1);
    expect(stops[1]).toBeCloseTo(band.center * s, 1);
    expect(stops[2]).toBeCloseTo((band.center + band.width / 2) * s, 1);
  });
});

describe("Shine", () => {
  const draw = (elapsedMs: number) => renderToStaticMarkup(<Shine theme={theme} size={size} elapsedMs={elapsedMs} radius={28} />);

  it("lays the band over its box, clipped to the box's radius", () => {
    const html = draw(400);
    expect(html).toMatch(/^<div data-shine=""/);
    expect(html).toContain("position:absolute;left:0;top:0;width:100%;height:100%");
    expect(html).toContain("border-radius:28px");
    expect(html).toContain("pointer-events:none");
    expect(html).toContain(`background-image:${shineGradient(theme, shineBand(theme, size, 400)!)}`);
  });

  it("draws nothing before it starts or once it has crossed", () => {
    expect(draw(-1)).toBe("");
    expect(draw(shine.ms)).toBe("");
    expect(draw(5000)).toBe("");
  });
});

describe("shineText", () => {
  it("paints text in its color with the band over it, through the glyphs", () => {
    const style = shineText(theme, size, 400, "#1c1b18")!;
    expect(style).toEqual({
      backgroundImage: `${shineGradient(theme, shineBand(theme, size, 400)!)}, linear-gradient(#1c1b18, #1c1b18)`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
    });
  });

  it("leaves the text alone before and after the crossing", () => {
    expect(shineText(theme, size, -1, "#1c1b18")).toBeUndefined();
    expect(shineText(theme, size, shine.ms, "#1c1b18")).toBeUndefined();
  });
});
