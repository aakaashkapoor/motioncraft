// BentoGrid: a dashboard of 3-6 rounded stat cards in palette colours, laid
// out on a fixed template by card count and area shape, cascading in 70 ms
// apart, each card's own motion (count, ring, bars, toggle, keyframes)
// starting as it lands.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, SceneClockContext, contrastRatio, darkTheme, kit, lightTheme, neutralTheme, resolveTheme, sectionLayout, textColumn, type Aspect, type Rect } from "../src/index";
import { fieldTheme } from "../src/theme/field";
import { BENTO_FILLS, bentoFill, bentoGridErrors, bentoGridLayout, bentoTiming, type BentoCard } from "../src/kit/bentoGridPlan";
import type { Theme } from "../src/theme/types";

const FPS = 30;
const inside = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
const shift = (r: Rect, by: Rect): Rect => ({ ...r, x: r.x + by.x, y: r.y + by.y });

/** The five cards of the reference frame, and a sixth. */
const CARDS: BentoCard[] = [
  { kind: "stat", value: "+212%", label: "Reach this month", trend: [3, 4, 3.5, 6, 5.5, 9] },
  { kind: "title", text: "Motion that ships", toggle: true },
  { kind: "ring", percent: 7, label: "Rendered" },
  { kind: "bars", values: [4, 7, 5, 9, 6], label: "Weekly" },
  { kind: "quote", text: "Keyframes are a language.", track: true },
  { kind: "stat", value: "1,280", label: "Videos" },
];

const draw = (props: Record<string, unknown>, ms: number, theme: Theme = darkTheme, aspect: Aspect = "16:9", frames = 150) => {
  const Component = kit.BentoGrid!;
  const frame = Math.round((ms * FPS) / 1000);
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames }}>
      <Component {...props} progress={frame / (frames - 1)} theme={theme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
};

describe("props", () => {
  it("accepts 3-6 cards of the five kinds", () => {
    expect(bentoGridErrors({ cards: CARDS.slice(0, 5) })).toEqual([]);
    expect(bentoGridErrors({ cards: CARDS })).toEqual([]);
    expect(bentoGridErrors({ cards: CARDS.slice(0, 3).map((c) => ({ ...c, fill: "p3" })) })).toEqual([]);
  });

  it("rejects bad cards", () => {
    expect(bentoGridErrors({ cards: CARDS.slice(0, 2) })).toHaveLength(1);
    expect(bentoGridErrors({ cards: [...CARDS, CARDS[0]!] })).toHaveLength(1);
    expect(bentoGridErrors({ cards: [{ kind: "pie" }, ...CARDS.slice(0, 2)] })).toHaveLength(1);
    expect(bentoGridErrors({ cards: [{ kind: "stat", value: "123456789", label: "Too long" }, ...CARDS.slice(1, 3)] })).toHaveLength(1);
    expect(bentoGridErrors({ cards: [{ kind: "ring", percent: 120 }, ...CARDS.slice(1, 3)] })).toHaveLength(1);
    expect(bentoGridErrors({ cards: [{ kind: "bars", values: [1, 2] }, ...CARDS.slice(1, 3)] })).toHaveLength(1);
    expect(bentoGridErrors({ cards: [{ kind: "title", text: "Hi", fill: "#ff0000" }, ...CARDS.slice(1, 3)] })).toHaveLength(1);
  });

  it("throws on 7 cards", () => {
    expect(() => draw({ cards: [...CARDS, CARDS[1]!] }, 1000)).toThrow(/BentoGrid/);
  });
});

