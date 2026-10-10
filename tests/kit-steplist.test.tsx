import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, NOMINAL_SCENE_MS, StepList, contentArea, kit, neutralTheme, stepListTiming, type Aspect } from "../src/index";

interface Box {
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Parses an inline `style="..."` attribute into a map. */
function parseStyle(style: string): Map<string, string> {
  return new Map(
    style.split(";").map((d) => {
      const i = d.indexOf(":");
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as const;
    }),
  );
}

/** Reads the root element's inline style back out of server-rendered HTML. */
function rootBox(html: string): Box {
  const style = /^<[a-z]+[^>]*?style="([^"]*)"/.exec(html)?.[1];
  if (style === undefined) throw new Error(`no root style in ${html}`);
  const decls = parseStyle(style);
  const num = (key: string): number => {
    const value = decls.get(key);
    if (value === undefined) throw new Error(`root style has no ${key}: ${style}`);
    return parseFloat(value);
  };
  return { opacity: num("opacity"), x: num("left"), y: num("top"), width: num("width"), height: num("height") };
}

interface ItemState {
  opacity: number;
  /** Horizontal offset in px. */
  offset: number;
  /** How far below its place, in px. */
  rise: number;
}

/** Opacity, horizontal offset and rise of each list item, in order. */
function itemStates(html: string): ItemState[] {
  return [...html.matchAll(/<li[^>]*?style="([^"]*)"/g)].map((m) => {
    const decls = parseStyle(m[1]!);
    const offset = /translateX\((-?[\d.]+)px\)/.exec(decls.get("transform") ?? "")?.[1];
    const rise = /translateY\((-?[\d.]+)px\)/.exec(decls.get("transform") ?? "")?.[1];
    return {
      opacity: parseFloat(decls.get("opacity") ?? "NaN"),
      offset: offset === undefined ? 0 : parseFloat(offset),
      rise: rise === undefined ? 0 : parseFloat(rise),
    };
  });
}

const ITEMS = ["Write the storyboard", "Render the stills", "Run the checks", "Export the video"];
const PROGRESSES = [0, 0.5, 1] as const;
const cases = ASPECTS.flatMap((aspect) => PROGRESSES.map((progress) => [aspect, progress] as const));

const render = (aspect: Aspect, progress: number, extra: { title?: string; highlight?: number; marker?: "number" | "dot"; items?: string[] } = {}) =>
  renderToStaticMarkup(
    <StepList progress={progress} theme={neutralTheme} aspect={aspect} items={ITEMS} title="How it works" {...extra} />,
  );

describe("StepList", () => {
  it("is registered in the kit", () => {
    expect(kit.StepList).toBe(StepList);
  });

  it.each(cases)("renders title and every item inside the content area (%s, progress %s)", (aspect, progress) => {
    const html = render(aspect, progress);
    expect(html).toContain("How it works");
    for (const item of ITEMS) expect(html).toContain(item);
    expect(itemStates(html)).toHaveLength(ITEMS.length);
    const box = rootBox(html);
    const area = contentArea(neutralTheme, aspect);
    expect(box.x).toBeGreaterThanOrEqual(area.x);
    expect(box.y).toBeGreaterThanOrEqual(area.y);
    expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
  });

  it.each(ASPECTS)("is hidden at the start, fully shown mid-scene and gone at the end (%s)", (aspect) => {
    const start = render(aspect, 0);
    const middle = render(aspect, 0.5);
    const end = render(aspect, 1);
    for (const item of itemStates(start)) expect(item.opacity).toBeCloseTo(0, 3);
    expect(rootBox(middle).opacity).toBeCloseTo(1, 3);
    expect(rootBox(end).opacity).toBeCloseTo(0, 3);
    expect(start).not.toBe(middle);
    expect(middle).not.toBe(end);
  });

  it("brings items in one after another", () => {
    const timing = stepListTiming(neutralTheme, ITEMS.length, true);
    const states = itemStates(render("9:16", (timing.at(-1)![0] + 50) / NOMINAL_SCENE_MS));
    const opacities = states.map((s) => s.opacity);
    expect(opacities[0]).toBeCloseTo(1, 3);
    expect(opacities.at(-1)).toBeLessThan(1);
    for (let i = 1; i < opacities.length; i++) expect(opacities[i]).toBeLessThanOrEqual(opacities[i - 1]!);
    expect(new Set(opacities).size).toBeGreaterThan(1);
  });

  it("lifts items in from below, like cards (design v3, life #8)", () => {
    const early = itemStates(render("9:16", 0.02));
    expect(early[0]!.rise).toBe(neutralTheme.motion.lift.risePx);
    for (const item of itemStates(render("9:16", 0.7))) {
      expect(item.rise).toBeCloseTo(0, 3);
      expect(item.offset).toBeCloseTo(0, 3);
    }
  });

  it.each([2, 3, 4, 5, 6])("shows all %i items once the cascade has landed, in about the first 1.2 s", (count) => {
    const items = Array.from({ length: count }, (_, i) => `Step ${i + 1}`);
    for (const item of itemStates(render("16:9", 0.7, { items }))) {
      expect(item.opacity).toBeCloseTo(1, 3);
      expect(item.rise).toBeCloseTo(0, 3);
    }
    const timing = stepListTiming(neutralTheme, count, true);
    expect(timing).toHaveLength(count);
    expect(timing[0]![0]).toBeGreaterThan(neutralTheme.motion.leadMs);
    expect(timing.at(-1)![1]).toBeLessThanOrEqual(neutralTheme.motion.cascadeMs + 1e-9);
    for (const item of itemStates(render("16:9", timing.at(-1)![1] / NOMINAL_SCENE_MS, { items }))) {
      expect(item.opacity).toBeCloseTo(1, 3);
      expect(item.rise).toBeCloseTo(0, 3);
    }
  });

  it("numbers items by default and draws accent dots on request", () => {
    const numbered = render("9:16", 0.5);
    for (let i = 1; i <= ITEMS.length; i++) expect(numbered).toContain(`>${i}<`);
    const dotted = render("9:16", 0.5, { marker: "dot" });
    expect(dotted).not.toContain(">1<");
    expect(dotted).toContain(`background-color:${neutralTheme.colors.accent}`);
  });

  it("draws the highlighted item in the accent color", () => {
    const itemColors = (html: string) =>
      [...html.matchAll(/<span[^>]*data-step-text[^>]*style="([^"]*)"/g)].map((m) => parseStyle(m[1]!).get("color"));
    const plain = itemColors(render("9:16", 0.5));
    expect(plain).toHaveLength(ITEMS.length);
    expect(plain.every((c) => c === neutralTheme.colors.text)).toBe(true);
    const lit = itemColors(render("9:16", 0.5, { highlight: 2 }));
    expect(lit[2]).toBe(neutralTheme.colors.accent);
    expect(lit.filter((c) => c === neutralTheme.colors.accent)).toHaveLength(1);
  });

  it("leaves out the title when not given", () => {
    const html = renderToStaticMarkup(<StepList progress={0.5} theme={neutralTheme} aspect="9:16" items={ITEMS} />);
    expect(html).not.toContain("<h2");
  });

  it("escapes text", () => {
    expect(render("9:16", 0.5, { title: "<b>" })).toContain("&lt;b&gt;");
  });
});
