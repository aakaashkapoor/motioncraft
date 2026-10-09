// The reference's scene frame (design v3, "The owner's reference"): a grey
// eyebrow and a bold headline centered at the same top position on every
// scene, the content block centered below, and a takeaway footer centered at
// the bottom that lands once the content has built. In both aspects.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  SceneClockContext,
  SceneFrame,
  contentArea,
  curveEasing,
  headlineTiming,
  kit,
  lightTheme,
  sceneFrameLayout,
  sceneFrameTiming,
  type Aspect,
  type Rect,
} from "../src/index";

const theme = lightTheme;
const { leadMs, cascadeMs, mark } = theme.motion;
const textIn = theme.motion["text.in"];

function at(ms: number, element: ReactElement, sceneMs = 6000): string {
  return renderToStaticMarkup(<SceneClockContext.Provider value={{ fps: 1000, frame: ms, frames: sceneMs }}>{element}</SceneClockContext.Provider>);
}

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

const boxOf = (style: Map<string, string>): Rect => {
  const num = (key: string) => {
    const value = style.get(key);
    if (value === undefined) throw new Error(`no ${key} in style`);
    return parseFloat(value);
  };
  return { x: num("left"), y: num("top"), width: num("width"), height: num("height") };
};

function part(html: string, name: string): Map<string, string> {
  const m = new RegExp(`<\\w+ data-frame-part="${name}"[^>]*?style="([^"]*)"`).exec(html);
  if (m?.[1] === undefined) throw new Error(`no ${name} in ${html}`);
  return parseStyle(m[1]);
}

const inside = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const CARDS = { component: "CardRow", props: { cards: [{ icon: "chat", title: "Prompt" }, { icon: "code", title: "Plan" }, { icon: "play", title: "Render" }] } };
const PROPS = { eyebrow: "How it works", headline: "Three steps to a video", content: CARDS, footer: "All on your machine" };
const HEADLINE_WORDS = PROPS.headline.split(" ");

const frame = (extra: Record<string, unknown> = {}, aspect: Aspect = "9:16") => <SceneFrame progress={0} theme={theme} aspect={aspect} {...PROPS} {...extra} />;
const mid = (aspect: Aspect) => (aspect === "9:16" ? 540 : 960);

describe("SceneFrame layout", () => {
  it("is registered in the kit", () => {
    expect(kit.SceneFrame).toBe(SceneFrame);
  });

  it.each(ASPECTS)("puts the header at the same top on every scene (%s)", (aspect) => {
    const area = contentArea(theme, aspect);
    const layouts = [
      sceneFrameLayout(theme, aspect, { eyebrow: "One", headline: "Short" }),
      sceneFrameLayout(theme, aspect, { eyebrow: "Two", headline: "A much longer headline that needs two lines", footer: "With a footer" }),
      sceneFrameLayout(theme, aspect, { eyebrow: "Three", headline: "Mid length headline", footer: "Another takeaway line" }),
    ];
    for (const layout of layouts) {
      expect(layout.eyebrow!.y).toBe(area.y);
      expect(layout.headline.y).toBe(layouts[0]!.headline.y);
    }
    expect(sceneFrameLayout(theme, aspect, { headline: "No eyebrow" }).headline.y).toBe(area.y);
  });

  it.each(ASPECTS)("keeps the header on top and the content below it, in both aspects (%s)", (aspect) => {
    const layout = sceneFrameLayout(theme, aspect, PROPS);
    expect(layout.content.y).toBeGreaterThanOrEqual(layout.headline.y + layout.headline.height + theme.spacing.lg);
    expect(layout.content.y + layout.content.height).toBeLessThanOrEqual(layout.footer!.y - theme.spacing.lg);
    // The content slot spans the content area, so the block centers on the frame.
    const area = contentArea(theme, aspect);
    expect(layout.content.x).toBe(area.x);
    expect(layout.content.width).toBe(area.width);
    // The footer sits at the bottom of the content area.
    expect(layout.footer!.y + layout.footer!.height).toBe(area.y + area.height);
  });

  it.each(ASPECTS)("keeps every part inside the content area, without overlaps (%s)", (aspect) => {
    const area = contentArea(theme, aspect);
    const layout = sceneFrameLayout(theme, aspect, PROPS);
    const rects = [layout.eyebrow!, layout.headline, layout.content, layout.footer!];
    for (const rect of rects) expect(inside(area, rect), JSON.stringify(rect)).toBe(true);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
    }
  });

  it.each(ASPECTS)("centers eyebrow, headline and footer on the frame, and the content in its slot (%s)", (aspect) => {
    const html = at(4000, frame({}, aspect));
    for (const name of ["eyebrow", "headline", "footer"]) {
      const style = part(html, name);
      expect(style.get("text-align"), name).toBe("center");
      const box = boxOf(style);
      expect(Math.abs(box.x + box.width / 2 - mid(aspect)), name).toBeLessThanOrEqual(1);
    }
    const slot = sceneFrameLayout(theme, aspect, PROPS).content;
    const nested = /data-frame-part="content"[^>]*><div[^>]*?style="([^"]*)"/.exec(html)!;
    const root = boxOf(parseStyle(nested[1]!));
    expect(inside(slot, root)).toBe(true);
    expect(Math.abs(root.x + root.width / 2 - mid(aspect))).toBeLessThanOrEqual(1);
  });

  it("steps a long headline down the ramp so the content keeps its room", () => {
    const long = Array.from({ length: 6 }, () => "Ship videos without an editor").join(" ");
    expect(sceneFrameLayout(theme, "9:16", { headline: "Short" }).headlineRole).toBe("headline");
    expect(sceneFrameLayout(theme, "9:16", { headline: long }).headlineRole).toBe("title");
  });
});

