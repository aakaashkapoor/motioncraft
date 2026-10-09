import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  buildTimeline,
  contentArea,
  contentFade,
  frameAt,
  interpolateSharedBox,
  kit,
  lightTheme,
  morphEndpoints,
  morphProgress,
  Pinned,
  pinnedLayout,
  sharedIds,
  validateStoryboard,
  type Aspect,
  type SharedBox,
  type SharedMeasurements,
  type Storyboard,
} from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { Frame } from "../src/render/page";
import { showFrame, withRenderPage } from "../src/render/session";
import { resolveTheme } from "../src/render/themes";

const A: SharedBox = { x: 100, y: 200, width: 800, height: 1000, radius: 24, background: "#ffffff", opacity: 1 };
const B: SharedBox = { x: 700, y: 120, width: 300, height: 400, radius: 12, background: "#000000", opacity: 0.5 };

describe("interpolateSharedBox", () => {
  it("is A's box at 0 and B's at 1", () => {
    expect(interpolateSharedBox(A, B, 0)).toEqual({ ...A, background: "rgb(255, 255, 255)" });
    expect(interpolateSharedBox(A, B, 1)).toEqual({ ...B, background: "rgb(0, 0, 0)" });
  });

  it("mixes position, size, radius and opacity linearly in t", () => {
    expect(interpolateSharedBox(A, B, 0.5)).toMatchObject({ x: 400, y: 160, width: 550, height: 700, radius: 18, opacity: 0.75 });
    expect(interpolateSharedBox(A, B, 0.25)).toMatchObject({ x: 250, width: 675 });
  });

  it("mixes the background in linear light", () => {
    const mid = interpolateSharedBox(A, B, 0.5).background;
    expect(mid).toMatch(/^rgb\((\d+), \1, \1\)$/);
    // Linear-light mixing: a midpoint brighter than the sRGB average (128).
    expect(Number(/\d+/.exec(mid)![0])).toBeGreaterThan(150);
  });

  it("steps an unparseable background at the midpoint instead of throwing", () => {
    const odd = { ...B, background: "color(display-p3 0 0 0)" };
    expect(interpolateSharedBox(A, odd, 0.4).background).toBe("#ffffff");
    expect(interpolateSharedBox(A, odd, 0.6).background).toBe(odd.background);
  });
});

describe("morphProgress", () => {
  it("springs from 0 to 1 over the transition, smoothly and without overshoot", () => {
    const values = Array.from({ length: 19 }, (_, k) => morphProgress((k + 0.5) / 19, 19, 30));
    expect(morphProgress(0, 18, 30)).toBe(0);
    expect(morphProgress(1, 18, 30)).toBe(1);
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    for (const v of values) expect(v).toBeLessThanOrEqual(1);
    // `smooth` leads: well past halfway at the middle, nearly there at the end.
    expect(morphProgress(0.5, 18, 30)).toBeGreaterThan(0.6);
    expect(values.at(-1)!).toBeGreaterThan(0.97);
  });
});

describe("contentFade", () => {
  it("cross-fades A's content out and B's in", () => {
    expect(contentFade(0)).toEqual({ from: 1, to: 0 });
    expect(contentFade(1)).toEqual({ from: 0, to: 1 });
    const mid = contentFade(0.5);
    expect(mid.from).toBeGreaterThan(0);
    expect(mid.to).toBeGreaterThan(0);
  });
});

describe("sharedIds", () => {
  it("lists only the ids both scenes have, in A's order", () => {
    expect(sharedIds({ hero: A, logo: A, extra: A }, { logo: B, hero: B, other: B })).toEqual(["hero", "logo"]);
    expect(sharedIds({ a: A }, { b: B })).toEqual([]);
  });
});

