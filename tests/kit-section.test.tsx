import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SANS_FAMILY } from "../src/render/fonts";
import { ASPECTS, Section, contentArea, kit, lightTheme, neutralTheme, sectionLayout, sectionTiming, type Aspect, type Rect } from "../src/index";

/** Parses an inline `style="..."` attribute into a map. */
function parseStyle(style: string): Map<string, string> {
  return new Map(
    style
      .split(";")
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(":");
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as const;
      }),
  );
}

interface Part {
  part: string;
  style: Map<string, string>;
  /** Text inside the element, tags stripped. */
  text: string;
}

/** Every element marked `data-section-part`, in document order. */
function parts(html: string): Part[] {
  return [...html.matchAll(/<(\w+) data-section-part="(\w+)"[^>]*?style="([^"]*)"[^>]*>/g)].map((m) => {
    const from = m.index + m[0].length;
    const inner = html.slice(from, html.indexOf(`</${m[1]}>`, from));
    return { part: m[2]!, style: parseStyle(m[3]!), text: inner.replace(/<[^>]+>/g, "") };
  });
}

const num = (style: Map<string, string>, key: string): number => {
  const value = style.get(key);
  if (value === undefined) throw new Error(`no ${key} in style`);
  return parseFloat(value);
};

const boxOf = (style: Map<string, string>): Rect => ({
  x: num(style, "left"),
  y: num(style, "top"),
  width: num(style, "width"),
  height: num(style, "height"),
});

/** The style of the first element after the content slot marker: the nested component's root. */
function nestedRoot(html: string): Map<string, string> {
  const m = /data-section-part="content"[^>]*><(\w+)[^>]*?style="([^"]*)"/.exec(html);
  if (m?.[2] === undefined) throw new Error(`no nested content in ${html}`);
  return parseStyle(m[2]);
}

const inside = (outer: Rect, inner: Rect) => {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 0.5);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 0.5);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 0.5);
};

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const HEADLINE = "Ship videos without an editor";
const BIG_NUMBER = { component: "BigNumber", props: { value: 12500, label: "Monthly users" } };

const render = (aspect: Aspect, progress: number, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <Section
      progress={progress}
      theme={neutralTheme}
      aspect={aspect}
      eyebrow="Why it matters"
      headline={HEADLINE}
      content={BIG_NUMBER}
      note="Numbers from the 2026 survey"
      {...extra}
    />,
  );

/** Opacity of each part at `progress`: eyebrow, every headline word, content, note. */
function opacities(aspect: Aspect, progress: number) {
  const html = render(aspect, progress);
  const ps = parts(html);
  const of = (name: string) => ps.filter((p) => p.part === name).map((p) => num(p.style, "opacity"));
  return {
    eyebrow: of("eyebrow")[0]!,
    words: of("word"),
    content: num(nestedRoot(html), "opacity"),
    note: of("note")[0]!,
  };
}

