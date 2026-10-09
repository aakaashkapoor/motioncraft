import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  Card,
  NOMINAL_SCENE_MS,
  CardRow,
  FeatureList,
  cardRowLayout,
  cardRowTiming,
  contentArea,
  featureListTiming,
  kit,
  lightTheme,
  neutralTheme,
  resolveTheme,
  type Aspect,
  type CardData,
} from "../src/index";

/** Parses an inline `style="..."` attribute into a map. */
function parseStyle(style: string): Map<string, string> {
  return new Map(
    style
      .split(";")
      .filter((d) => d.includes(":"))
      .map((d) => {
        const i = d.indexOf(":");
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as const;
      }),
  );
}

/** Inline styles of every element carrying `attr`, in document order. */
function stylesOf(html: string, attr: string): Array<Map<string, string>> {
  return [...html.matchAll(new RegExp(`<[a-z]+[^>]*?${attr}[^>]*?style="([^"]*)"`, "g"))].map((m) => parseStyle(m[1]!));
}

function rootStyle(html: string): Map<string, string> {
  const style = /^<[a-z]+[^>]*?style="([^"]*)"/.exec(html)?.[1];
  if (style === undefined) throw new Error(`no root style in ${html}`);
  return parseStyle(style);
}

const px = (decls: Map<string, string>, key: string): number => {
  const value = decls.get(key);
  if (value === undefined) throw new Error(`no ${key}`);
  return parseFloat(value);
};

const opacityOf = (decls: Map<string, string>) => parseFloat(decls.get("opacity") ?? "1");

/** The progress `ms` into a scene drawn without a clock. */
const atMs = (ms: number) => ms / NOMINAL_SCENE_MS;

function expectInsideArea(html: string, aspect: Aspect, attr: string) {
  const area = contentArea(neutralTheme, aspect);
  const root = rootStyle(html);
  expect(px(root, "left")).toBeGreaterThanOrEqual(area.x);
  expect(px(root, "top")).toBeGreaterThanOrEqual(area.y);
  expect(px(root, "left") + px(root, "width")).toBeLessThanOrEqual(area.x + area.width);
  expect(px(root, "top") + px(root, "height")).toBeLessThanOrEqual(area.y + area.height);
  for (const cell of stylesOf(html, attr)) {
    expect(px(cell, "left")).toBeGreaterThanOrEqual(0);
    expect(px(cell, "top")).toBeGreaterThanOrEqual(0);
    expect(px(cell, "left") + px(cell, "width")).toBeLessThanOrEqual(area.width + 0.01);
    expect(px(cell, "top") + px(cell, "height")).toBeLessThanOrEqual(area.height + 0.01);
  }
}

const CARDS: CardData[] = [
  { icon: "terminal", title: "Write", subtitle: "Describe the video" },
  { icon: "code", title: "Build", subtitle: "Scenes from the kit" },
  { icon: "check", title: "Check", subtitle: "Layout and contrast" },
  { icon: "chat", title: "Ship", subtitle: "Narrated MP4" },
];

const cardsOf = (count: number): CardData[] =>
  Array.from({ length: count }, (_, i) => ({ icon: "check", title: `Card ${i + 1}`, subtitle: "A short line of detail" }));

