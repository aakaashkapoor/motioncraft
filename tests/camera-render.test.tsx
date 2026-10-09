// The camera in the render path (design v3, life #1 and #12): each scene's
// content sits in a camera world that moves, the caption stays fixed, and the
// layers of Pinned and Handoff follow the camera at their depth.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildTimeline, Handoff, lightTheme, Pinned, resolveTheme, type Storyboard } from "../src/index";
import { Frame } from "../src/render/page";

const BREATHING = { motion: { breathe: { on: true } } };

function board(scene: Partial<Storyboard["scenes"][number]> = {}, themeOverrides?: Storyboard["themeOverrides"]): Storyboard {
  return {
    title: "Camera",
    aspect: "9:16",
    fps: 30,
    theme: "light",
    ...(themeOverrides === undefined ? {} : { themeOverrides }),
    scenes: [{ id: "a", component: "AppWindow", props: { title: "Plan", shareId: "plan" }, narration: "A plan, up close.", durationMs: 5000, ...scene }],
  };
}

function render(sb: Storyboard, frame: number, extra: Record<string, unknown> = {}): string {
  const theme = resolveTheme(sb);
  const timeline = buildTimeline(sb, {}, theme);
  return renderToStaticMarkup(<Frame storyboard={sb} theme={theme} timeline={timeline} frame={frame} {...extra} />);
}

/** The camera world's opening tag. */
const world = (html: string) => /<div data-camera=""[^>]*>/.exec(html)?.[0] ?? "";

describe("the camera world", () => {
  it("wraps the scene's content but not its caption", () => {
    const html = render(board(), 60);
    const start = html.indexOf("data-camera=");
    const caption = html.indexOf("data-caption=");
    expect(start).toBeGreaterThan(-1);
    expect(html.indexOf('data-share-id="plan"')).toBeGreaterThan(start);
    // The caption comes after the world closes: it is a sibling, not inside.
    const inside = html.slice(start, caption);
    const opened = (inside.match(/<div\b/g) ?? []).length;
    const closed = (inside.match(/<\/div>/g) ?? []).length;
    expect(opened).toBe(closed);
  });

  it("stays still, with no transform, when the scene neither breathes nor has shots", () => {
    expect(world(render(board(), 60))).toContain("data-camera");
    expect(world(render(board(), 60))).not.toContain("transform");
  });

  it("moves when breathing is on", () => {
    expect(world(render(board({}, BREATHING), 60))).toMatch(/transform:translate\([^)]*\) scale\(1\.0\d+\)/);
  });

  it("holds the breathing still for the checks, in the steady view", () => {
    expect(world(render(board({}, BREATHING), 60, { camera: "steady" }))).toContain("data-camera");
    expect(world(render(board({}, BREATHING), 60, { camera: "steady" }))).not.toContain("transform");
  });

  it("pushes in to a shot and marks the target's box on screen", () => {
    const sb = board({ shots: [{ atMs: 500, target: { x: 300, y: 500, width: 480, height: 400 } }] });
    expect(world(render(sb, 0))).not.toContain("transform");
    const landed = world(render(sb, 60));
    expect(landed).toMatch(/transform:translate\([^)]*\) scale\(1\.\d+\)/);
    expect(landed).toMatch(/data-camera-shot="[\d.]+ [\d.]+ [\d.]+ [\d.]+"/);
  });

  it("frames an element target once its box is measured", () => {
    const sb = board({ shots: [{ atMs: 500, target: "plan" }] });
    expect(world(render(sb, 60))).not.toContain("transform");
    const targets = new Map([[0, [{ rect: { x: 160, y: 500, width: 760, height: 600 }, depth: 1 }]]]);
    expect(world(render(sb, 60, { targets }))).toMatch(/scale\(1\.\d+\)/);
  });
});

describe("shared morphs under the camera", () => {
  it("draw their copies with the live camera they were measured with, even in the steady view", () => {
    const sb: Storyboard = {
      ...board({}, BREATHING),
      scenes: [
        { id: "a", component: "AppWindow", props: { title: "Plan", shareId: "plan" }, durationMs: 3000, transition: { type: "fade", durationMs: 600 } },
        { id: "b", component: "AppWindow", props: { title: "Plan", shareId: "plan" }, durationMs: 3000 },
      ],
    };
    const box = { x: 160, y: 500, width: 760, height: 600, radius: 24, background: "#ffffff", opacity: 1 };
    const shared = new Map([[0, { from: { plan: box }, to: { plan: box } }]]);
    const html = render(sb, 80, { shared, camera: "steady" });
    const copies = [...html.matchAll(/data-morph-content="(?:from|to)"[^>]*>(<div data-camera=""[^>]*>)/g)].map((m) => m[1]!);
    expect(copies).toHaveLength(2);
    for (const copy of copies) expect(copy).toMatch(/transform:translate/);
  });
});

