// Every kit component that lays itself out honors the `area` slot: nested in a
// Section, it stays inside the content slot and clear of the headline. The
// components and their props come from the section-nesting fixtures.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Section, cardRowLayout, chatWindowLayout, contentArea, flowDiagramLayout, kit, neutralTheme, sectionLayout, type Aspect, type Rect } from "../src/index";
import { Arrow } from "../src/kit/Arrow";
import type { SectionContent } from "../src/kit/Section";
import { windowWidth } from "../src/kit/windowLayout";

const theme = neutralTheme;

/**
 * Kit components that are not nested content: the scene layouts (Section,
 * SceneFrame, and Pinned, which docks other components), and the caption,
 * which owns the caption band.
 */
const NOT_NESTED = ["Section", "SceneFrame", "Pinned", "Caption", "EndCard"];

const FIXTURES: Record<Aspect, string> = { "9:16": "section-nesting.json", "16:9": "section-nesting-wide.json" };
/** 16:9 puts narrow content beside the headline; 9:16 puts it below. */
const ARRANGEMENT: Record<Aspect, "beside" | "below"> = { "16:9": "beside", "9:16": "below" };

interface NestingScene {
  id: string;
  props: { eyebrow?: string; headline: string; note?: string; content: SectionContent };
}

function scenes(aspect: Aspect): NestingScene[] {
  const json = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", FIXTURES[aspect]), "utf8"));
  expect(json.aspect).toBe(aspect);
  return json.scenes;
}

const parseStyle = (style: string): Map<string, string> =>
  new Map(
    style
      .split(";")
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(":");
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as const;
      }),
  );

function boxOf(style: Map<string, string>): Rect {
  const num = (key: string) => {
    const value = style.get(key);
    if (value === undefined) throw new Error(`no ${key} in style`);
    return parseFloat(value);
  };
  return { x: num("left"), y: num("top"), width: num("width"), height: num("height") };
}

/** The box of the first element inside the content slot marker: the nested component's root. */
function nestedRootBox(html: string): Rect {
  const m = /data-section-part="content"[^>]*><(\w+)[^>]*?style="([^"]*)"/.exec(html);
  if (m?.[2] === undefined) throw new Error("no nested content");
  return boxOf(parseStyle(m[2]));
}

function headlineBox(html: string): Rect {
  const m = /data-section-part="headline"[^>]*?style="([^"]*)"/.exec(html);
  if (m?.[1] === undefined) throw new Error("no headline");
  return boxOf(parseStyle(m[1]));
}

const inside = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe.each(["16:9", "9:16"] as const)("kit components nested in a Section (%s)", (aspect) => {
  const all = scenes(aspect);

  it("the fixture nests every registered component", () => {
    const nested = new Set(all.map((s) => s.props.content.component));
    for (const name of Object.keys(kit)) {
      if (!NOT_NESTED.includes(name)) expect(nested, name).toContain(name);
    }
  });

  it.each(all.map((s) => [s.props.content.component, s] as const))("%s stays inside the slot, clear of the headline", (_, scene) => {
    const layout = sectionLayout(theme, aspect, scene.props);
    expect(layout.arrangement).toBe(ARRANGEMENT[aspect]);
    for (const progress of [0.3, 0.8]) {
      const html = renderToStaticMarkup(<Section progress={progress} theme={theme} aspect={aspect} {...scene.props} />);
      const root = nestedRootBox(html);
      expect(inside(layout.content, root), `root ${JSON.stringify(root)} in slot ${JSON.stringify(layout.content)}`).toBe(true);
      expect(overlaps(root, headlineBox(html))).toBe(false);
    }
  });
});

// Slots a Section gives narrow content: beside the headline in 16:9, below it in 9:16.
const SLOT: Record<Aspect, Rect> = {
  "16:9": sectionLayout(theme, "16:9", { headline: "Every part in its slot" }).content,
  "9:16": sectionLayout(theme, "9:16", { headline: "Every part in its slot" }).content,
};

const card = (title: string) => ({ icon: "check", title, subtitle: "A short line" });