describe("Section", () => {
  it("is registered in the kit", () => {
    expect(kit.Section).toBe(Section);
  });

  it.each(ASPECTS)("renders eyebrow, headline, content and note (%s)", (aspect) => {
    const html = render(aspect, 0.6);
    expect(html).toContain("Why it matters");
    expect(html).toContain("Numbers from the 2026 survey");
    expect(html).toContain("Monthly users");
    const words = parts(html).filter((p) => p.part === "word").map((p) => p.text);
    expect(words).toEqual(HEADLINE.split(" "));
    expect(parts(html).map((p) => p.part)).toEqual(expect.arrayContaining(["eyebrow", "headline", "note"]));
  });

  it.each(ASPECTS)("keeps every part inside the content area, without overlaps (%s)", (aspect) => {
    const area = contentArea(neutralTheme, aspect);
    const layout = sectionLayout(neutralTheme, aspect, { eyebrow: "Why it matters", headline: HEADLINE, note: "Numbers from the 2026 survey" });
    const rects = [layout.eyebrow!, layout.headline, layout.content, layout.note!];
    for (const rect of rects) inside(area, rect);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
    }

    const html = render(aspect, 0.6);
    const ps = parts(html);
    for (const name of ["eyebrow", "headline", "note"]) {
      const rect = boxOf(ps.find((p) => p.part === name)!.style);
      inside(area, rect);
    }
    // The nested component fills the content slot, not the whole content area.
    expect(boxOf(nestedRoot(html))).toEqual(layout.content);
  });

  it("puts narrow content beside the headline in 16:9 and below it in 9:16", () => {
    const text = { eyebrow: "Why it matters", headline: HEADLINE, note: "Numbers from the 2026 survey" };
    const wide = sectionLayout(neutralTheme, "16:9", text);
    expect(wide.arrangement).toBe("beside");
    expect(wide.content.x).toBeGreaterThanOrEqual(wide.headline.x + wide.headline.width);
    const tall = sectionLayout(neutralTheme, "9:16", text);
    expect(tall.arrangement).toBe("below");
    expect(tall.content.y).toBeGreaterThanOrEqual(tall.headline.y + tall.headline.height);
  });

  it("puts wide content below the headline in 16:9", () => {
    const layout = sectionLayout(neutralTheme, "16:9", { headline: HEADLINE }, "wide");
    expect(layout.arrangement).toBe("below");
    expect(layout.content.y).toBeGreaterThanOrEqual(layout.headline.y + layout.headline.height);
    expect(layout.content.width).toBe(contentArea(neutralTheme, "16:9").width);
  });

  it.each(ASPECTS)("enters in order: eyebrow, headline words, content, note (%s)", (aspect) => {
    const start = opacities(aspect, 0);
    expect([start.eyebrow, ...start.words, start.content, start.note].every((o) => o === 0)).toBe(true);

    // Sample the entrance: each part starts showing no earlier than the one before it.
    const firstSeen = (pick: (o: ReturnType<typeof opacities>) => number) => {
      for (let p = 0; p <= 1; p += 0.01) if (pick(opacities(aspect, p)) > 0.01) return p;
      return Infinity;
    };
    const order = [
      firstSeen((o) => o.eyebrow),
      ...HEADLINE.split(" ").map((_, i) => firstSeen((o) => o.words[i]!)),
      firstSeen((o) => o.content),
      firstSeen((o) => o.note),
    ];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]!);
    expect(order.at(-1)).toBeLessThan(0.6);

    const middle = opacities(aspect, 0.7);
    expect([middle.eyebrow, ...middle.words, middle.content, middle.note].every((o) => o > 0.99)).toBe(true);
  });

  it("rises headline words from below", () => {
    const rise = (progress: number) =>
      parts(render("9:16", progress))
        .filter((p) => p.part === "word")
        .map((p) => parseFloat(/translateY\((-?[\d.]+)px\)/.exec(p.style.get("transform") ?? "")?.[1] ?? "0"));
    expect(rise(0).every((y) => y > 0)).toBe(true);
    expect(rise(0.7).every((y) => Math.abs(y) < 0.01)).toBe(true);
  });

  it.each(ASPECTS)("fades out at the end (%s)", (aspect) => {
    const html = render(aspect, 1);
    expect(num(parseStyle(/^<div[^>]*?style="([^"]*)"/.exec(html)![1]!), "opacity")).toBeCloseTo(0, 3);
  });

  it("staggers words and places content then note after them", () => {
    const timing = sectionTiming(5);
    expect(timing.words).toHaveLength(5);
    expect(timing.words[0]![0]).toBeGreaterThan(timing.eyebrow[0]);
    for (let i = 1; i < 5; i++) expect(timing.words[i]![0]).toBeGreaterThan(timing.words[i - 1]![0]);
    expect(timing.content).toBeGreaterThan(timing.words.at(-1)![0]);
    expect(timing.note[0]).toBeGreaterThan(timing.content);
    // Long headlines still finish their entrance well before the scene ends.
    expect(sectionTiming(30).note[1]).toBeLessThan(0.7);
  });

  it("uses the theme's type ramp and bundled fonts", () => {
    const ps = parts(render("16:9", 0.6));
    const headline = ps.find((p) => p.part === "headline")!.style;
    const ramp = neutralTheme.type.headline["16:9"];
    expect(num(headline, "font-size")).toBe(ramp.size);
    expect(headline.get("font-weight")).toBe(String(ramp.weight));
    expect(headline.get("letter-spacing")).toBe(`${ramp.tracking}em`);
    const bundled = renderToStaticMarkup(<Section progress={0.6} theme={lightTheme} aspect="16:9" headline="Fonts" />);
    expect(bundled).toContain(`font-family:${lightTheme.fonts.display.replace(/"/g, "&quot;")}`);
    expect(lightTheme.fonts.display.startsWith(SANS_FAMILY)).toBe(true);
    const eyebrow = ps.find((p) => p.part === "eyebrow")!.style;
    expect(num(eyebrow, "font-size")).toBe(neutralTheme.type.eyebrow["16:9"].size);
  });

  it("leaves out eyebrow, note and content when not given", () => {
    const html = renderToStaticMarkup(<Section progress={0.6} theme={neutralTheme} aspect="9:16" headline="Just a headline" />);
    const names = parts(html).map((p) => p.part);
    expect(names).not.toContain("eyebrow");
    expect(names).not.toContain("note");
    expect(html).not.toContain('data-section-part="content"');
  });

  it("nests a BigNumber and renders both", () => {
    for (const aspect of ASPECTS) {
      const html = render(aspect, 0.8);
      expect(html).toContain("Ship");
      expect(html).toContain("12,500");
      expect(html).toContain("Monthly users");
    }
  });

  it("rejects unknown nested components", () => {
    expect(() => render("9:16", 0.5, { content: { component: "Nope", props: {} } })).toThrow(/unknown component "Nope"/);
  });

  it("escapes text", () => {
    expect(render("9:16", 0.6, { headline: "<b> tag" })).toContain("&lt;b&gt;");
  });
});