describe("full-bleed media under a moving camera", () => {
  it("fill the overscan, so a drift never shows their edge", () => {
    const image = { component: "Image", props: { src: "photo.png" } };
    const box = (html: string) => /data-media="image"[^>]*style="([^"]*)"/.exec(html)![1]!;
    expect(box(render(board(image), 60))).toContain("left:0;top:0;width:1080px;height:1920px");
    // 8% larger than the frame, centered on it.
    expect(box(render(board(image, BREATHING), 60))).toContain("left:-43.2px;top:-76.8px;width:1166.4px;height:2073.6px");
  });

  it("fill their dock when docked, camera or not", () => {
    const docked = { component: "Pinned", props: { pinned: { component: "Image", props: { src: "photo.png" } }, content: { component: "Card", props: { icon: "zap", title: "Cached" } } } };
    const box = (html: string) => /data-media="image"[^>]*style="([^"]*)"/.exec(html)![1]!;
    expect(box(render(board(docked, BREATHING), 60))).toEqual(box(render(board(docked), 60)));
  });
});

describe("parallax layers", () => {
  const pinned = {
    pinned: { component: "ChatWindow", props: { channel: "launches", shareId: "chat", messages: [{ author: "Maya", text: "Ready" }] } },
    content: { component: "Card", props: { icon: "zap", title: "Cached fonts" } },
  };

  it("Pinned docks its window on the background layer, under the content on the foreground", () => {
    const html = renderToStaticMarkup(<Pinned progress={0.5} theme={lightTheme} aspect="9:16" {...pinned} />);
    const docked = html.indexOf('data-camera-depth="0.5"');
    const content = html.indexOf('data-camera-depth="1"');
    expect(docked).toBeGreaterThan(-1);
    expect(content).toBeGreaterThan(docked);
    expect(html.indexOf('data-share-id="chat"')).toBeGreaterThan(docked);
    expect(html.indexOf('data-share-id="chat"')).toBeLessThan(content);
    expect(html.indexOf("Cached fonts")).toBeGreaterThan(content);
  });

  it("Pinned's chip floats", () => {
    const html = renderToStaticMarkup(<Pinned progress={0.5} theme={{ ...lightTheme, safe: "crosspost" }} aspect="9:16" {...pinned} />);
    const floating = html.indexOf('data-camera-depth="1.15"');
    expect(floating).toBeGreaterThan(-1);
    expect(html.indexOf("data-pinned-chip")).toBeGreaterThan(floating);
  });

  it("Handoff floats its source above the receiver and the arrow", () => {
    const html = renderToStaticMarkup(
      <Handoff
        progress={0.6}
        theme={lightTheme}
        aspect="9:16"
        from={{ component: "Card", props: { icon: "chat", title: "The prompt" } }}
        to={{ component: "AppWindow", props: { title: "Plan", shareId: "plan" } }}
      />,
    );
    const floating = html.indexOf('data-camera-depth="1.15"');
    expect(floating).toBeGreaterThan(-1);
    expect(html.indexOf('data-handoff="from"')).toBeGreaterThan(floating);
    expect(html.indexOf('data-camera-depth="1"')).toBeGreaterThan(-1);
    // The arrow is drawn over the source's soft shadow, as before.
    expect(html.indexOf("data-arrow-line")).toBeGreaterThan(html.indexOf('data-handoff="from"'));
  });

  it("Handoff keeps its arrow's tail on the floating source while the camera moves", () => {
    const handoff = {
      component: "Handoff",
      props: { from: { component: "Card", props: { icon: "chat", title: "The prompt" } }, to: { component: "AppWindow", props: { title: "Plan", shareId: "plan" } } },
    };
    const start = (html: string) => /data-arrow-line=""[^>]*d="M\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(html)!.slice(1).map(Number);
    const still = start(render(board(handoff), 90));
    const sb = board({ ...handoff, shots: [{ atMs: 0, target: { x: 160, y: 900, width: 760, height: 300 } }] });
    const moving = start(render(sb, 90));
    // The tail moves off its resting point, to where the source's edge now shows.
    expect(Math.hypot(moving[0]! - still[0]!, moving[1]! - still[1]!)).toBeGreaterThan(5);
  });

  it("move by their own share of a moving camera", () => {
    const sb = board({ component: "Pinned", props: pinned, shots: [{ atMs: 0, target: { x: 300, y: 300, width: 480, height: 400 } }] });
    const html = render(sb, 60);
    const layer = (depth: string) => new RegExp(`data-camera-depth="${depth}"[^>]*style="([^"]*)"`).exec(html)?.[1] ?? "";
    expect(layer("0.5")).toMatch(/transform:translate\([^)]*\) scale\(0\.\d+\)/);
    // The foreground moves with the camera itself: no transform of its own.
    expect(layer("1")).not.toContain("transform");
  });
});