describe("sizing scales to the slot", () => {
  it("CardRow wraps to a grid in a narrow 16:9 slot, but keeps one row in the full content area", () => {
    const cards = ["Write", "Build", "Check", "Ship"].map(card);
    const full = cardRowLayout(theme, "16:9", cards);
    expect(new Set(full.cells.map((c) => c.y)).size).toBe(1);

    const area = SLOT["16:9"];
    const nested = cardRowLayout(theme, "16:9", cards, area);
    expect(new Set(nested.cells.map((c) => c.y)).size).toBe(2);
    for (const cell of nested.cells) {
      expect(inside({ x: 0, y: 0, width: area.width, height: area.height }, cell)).toBe(true);
    }
  });

  it.each([3, 4])("FlowDiagram runs top to bottom when a row would break words (%i nodes)", (count) => {
    const nodes = ["Write", "Render", "Check", "Ship"].slice(0, count);
    const full = flowDiagramLayout(theme, "16:9", nodes);
    expect(new Set(full.nodes.map((n) => n.y)).size).toBe(1);
    // A narrow landscape slot, tall enough for four cards stacked at the smallest label step.
    const slot = { ...SLOT["16:9"], height: 800 };
    const nested = flowDiagramLayout(theme, "16:9", nodes, undefined, slot);
    expect(new Set(nested.nodes.map((n) => n.x)).size).toBe(1);
    expect(nested.nodes.at(-1)!.y + nested.nodes.at(-1)!.height).toBeLessThanOrEqual(slot.height);
  });

  it("ChatWindow stacks in a narrow 16:9 slot and stays inside it", () => {
    const messages = [{ author: "Ana", time: "9:41", text: "Ready?" }];
    const input = { messages, sidebar: { workspace: "Acme", channels: ["general"] }, cards: messages };
    expect(chatWindowLayout(theme, "16:9", input).sidebarWidth).toBeGreaterThan(0);
    const area = SLOT["16:9"];
    const nested = chatWindowLayout(theme, "16:9", input, area);
    expect(nested.sidebarWidth).toBe(0);
    expect(inside(area, nested.window)).toBe(true);
    expect(inside(area, nested.cards!)).toBe(true);
    expect(nested.cards!.y).toBeGreaterThan(nested.window.y);
  });

  it("windows keep their standalone width but never exceed the slot", () => {
    for (const aspect of ["16:9", "9:16"] as const) {
      const standalone = windowWidth(theme, aspect).width;
      expect(windowWidth(theme, aspect, SLOT[aspect]).width).toBe(Math.min(standalone, SLOT[aspect].width));
    }
    expect(windowWidth(theme, "16:9", SLOT["16:9"]).width).toBeLessThan(windowWidth(theme, "16:9").width);
  });

  it("Arrow keeps points in frame px and resolves anchors inside the slot", () => {
    const area = SLOT["9:16"];
    const anchors = { a: { x: 100, y: 800, width: 100, height: 100 }, b: { x: 2000, y: 900, width: 100, height: 100 } };
    const html = renderToStaticMarkup(
      <Arrow progress={0.5} theme={theme} aspect="9:16" area={area} from={{ anchor: "a" }} to={{ anchor: "b" }} anchors={anchors} />,
    );
    expect(boxOf(parseStyle(/^<div[^>]*?style="([^"]*)"/.exec(html)![1]!))).toEqual(area);
    // The drawing is offset back to the frame's origin, so path data stays in frame px.
    expect(html).toContain(`left:${-area.x}px;top:${-area.y}px`);
    const d = /data-arrow-line=""[^>]*?d="([^"]*)"/.exec(html)![1]!;
    const end = d.split(/\s+/).slice(-2).map(Number);
    // The far anchor sits off the frame; its end is pulled back inside the slot.
    expect(end[0]).toBe(area.x + area.width);
    expect(end[1]).toBeGreaterThanOrEqual(area.y);
  });

  it("components without a slot still fill the content area", () => {
    const area = contentArea(theme, "16:9");
    const Card = kit.Card!;
    const html = renderToStaticMarkup(<Card progress={0.5} theme={theme} aspect="16:9" title="Hi" />);
    expect(boxOf(parseStyle(/^<div[^>]*?style="([^"]*)"/.exec(html)![1]!))).toEqual(area);
  });
});
