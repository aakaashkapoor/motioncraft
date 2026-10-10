import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, Handoff, contentArea, handoffLayout, kit, lightTheme, sectionLayout, type Rect } from "../src/index";

const theme = lightTheme;

const props = {
  from: { component: "Card", props: { icon: "chat", title: "The prompt", subtitle: "Explain our deploys" } },
  to: { component: "AppWindow", props: { title: "storyboard.json", shareId: "board" } },
  label: "plan",
};

const inside = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("handoffLayout", () => {
  it.each(ASPECTS)("%s: two boxes in the content area, the arrow running from one into the other", (aspect) => {
    const area = contentArea(theme, aspect);
    const layout = handoffLayout(theme, aspect);
    expect(layout.direction).toBe(aspect === "16:9" ? "row" : "column");
    expect(inside(area, layout.from)).toBe(true);
    expect(inside(area, layout.to)).toBe(true);
    expect(overlaps(layout.from, layout.to)).toBe(false);
    // The receiving component gets the larger box.
    expect(layout.to.width * layout.to.height).toBeGreaterThan(layout.from.width * layout.from.height);
    if (layout.direction === "row") {
      expect(layout.start.x).toBeCloseTo(layout.from.x + layout.from.width);
      expect(layout.end.x).toBeCloseTo(layout.to.x);
      expect(layout.start.y).toBeCloseTo(layout.end.y);
    } else {
      expect(layout.start.y).toBeCloseTo(layout.from.y + layout.from.height);
      expect(layout.end.y).toBeCloseTo(layout.to.y);
      expect(layout.start.x).toBeCloseTo(layout.end.x);
    }
  });

  it("always stacks in 9:16, even in a slot wider than tall, so the source keeps the column's width", () => {
    const slot = { x: 120, y: 500, width: 840, height: 600 };
    const layout = handoffLayout(theme, "9:16", slot);
    expect(layout.direction).toBe("column");
    expect(layout.from.width).toBe(840);
  });

  it("stacks with a shorter arrow than it runs side by side", () => {
    const tall = handoffLayout(theme, "9:16");
    const wide = handoffLayout(theme, "16:9");
    expect(tall.end.y - tall.start.y).toBeLessThan(wide.end.x - wide.start.x);
    expect(tall.end.y - tall.start.y).toBeGreaterThanOrEqual(theme.spacing.xxl);
  });

  it("gives the source the share of the area a storyboard asks for", () => {
    const area = contentArea(theme, "9:16");
    const plain = handoffLayout(theme, "9:16", area);
    const roomy = handoffLayout(theme, "9:16", area, 0.42);
    expect(roomy.from.height).toBeGreaterThan(plain.from.height);
    expect(roomy.from.height + roomy.to.height).toBeCloseTo(plain.from.height + plain.to.height, 0);
    expect(roomy.from.height / (roomy.from.height + roomy.to.height)).toBeCloseTo(0.42, 2);
  });

  it("follows the shape of its area, not the aspect: a near-square slot stacks", () => {
    const slot = sectionLayout(theme, "16:9", { headline: "A tall slot" }).content;
    const layout = handoffLayout(theme, "16:9", slot);
    expect(layout.direction).toBe("column");
    expect(inside(slot, layout.from)).toBe(true);
    expect(inside(slot, layout.to)).toBe(true);
  });
});

describe("Handoff", () => {
  it("is registered", () => {
    expect(kit.Handoff).toBeDefined();
  });

  it.each(ASPECTS)("%s: renders both components and an arrow between them", (aspect) => {
    const html = renderToStaticMarkup(<Handoff progress={0.6} theme={theme} aspect={aspect} {...props} />);
    expect(html).toContain("The prompt");
    expect(html).toContain('data-share-id="board"');
    expect(html).toContain("data-arrow-line");
    expect(html).toContain("plan");
    for (const part of ["from", "to"]) expect(html).toContain(`data-handoff="${part}"`);
  });

  it("draws the arrow after the source arrives and before the receiver does", () => {
    const drawn = (progress: number) => {
      const html = renderToStaticMarkup(<Handoff progress={progress} theme={theme} aspect="9:16" {...props} />);
      const offset = Number(/data-arrow-line=""[^>]*?stroke-dashoffset="([^"]*)"/.exec(html)![1]);
      return offset;
    };
    // Nothing drawn at the start; fully drawn by the middle.
    expect(drawn(0.05)).toBeGreaterThan(0);
    expect(drawn(0.6)).toBe(0);
  });

  it("rejects an unknown component", () => {
    expect(() =>
      renderToStaticMarkup(<Handoff progress={0.5} theme={theme} aspect="9:16" {...props} to={{ component: "Nope" }} />),
    ).toThrow(/Handoff: unknown component "Nope"/);
  });
});