function board(aspect: Aspect = "9:16"): Storyboard {
  return {
    title: "Shared",
    aspect,
    fps: 30,
    theme: "light",
    scenes: [
      {
        id: "a",
        component: "AppWindow",
        props: { title: "Hero", shareId: "win", content: { component: "BigNumber", props: { value: 42, label: "Alpha label" } } },
        durationMs: 2000,
        transition: { type: "slide", durationMs: 600 },
      },
      {
        id: "b",
        component: "Pinned",
        props: {
          pinned: { component: "AppWindow", props: { title: "Pinned", shareId: "win" } },
          content: {
            component: "CardRow",
            props: { cards: [{ icon: "zap", title: "Bravo card" }, { icon: "chart", title: "Charlie card" }] },
          },
        },
        durationMs: 2000,
      },
    ],
  };
}

describe("morphEndpoints", () => {
  it("freezes A where the transition starts and B where it ends", () => {
    const tl = buildTimeline(board(), {}, lightTheme);
    const t = tl.transitions[0]!;
    const [from, to] = morphEndpoints(tl, 0);
    expect(from).toEqual({ ...frameAt(tl, t.startFrame).pair![0], transition: undefined });
    expect(to).toEqual({ ...frameAt(tl, t.startFrame + t.frames - 1).pair![1], transition: undefined });
    expect(from.sceneIndex).toBe(0);
    expect(to.sceneIndex).toBe(1);
  });
});

