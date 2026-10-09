import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, NOMINAL_SCENE_MS, charsPerLine, contentArea, fontSize, neutralTheme, type Aspect, type Rect } from "../src/index";
import { FlowDiagram, flowDiagramLayout, flowDiagramTiming, kit } from "../src/kit";

const NODES = ["Prompt", "Storyboard", "Render", "Video"];
const CAPTION = "From idea to video";

const render = (aspect: Aspect, progress: number, nodes = NODES, extra: { caption?: string } = { caption: CAPTION }) =>
  renderToStaticMarkup(<FlowDiagram progress={progress} theme={neutralTheme} aspect={aspect} nodes={nodes} {...extra} />);

/** Parses an inline style attribute into a map. */
function styleMap(style: string): Map<string, string> {
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

function rootStyle(html: string): Map<string, string> {
  const style = /^<[a-z]+[^>]*?style="([^"]*)"/.exec(html)?.[1];
  if (style === undefined) throw new Error(`no root style in ${html}`);
  return styleMap(style);
}

function rootBox(html: string): Rect & { opacity: number } {
  const s = rootStyle(html);
  const num = (key: string) => parseFloat(s.get(key) ?? "NaN");
  return { opacity: num("opacity"), x: num("left"), y: num("top"), width: num("width"), height: num("height") };
}

/** Opacity of each node card, in order. */
function nodeOpacities(html: string): number[] {
  return [...html.matchAll(/data-flow-node="\d+"[^>]*?style="([^"]*)"/g)].map((m) =>
    parseFloat(styleMap(m[1]!).get("opacity") ?? "NaN"),
  );
}

/** How much of each arrow is drawn, 0..1, from its stroke-dashoffset. */
function arrowDrawn(html: string): number[] {
  return [...html.matchAll(/stroke-dasharray="([\d.]+)" stroke-dashoffset="([\d.]+)"/g)].map(
    (m) => 1 - parseFloat(m[2]!) / parseFloat(m[1]!),
  );
}

function expectInside(outer: Rect, inner: Rect): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 0.5);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 0.5);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 0.5);
}

const PROGRESSES = [0, 0.5, 1] as const;
const cases = ASPECTS.flatMap((aspect) => PROGRESSES.map((progress) => [aspect, progress] as const));