describe("Card", () => {
  it("is registered in the kit", () => {
    expect(kit.Card).toBe(Card);
  });

  it.each(ASPECTS)("draws icon, title, subtitle and step inside the content area (%s)", (aspect) => {
    const html = renderToStaticMarkup(
      <Card progress={0.5} theme={neutralTheme} aspect={aspect} icon="shield" title="Safe" subtitle="Runs locally" step={2} />,
    );
    expect(html).toContain("Safe");
    expect(html).toContain("Runs locally");
    expect(html).toContain(">2<");
    expect(html).toContain("<svg");
    expectInsideArea(html, aspect, "data-card=");
  });

  it("throws on an unknown icon name", () => {
    expect(() =>
      renderToStaticMarkup(<Card progress={0.5} theme={neutralTheme} aspect="9:16" icon="nope" title="X" />),
    ).toThrow(/Unknown icon "nope"/);
  });

  it("uses the theme radius, a hairline border and the card shadow", () => {
    const html = renderToStaticMarkup(<Card progress={0.5} theme={lightTheme} aspect="16:9" title="Plain" />);
    const face = stylesOf(html, "data-card-face")[0]!;
    expect(face.get("border-radius")).toBe(`${lightTheme.radius.md}px`);
    expect(face.get("border")).toBe(`${lightTheme.hairline}px solid ${lightTheme.colors.border}`);
    expect(face.get("background-color")).toBe(lightTheme.colors.surface);
    expect(face.get("box-shadow")).toContain(`${lightTheme.cardShadow.blur}px`);
  });

  it("lights up in the accent when highlighted", () => {
    const plain = renderToStaticMarkup(<Card progress={0.5} theme={neutralTheme} aspect="9:16" title="A" step={1} />);
    const lit = renderToStaticMarkup(<Card progress={0.5} theme={neutralTheme} aspect="9:16" title="A" step={1} highlighted />);
    expect(plain).toContain('data-highlighted="false"');
    expect(lit).toContain('data-highlighted="true"');
    expect(stylesOf(lit, "data-card-face")[0]!.get("box-shadow")).toContain(neutralTheme.colors.accent);
    expect(stylesOf(plain, "data-card-face")[0]!.get("box-shadow")).not.toContain(neutralTheme.colors.accent);
  });

  it("fills the highlighted card with the accent at bold intensity", () => {
    const bold = resolveTheme({ theme: "light", accentIntensity: "bold" });
    const lit = renderToStaticMarkup(<Card progress={0.5} theme={bold} aspect="9:16" title="A" subtitle="B" highlighted />);
    expect(stylesOf(lit, "data-card-face")[0]!.get("background-color")).toBe(bold.colors.accent);
  });

  it("springs in on the scene's lead and fades out", () => {
    const card = (p: number) => stylesOf(renderToStaticMarkup(<Card progress={p} theme={neutralTheme} aspect="9:16" title="A" />), "data-card=")[0]!;
    const { leadMs, fx, enter } = neutralTheme.motion;
    expect(opacityOf(card(0))).toBeCloseTo(0, 3);
    expect(opacityOf(card(atMs(leadMs)))).toBeCloseTo(0, 3);
    // Opacity is in after the fx fade; the spring is still moving.
    expect(opacityOf(card(atMs(leadMs + fx.ms)))).toBeCloseTo(1, 3);
    expect(card(atMs(leadMs + fx.ms)).get("transform")).not.toBe("translateY(0px) scale(1)");
    expect(card(atMs(leadMs + enter.ms)).get("transform")).toBe("translateY(0px) scale(1)");
    expect(opacityOf(card(0.5))).toBeCloseTo(1, 3);
    expect(opacityOf(rootStyle(renderToStaticMarkup(<Card progress={1} theme={neutralTheme} aspect="9:16" title="A" />)))).toBeCloseTo(0, 3);
  });
});

describe("CardRow", () => {
  const render = (aspect: Aspect, progress: number, extra: { cards?: CardData[]; highlight?: number } = {}) =>
    renderToStaticMarkup(<CardRow progress={progress} theme={neutralTheme} aspect={aspect} cards={CARDS} {...extra} />);

  it("is registered in the kit", () => {
    expect(kit.CardRow).toBe(CardRow);
  });

  const counts = [2, 3, 4, 5, 6];
  it.each(ASPECTS.flatMap((aspect) => counts.map((n) => [aspect, n] as const)))(
    "lays %s cards out inside the content area (%i cards)",
    (aspect, count) => {
      const html = render(aspect, 0.7, { cards: cardsOf(count) });
      expect(stylesOf(html, "data-card=")).toHaveLength(count);
      expectInsideArea(html, aspect, "data-card=");
    },
  );

  it("puts the cards in one row in 16:9", () => {
    const layout = cardRowLayout(neutralTheme, "16:9", cardsOf(5));
    expect(new Set(layout.cells.map((c) => c.y)).size).toBe(1);
    for (let i = 1; i < 5; i++) expect(layout.cells[i]!.x).toBeGreaterThan(layout.cells[i - 1]!.x);
  });

  it("stacks up to 3 cards and uses a 2-column grid for more in 9:16", () => {
    const stack = cardRowLayout(neutralTheme, "9:16", cardsOf(3));
    expect(new Set(stack.cells.map((c) => c.x)).size).toBe(1);
    expect(stack.orientation).toBe("row");
    const grid = cardRowLayout(neutralTheme, "9:16", cardsOf(6));
    expect(new Set(grid.cells.map((c) => c.x)).size).toBe(2);
    expect(new Set(grid.cells.map((c) => c.y)).size).toBe(3);
  });

  it("rejects fewer than 2 or more than 6 cards", () => {
    expect(() => cardRowLayout(neutralTheme, "16:9", cardsOf(1))).toThrow(/2-6 cards/);
    expect(() => cardRowLayout(neutralTheme, "16:9", cardsOf(7))).toThrow(/2-6 cards/);
  });

  it("brings cards in one after another, in order", () => {
    const timing = cardRowTiming(neutralTheme, 4);
    const opacities = stylesOf(render("16:9", atMs(timing[1]![0] + 50)), "data-card=").map(opacityOf);
    expect(opacities[0]).toBeGreaterThan(opacities.at(-1)!);
    for (let i = 1; i < opacities.length; i++) expect(opacities[i]).toBeLessThanOrEqual(opacities[i - 1]!);
    for (let i = 1; i < 4; i++) expect(timing[i]![0] - timing[i - 1]![0]).toBe(neutralTheme.motion.enter.staggerMs);
    for (const o of stylesOf(render("16:9", 0.7), "data-card=").map(opacityOf)) expect(o).toBeCloseTo(1, 3);
  });

  it("starts the cascade on the scene's lead and lands it in about the first 1.2 s, whatever the count", () => {
    const { leadMs, cascadeMs, enter } = neutralTheme.motion;
    for (const count of [2, 3, 4, 5, 6]) {
      const timing = cardRowTiming(neutralTheme, count);
      expect(timing[0]![0]).toBe(leadMs);
      for (const [start, end] of timing) expect(end - start).toBe(enter.ms);
      expect(timing.at(-1)![1]).toBeLessThanOrEqual(cascadeMs + 1e-9);
    }
  });

  it("pops the highlighted card only after every card has landed", () => {
    const lit = (p: number) => [...render("16:9", p, { highlight: 2 }).matchAll(/data-highlighted="(\w+)"/g)].map((m) => m[1]);
    const landed = Math.max(...cardRowTiming(neutralTheme, CARDS.length).map(([, end]) => end));
    expect(lit(atMs(landed - 10))).toEqual(["false", "false", "false", "false"]);
    expect(lit(atMs(landed + neutralTheme.motion.pop.ms))).toEqual(["false", "false", "true", "false"]);
    expect(lit(0.85)).toEqual(["false", "false", "true", "false"]);
    expect(render("16:9", 0.85)).not.toContain('data-highlighted="true"');
  });

  it("uses icons by name", () => {
    const html = render("9:16", 0.7);
    expect(html.match(/<svg/g)).toHaveLength(CARDS.length);
    expect(() => render("9:16", 0.7, { cards: [{ icon: "nope", title: "X" }, ...CARDS] })).toThrow(/Unknown icon/);
  });
});