describe("SceneFrame type and colour", () => {
  it.each(ASPECTS)("sets a grey eyebrow in sentence case, the headline bold, the footer at the label step (%s)", (aspect) => {
    const html = at(4000, frame({}, aspect));
    const eyebrow = part(html, "eyebrow");
    expect(eyebrow.get("font-size")).toBe(`${theme.type.label[aspect].size}px`);
    expect(eyebrow.get("font-weight")).toBe(String(theme.weights.semibold));
    expect(eyebrow.get("text-transform")).toBeUndefined();
    expect(eyebrow.get("color")).toBe(theme.colors.textMuted);
    const headline = part(html, "headline");
    expect(headline.get("font-size")).toBe(`${theme.type.headline[aspect].size}px`);
    expect(headline.get("font-weight")).toBe(String(theme.type.headline[aspect].weight));
    expect(headline.get("text-wrap")).toBe("balance");
    const footer = part(html, "footer");
    expect(footer.get("font-size")).toBe(`${theme.type.label[aspect].size}px`);
    expect(html).toContain("How it works");
    expect(html).toContain("All on your machine");
  });
});

describe("SceneFrame choreography", () => {
  const timing = sceneFrameTiming(theme, HEADLINE_WORDS, { eyebrow: true, content: true });

  it("header first, then the content as the headline lands, then the footer once the content has built", () => {
    expect(timing.eyebrow).toBe(leadMs);
    expect(timing.headline).toBe(leadMs + textIn.lineStaggerMs);
    expect(timing.content + leadMs).toBeGreaterThan(timing.headline);
    expect(timing.footer).toBe(timing.content + cascadeMs);
    // Without an eyebrow, the headline is the first motion.
    expect(sceneFrameTiming(theme, HEADLINE_WORDS, { eyebrow: false }).headline).toBe(leadMs);
  });

  it("plays it: eyebrow, headline, the content's own entrance, then the footer", () => {
    const opacity = (ms: number, name: string) => parseFloat(part(at(ms, frame()), name).get("opacity") ?? "1");
    expect(opacity(timing.eyebrow, "eyebrow")).toBe(0);
    expect(opacity(timing.eyebrow + 50, "eyebrow")).toBeGreaterThan(0);

    const card = (ms: number) => parseFloat(/data-card="0"[^>]*?style="[^"]*?opacity:([\d.]+)/.exec(at(ms, frame()))![1]!);
    expect(card(timing.content + leadMs)).toBe(0);
    expect(card(timing.content + leadMs + 100)).toBeGreaterThan(0);

    expect(opacity(timing.footer, "footer")).toBe(0);
    expect(opacity(timing.footer + 50, "footer")).toBeGreaterThan(0);
    expect(opacity(timing.footer + textIn.ms, "footer")).toBe(1);
  });

  it("lands the headline as a whole by default, word by word on request", () => {
    expect(at(timing.headline, frame())).toContain("data-headline-line");
    const words = at(timing.headline, frame({ headlineMotion: "words" }));
    expect(words).not.toContain("data-headline-line");
    expect(words.match(/data-headline-clip/g)).toHaveLength(HEADLINE_WORDS.length);
  });

  it("sweeps the marker on its word once the headline has landed", () => {
    const head = headlineTiming(theme, HEADLINE_WORDS, timing.headline);
    const sweep = (ms: number) => parseFloat(/data-headline-mark="bar"[^>]*?style="[^"]*?scaleX\(([\d.]+)\)/.exec(at(ms, frame({ mark: "video" })))![1]!);
    expect(sweep(head.mark)).toBe(0);
    expect(sweep(head.mark + mark.ms / 2)).toBeCloseTo(curveEasing(mark.curve)(0.5), 2);
    expect(sweep(head.mark + mark.ms)).toBe(1);
  });

  it.each(ASPECTS)("fades out on the last frame (%s)", (aspect) => {
    const html = at(5999, frame({}, aspect));
    expect(parseFloat(parseStyle(/^<div[^>]*?style="([^"]*)"/.exec(html)![1]!).get("opacity")!)).toBeCloseTo(0, 3);
  });
});