describe("layout", () => {
  describe.each(ASPECTS)("%s", (aspect) => {
    it.each([3, 4, 5, 6])("fits %i cards inside the content area without overlap", (count) => {
      for (const theme of [lightTheme, darkTheme]) {
        const layout = bentoGridLayout(theme, aspect, CARDS.slice(0, count));
        expect(inside(textColumn(theme, aspect), layout.box)).toBe(true);
        expect(layout.cards).toHaveLength(count);
        // Every card used once.
        expect(layout.cards.map((c) => c.index).sort()).toEqual(Array.from({ length: count }, (_, i) => i));
        const cells = layout.cards.map((c) => shift(c.cell, layout.box));
        for (const [i, a] of cells.entries()) {
          expect(inside(layout.box, a), `card ${i} ${JSON.stringify(a)}`).toBe(true);
          for (const b of cells.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
          for (const part of layout.cards[i]!.parts) expect(inside(layout.cards[i]!.cell, shift(part, layout.cards[i]!.cell)), `${layout.cards[i]!.kind} part ${JSON.stringify(part)}`).toBe(true);
        }
        // 24 px gaps at 1080p, between neighbours.
        const gaps = cells.flatMap((a) => cells.map((b) => b.x - (a.x + a.width))).filter((g) => g > 0);
        expect(Math.min(...gaps)).toBeCloseTo(theme.spacing.sm, 0);
      }
    });
  });

  it("gives the widest cells to the quote and the stat", () => {
    const layout = bentoGridLayout(darkTheme, "16:9", CARDS.slice(0, 5));
    const widest = [...layout.cards].sort((a, b) => b.cell.width - a.cell.width);
    expect(widest[0]!.kind).toBe("quote");
    expect(widest[1]!.kind).toBe("stat");
  });

  it("lays out inside a Section's slot", () => {
    for (const aspect of ASPECTS) {
      const slot = sectionLayout(neutralTheme, aspect, { headline: "A dashboard in the slot" }).content;
      const layout = bentoGridLayout(neutralTheme, aspect, CARDS.slice(0, 3), slot);
      expect(inside(slot, layout.box)).toBe(true);
    }
  });
});

describe("colour", () => {
  const reel = (theme: string) => resolveTheme({ theme, palette: "reel" });
  const grounds = ["ground", "p1", "p2", "p3", "p4"] as const;
  const themes: Array<[string, Theme]> = [
    ["light", lightTheme],
    ["dark", darkTheme],
    ...grounds.map((g): [string, Theme] => [`reel on ${g}`, fieldTheme(reel("dark"), g)]),
    ...(["editorial", "pastel", "mono", "brand"] as const).map((p): [string, Theme] => [p, resolveTheme({ theme: "light", palette: p })]),
  ];

  it.each(themes)("every fill's ink meets AA on it (%s)", (_, theme) => {
    for (const fill of BENTO_FILLS) {
      const { color, ink } = bentoFill(theme, fill);
      expect(contrastRatio(ink, color), `${fill}: ${ink} on ${color}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses the palette swatch and its ink", () => {
    const theme = reel("dark");
    expect(bentoFill(theme, "p1")).toEqual({ color: theme.colors.palette!.p1, ink: theme.colors.palette!.onP1 });
    expect(bentoFill(theme, "text")).toEqual({ color: theme.colors.text, ink: theme.colors.ground });
  });
});

describe("motion", () => {
  it("cascades cards 70 ms apart from the lead", () => {
    const t = bentoTiming(darkTheme, 5);
    expect(t.starts[0]).toBeGreaterThanOrEqual(100);
    expect(t.starts[0]).toBeLessThanOrEqual(200);
    for (let i = 1; i < 5; i++) expect(t.starts[i]! - t.starts[i - 1]!).toBe(70);
    for (let i = 0; i < 5; i++) {
      expect(t.inner[i]!).toBeGreaterThan(t.starts[i]!);
      expect(t.inner[i]! + t.innerMs[i]!).toBeLessThanOrEqual(1500);
    }
  });

  it.each(ASPECTS)("the stat counts up to its value by 1.5 s (%s)", (aspect) => {
    // The stat last in the cascade, so it lands latest.
    const cards = [CARDS[1]!, CARDS[2]!, CARDS[3]!, CARDS[4]!, { kind: "stat", value: "+212%", label: "Reach" }];
    const text = (ms: number) => [...draw({ cards }, ms, darkTheme, aspect).matchAll(/data-bento-value=""[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(text(1500)).toEqual(["+212%"]);
    expect(text(500)[0]).not.toBe("+212%");
    expect(text(500)[0]).toMatch(/^\+\d+%$/);
  });

  it("is invisible before the lead and fully drawn once settled", () => {
    const early = draw({ cards: CARDS.slice(0, 5) }, 0);
    expect(early).toContain("opacity:0");
    const late = draw({ cards: CARDS.slice(0, 5) }, 2000);
    expect(late).toContain("Keyframes are a language.");
  });
});