describe("FeatureList", () => {
  const ITEMS = [
    { icon: "shield", text: "Runs locally, no upload" },
    { icon: "code", text: "Every frame is code-drawn" },
    { icon: "check", text: "Checked for overflow and contrast" },
  ];
  const render = (aspect: Aspect, progress: number, items = ITEMS) =>
    renderToStaticMarkup(<FeatureList progress={progress} theme={neutralTheme} aspect={aspect} items={items} title="Why it works" />);

  it("is registered in the kit", () => {
    expect(kit.FeatureList).toBe(FeatureList);
  });

  it.each(ASPECTS)("renders every row inside the content area (%s)", (aspect) => {
    const html = render(aspect, 0.7);
    for (const item of ITEMS) expect(html).toContain(item.text);
    expect(html).toContain("Why it works");
    expect(stylesOf(html, "data-feature=")).toHaveLength(ITEMS.length);
    const area = contentArea(neutralTheme, aspect);
    const root = rootStyle(html);
    expect(px(root, "left")).toBeGreaterThanOrEqual(area.x);
    expect(px(root, "top") + px(root, "height")).toBeLessThanOrEqual(area.y + area.height);
    expect(px(root, "left") + px(root, "width")).toBeLessThanOrEqual(area.x + area.width);
  });

  it("draws each icon by name in a soft tinted circle", () => {
    const html = render("9:16", 0.7);
    expect(html.match(/<svg/g)).toHaveLength(ITEMS.length);
    const circles = stylesOf(html, "data-feature-icon");
    expect(circles).toHaveLength(ITEMS.length);
    for (const c of circles) {
      expect(c.get("border-radius")).toBe("50%");
      expect(c.get("background-color")).toMatch(/^rgba\(/);
    }
  });

  it("brings rows in one after another, after the title, in order", () => {
    const timing = featureListTiming(neutralTheme, ITEMS.length, true);
    const opacities = stylesOf(render("9:16", atMs(timing[1]![0] + 50)), "data-feature=").map(opacityOf);
    expect(opacities[0]).toBeGreaterThan(opacities.at(-1)!);
    for (let i = 1; i < opacities.length; i++) expect(opacities[i]).toBeLessThanOrEqual(opacities[i - 1]!);
    const { leadMs, cascadeMs } = neutralTheme.motion;
    expect(timing[0]![0]).toBeGreaterThan(leadMs);
    expect(featureListTiming(neutralTheme, ITEMS.length)[0]![0]).toBe(leadMs);
    const six = featureListTiming(neutralTheme, 6, true);
    for (let i = 1; i < 6; i++) expect(six[i]![0]).toBeGreaterThan(six[i - 1]![0]);
    expect(six.at(-1)![1]).toBeLessThanOrEqual(cascadeMs + 1e-9);
    for (const o of stylesOf(render("9:16", 0.7), "data-feature=").map(opacityOf)) expect(o).toBeCloseTo(1, 3);
  });

  it("is hidden at the start and gone at the end", () => {
    for (const o of stylesOf(render("16:9", 0), "data-feature=").map(opacityOf)) expect(o).toBeCloseTo(0, 3);
    expect(opacityOf(rootStyle(render("16:9", 1)))).toBeCloseTo(0, 3);
  });

  it("throws on an unknown icon name", () => {
    expect(() => render("9:16", 0.5, [{ icon: "nope", text: "x" }, ...ITEMS])).toThrow(/Unknown icon/);
  });
});