describe("FlowDiagram", () => {
  it("is registered in the kit", () => {
    expect(kit.FlowDiagram).toBe(FlowDiagram);
  });

  it.each(cases)("renders every node, the arrows and the caption in the content area (%s, progress %s)", (aspect, progress) => {
    const html = render(aspect, progress);
    for (const label of [...NODES, CAPTION]) expect(html).toContain(label);
    expect(nodeOpacities(html)).toHaveLength(NODES.length);
    expect(arrowDrawn(html)).toHaveLength(NODES.length - 1);
    const box = rootBox(html);
    expect({ x: box.x, y: box.y, width: box.width, height: box.height }).toEqual(contentArea(neutralTheme, aspect));
  });

  it.each(ASPECTS)("lays every node, arrow and the caption out inside the content area (%s)", (aspect) => {
    const area = contentArea(neutralTheme, aspect);
    const local = { x: 0, y: 0, width: area.width, height: area.height };
    for (const count of [2, 3, 4]) {
      const layout = flowDiagramLayout(neutralTheme, aspect, NODES.slice(0, count), CAPTION);
      expect(layout.nodes).toHaveLength(count);
      expect(layout.arrows).toHaveLength(count - 1);
      for (const node of layout.nodes) expectInside(local, node);
      for (const arrow of layout.arrows) {
        expectInside(local, { x: Math.min(arrow.x1, arrow.x2), y: Math.min(arrow.y1, arrow.y2), width: Math.abs(arrow.x2 - arrow.x1), height: Math.abs(arrow.y2 - arrow.y1) });
      }
      expectInside(local, layout.caption!);
    }
  });

  it("runs left to right in 16:9 and top to bottom in 9:16", () => {
    const wide = flowDiagramLayout(neutralTheme, "16:9", NODES, CAPTION);
    const tall = flowDiagramLayout(neutralTheme, "9:16", NODES, CAPTION);
    for (let i = 1; i < NODES.length; i++) {
      const [a, b] = [wide.nodes[i - 1]!, wide.nodes[i]!];
      expect(b.x).toBeGreaterThan(a.x + a.width);
      expect(b.y).toBeCloseTo(a.y, 3);
      const [c, d] = [tall.nodes[i - 1]!, tall.nodes[i]!];
      expect(d.y).toBeGreaterThan(c.y + c.height);
      expect(d.x).toBeCloseTo(c.x, 3);
    }
    for (const arrow of wide.arrows) expect(arrow.y1).toBe(arrow.y2);
    for (const arrow of tall.arrows) expect(arrow.x1).toBe(arrow.x2);
  });

  it("keeps two 16:9 cards to a third of the row each, centered", () => {
    const { width } = contentArea(neutralTheme, "16:9");
    const [a, b] = flowDiagramLayout(neutralTheme, "16:9", ["Draft", "Review"]).nodes;
    expect(a!.width).toBeLessThanOrEqual(width / 3);
    expect(a!.x).toBeCloseTo(width - (b!.x + b!.width), 3);
  });

  it.each(ASPECTS)("builds up: nothing at the start, everything mid-scene, faded out at the end (%s)", (aspect) => {
    const start = render(aspect, 0);
    expect(nodeOpacities(start).every((o) => o === 0)).toBe(true);
    expect(arrowDrawn(start).every((d) => d === 0)).toBe(true);

    const middle = render(aspect, 0.5);
    expect(rootBox(middle).opacity).toBeCloseTo(1, 3);
    expect(nodeOpacities(middle).every((o) => o === 1)).toBe(true);
    expect(arrowDrawn(middle).every((d) => d === 1)).toBe(true);

    expect(rootBox(render(aspect, 1)).opacity).toBeCloseTo(0, 3);
  });

  it("shows the nodes in order, each arrow drawing into its node as that node arrives", () => {
    let previous: number[] | undefined;
    const steps = 200;
    // Each element in build order: node 0, arrow 0, node 1, arrow 1, ...
    const states = Array.from({ length: steps + 1 }, (_, i) => {
      const html = render("9:16", (0.25 * i) / steps);
      const nodes = nodeOpacities(html);
      const arrows = arrowDrawn(html);
      return nodes.flatMap((n, k) => (k < arrows.length ? [n, arrows[k]!] : [n]));
    });
    for (const state of states) {
      // Nothing starts before the element before it has started.
      for (let k = 1; k < state.length; k++) if (state[k]! > 0) expect(state[k - 1]).toBeGreaterThan(0);
      if (previous !== undefined) state.forEach((v, k) => expect(v).toBeGreaterThanOrEqual(previous![k]! - 1e-9));
      previous = state;
    }
    // Partway through, an arrow is mid-draw while a later node is still arriving.
    expect(states.some((s) => s[1]! > 0 && s[1]! < 1)).toBe(true);
    expect(states.some((s) => s.at(-1)! > 0 && s.at(-1)! < 1)).toBe(true);
    expect(states.at(-1)!.every((v) => v === 1)).toBe(true);
    const timing = flowDiagramTiming(neutralTheme, NODES.length);
    expect(timing.nodes[0]).toBe(neutralTheme.motion.leadMs);
    expect(timing.arrows).toEqual(timing.nodes.slice(1));
    expect(timing.caption).toBeGreaterThan(timing.nodes.at(-1)!);
  });

  it("is fully built in about the first 1.2 s and still shown at 90%", () => {
    const { mark, fx, cascadeMs } = neutralTheme.motion;
    const timing = flowDiagramTiming(neutralTheme, NODES.length);
    expect(Math.max(timing.arrows.at(-1)! + mark.ms, timing.caption + fx.ms)).toBeLessThanOrEqual(cascadeMs);
    const built = render("16:9", cascadeMs / NOMINAL_SCENE_MS);
    expect(nodeOpacities(built).every((o) => o === 1)).toBe(true);
    expect(arrowDrawn(built).every((d) => d === 1)).toBe(true);
    expect(rootBox(render("16:9", 0.9)).opacity).toBeCloseTo(1, 3);
  });

  it("draws nodes as theme-surface cards with an accent border", () => {
    const html = render("9:16", 0.5);
    expect(html).toContain(`background-color:${neutralTheme.colors.surface}`);
    expect(html).toContain(neutralTheme.colors.accent);
    expect(html).toContain(`border-radius:${neutralTheme.radius.md}px`);
    expect(html).not.toContain("<img");
  });

  it("leaves the caption out when not given", () => {
    const html = render("16:9", 0.5, NODES, {});
    expect(html).not.toMatch(/<p\b/);
    expect(flowDiagramLayout(neutralTheme, "16:9", NODES).caption).toBeUndefined();
  });

  it("picks a label size that keeps every word whole", () => {
    const layout = flowDiagramLayout(neutralTheme, "16:9", NODES, CAPTION);
    const size = fontSize(neutralTheme, layout.labelStep, "16:9");
    const inner = layout.nodes[0]!.width - 2 * (neutralTheme.spacing.md + neutralTheme.spacing.xxs / 2);
    expect(charsPerLine(inner, size)).toBeGreaterThanOrEqual("Storyboard".length);
    expect(flowDiagramLayout(neutralTheme, "16:9", ["Go", "Stop"]).labelStep).toBe("title");
  });

  it("escapes labels", () => {
    expect(render("9:16", 0.5, ["<b>", "ok"])).toContain("&lt;b&gt;");
  });

  it("rejects fewer than 2 or more than 4 nodes", () => {
    expect(() => render("9:16", 0.5, ["one"])).toThrow(/2-4 nodes/);
    expect(() => render("9:16", 0.5, ["a", "b", "c", "d", "e"])).toThrow(/2-4 nodes/);
  });
});