describe("Frame with shared elements", () => {
  const sb = board();
  const tl = buildTimeline(sb, {}, lightTheme);
  const t = tl.transitions[0]!;
  const mid = t.startFrame + Math.floor(t.frames / 2);
  const shared: SharedMeasurements = new Map([[0, { from: { win: A, only: A }, to: { win: B } }]]);
  const render = (frame: number, measurements?: SharedMeasurements) =>
    renderToStaticMarkup(createElement(Frame, { storyboard: sb, theme: lightTheme, timeline: tl, frame, shared: measurements }));

  it("draws the shared element once, in a box between A's and B's", () => {
    const html = render(mid, shared);
    const boxes = [...html.matchAll(/data-morph-box="([^"]*)"[^>]*style="([^"]*)"/g)];
    expect(boxes.map((m) => m[1])).toEqual(["win"]);
    const style = boxes[0]![2]!;
    const px = (prop: string) => Number(new RegExp(`(?:^|;)${prop}:([\\d.]+)px`).exec(style)![1]);
    const between = (v: number, a: number, b: number) => v > Math.min(a, b) && v < Math.max(a, b);
    expect(between(px("left"), A.x, B.x)).toBe(true);
    expect(between(px("top"), A.y, B.y)).toBe(true);
    expect(between(px("width"), A.width, B.width)).toBe(true);
    expect(between(px("height"), A.height, B.height)).toBe(true);
    expect(between(px("border-radius"), B.radius, A.radius)).toBe(true);
    // Both contents are inside the box, cross-fading.
    expect(html.match(/data-morph-content="(from|to)"/g)).toEqual(['data-morph-content="from"', 'data-morph-content="to"']);
  });

  it("hides the originals in both scenes while the morph runs", () => {
    const html = render(mid, shared);
    expect(html).toContain('[data-shared-scene] [data-share-id="win"]{visibility:hidden !important}');
    expect(html.match(/data-shared-scene=""/g)).toHaveLength(2);
  });

  it("leaves elements without a match to the normal presentation", () => {
    const html = render(mid, shared);
    expect(html).not.toContain('data-morph-box="only"');
    expect(html).not.toContain('[data-share-id="only"]');
    // Both scene wrappers still slide.
    expect(html.match(/transform:translate\(/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("without measurements, or outside the transition, renders as before", () => {
    expect(render(mid)).not.toContain("data-morph-box");
    expect(render(mid)).not.toContain("data-shared-scene");
    expect(render(0, shared)).not.toContain("data-morph-box");
    expect(render(tl.totalFrames - 1, shared)).not.toContain("data-morph-box");
  });
});

describe("Pinned", () => {
  const props = board().scenes[1]!.props as Record<string, unknown>;

  it.each(ASPECTS)("%s: docks the pinned frame in a corner, scaled down, beside the content", (aspect) => {
    const area = contentArea(lightTheme, aspect);
    const { pinned, content, scale } = pinnedLayout(lightTheme, aspect);
    expect(scale).toBeGreaterThan(0.15);
    expect(scale).toBeLessThan(0.5);
    // Top-right corner of the content area.
    expect(pinned.x + pinned.width).toBeCloseTo(area.x + area.width);
    expect(pinned.y).toBeCloseTo(area.y);
    // The content box stays inside the area and clear of the pinned box.
    expect(content.x).toBeGreaterThanOrEqual(area.x);
    expect(content.y + content.height).toBeLessThanOrEqual(area.y + area.height + 0.5);
    const overlaps = content.x < pinned.x + pinned.width && pinned.x < content.x + content.width && content.y < pinned.y + pinned.height && pinned.y < content.y + content.height;
    expect(overlaps).toBe(false);
  });

  it("is registered and renders both children", () => {
    expect(kit.Pinned).toBeDefined();
    const html = renderToStaticMarkup(createElement(Pinned as never, { ...props, progress: 0.5, theme: lightTheme, aspect: "16:9" }));
    expect(html).toContain('data-share-id="win"');
    expect(html).toContain("Bravo card");
    expect(html).toContain("data-pinned=");
  });
});

describe("examples/shared", () => {
  it.each(["storyboard.json", "storyboard-wide.json"])("%s is valid and shares a window across a boundary", (file) => {
    const json = JSON.parse(readFileSync(join(import.meta.dirname, "..", "examples", "shared", file), "utf8"));
    const result = validateStoryboard(json);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(json.scenes[0])).toContain('"shareId":"window"');
    expect(JSON.stringify(json.scenes[1])).toContain('"shareId":"window"');
    expect(json.scenes[0].transition.type).not.toBe("cut");
  });
});

describe("shared-element morph in the browser", () => {
  for (const aspect of ASPECTS) it(`${aspect}: mid-transition, the window's box lies between its boxes in A and B`, { timeout: 90_000 }, async (ctx) => {
    const sb = board(aspect);
    const theme = resolveTheme(sb);
    const durations = estimateDurations(sb);
    const tl = buildTimeline(sb, durations, theme);
    const t = tl.transitions[0]!;
    const rect = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    try {
      await withRenderPage({ storyboard: sb, theme, durations }, async (page) => {
        const boxAt = async (frame: number, selector: string) => {
          await showFrame(page, frame, 20_000);
          return page.evaluate(rect, selector);
        };
        const a = await boxAt(t.startFrame, '[data-morph-box="win"]');
        const b = await boxAt(t.startFrame + t.frames - 1, '[data-morph-box="win"]');
        const mid = await boxAt(t.startFrame + Math.floor(t.frames / 2), '[data-morph-box="win"]');
        const solo = await boxAt(t.startFrame + t.frames, '[data-share-id="win"]');
        expect(a && b && mid && solo).toBeTruthy();
        // The morph ends where B's window sits once the transition is over.
        expect(Math.abs(b!.x - solo!.x)).toBeLessThan(8);
        expect(Math.abs(b!.width - solo!.width)).toBeLessThan(8);
        expect(b!.width).toBeLessThan(a!.width * 0.6);
        for (const key of ["x", "y", "width", "height"] as const) {
          const [lo, hi] = [Math.min(a![key], b![key]), Math.max(a![key], b![key])];
          expect(mid![key]).toBeGreaterThanOrEqual(lo - 0.5);
          expect(mid![key]).toBeLessThanOrEqual(hi + 0.5);
        }
        expect(mid!.width).toBeLessThan(a!.width - 1);
        expect(mid!.width).toBeGreaterThan(b!.width + 1);
        // Exactly one visible copy of the window: the scene originals are hidden.
        const visible = await page.evaluate(
          () =>
            [...document.querySelectorAll('[data-shared-scene] [data-share-id="win"]')].filter((el) => getComputedStyle(el).visibility === "visible").length,
        );
        expect(visible).toBe(0);
      });
    } catch (error) {
      if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
      throw error;
    }
  });
});
