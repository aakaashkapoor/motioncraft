import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  frameAt,
  lightTheme,
  neutralTheme,
  scenesOnScreen,
  soloFrames,
  transitionStyle,
  validateStoryboard,
  type Storyboard,
  type StoryboardScene,
  type Theme,
} from "../src/index";
import { sampleVisibleFrames } from "../src/checks/sample";
import type { FrameMeasurement } from "../src/checks/types";
import { Frame } from "../src/render/page";

function board(fps: number, scenes: Partial<StoryboardScene>[], theme = "light"): Storyboard {
  return {
    title: "Demo",
    aspect: "9:16",
    fps,
    theme,
    scenes: scenes.map((s, i) => ({ id: `s${i}`, component: "TitleCard", props: { title: `Scene ${i}` }, ...s })),
  };
}

const withTransition = (type: Theme["motion"]["transition"], transitionMs = 600): Theme => ({
  ...lightTheme,
  motion: { ...lightTheme.motion, transition: type, transitionMs },
});

describe("buildTimeline: overlapping scenes", () => {
  // 10 fps: 4000 ms = 40 frames, 6000 ms = 60 frames, 3000 ms = 30 frames.
  const sb = board(10, [{ durationMs: 4000, transition: { type: "fade", durationMs: 3000 } }, { durationMs: 6000 }]);
  const tl = buildTimeline(sb, {});

  it("subtracts each transition from the total: 40 + 60 with a 30-frame transition = 70", () => {
    expect(tl.totalFrames).toBe(70);
    expect(tl.scenes).toEqual([
      { id: "s0", startFrame: 0, frames: 40 },
      { id: "s1", startFrame: 10, frames: 60 },
    ]);
    expect(tl.transitions).toEqual([{ type: "fade", startFrame: 10, frames: 30, direction: "left" }]);
  });

  it("shows one scene outside the transition", () => {
    const before = frameAt(tl, 9);
    expect(before).toMatchObject({ sceneIndex: 0, localFrame: 9 });
    expect(before.pair).toBeUndefined();
    expect(before.transition).toBeUndefined();
    expect(scenesOnScreen(before)).toEqual([before]);
    const after = frameAt(tl, 40);
    expect(after).toMatchObject({ sceneIndex: 1, localFrame: 30 });
    expect(after.pair).toBeUndefined();
  });

  it("shows both scenes during the transition, each with its own progress", () => {
    const first = frameAt(tl, 10);
    const [out, into] = first.pair!;
    expect(out).toMatchObject({ sceneIndex: 0, localFrame: 10, transition: { type: "fade", direction: "out" } });
    expect(into).toMatchObject({ sceneIndex: 1, localFrame: 0, progress: 0, transition: { type: "fade", direction: "in" } });
    expect(out.transition!.transitionProgress).toBeCloseTo(0.5 / 30);
    expect(into.transition!.transitionProgress).toBe(out.transition!.transitionProgress);

    const last = frameAt(tl, 39);
    expect(last.pair![0]).toMatchObject({ sceneIndex: 0, localFrame: 39, progress: 1 });
    expect(last.pair![1]).toMatchObject({ sceneIndex: 1, localFrame: 29 });
    expect(last.pair![0].transition!.transitionProgress).toBeCloseTo(29.5 / 30);

    // The top-level fields name the incoming scene.
    expect(first).toMatchObject({ sceneIndex: 1, localFrame: 0 });
    expect(scenesOnScreen(first)).toEqual(first.pair);
  });

  it("transition progress rises through the transition", () => {
    const progress = Array.from({ length: 30 }, (_, k) => frameAt(tl, 10 + k).pair![0].transition!.transitionProgress);
    expect(progress.every((p, i) => p > 0 && p < 1 && (i === 0 || p > progress[i - 1]!))).toBe(true);
    expect(frameAt(tl, 24).pair![0].transition!.transitionProgress).toBeCloseTo(0.483, 2);
  });

  it("knows each scene's solo frames, outside every transition", () => {
    expect(soloFrames(tl, 0)).toEqual({ first: 0, last: 9 });
    expect(soloFrames(tl, 1)).toEqual({ first: 40, last: 69 });
  });
});

describe("buildTimeline: transition defaults", () => {
  const sb = board(30, [{ durationMs: 2000 }, { durationMs: 2000 }, { durationMs: 2000 }]);

  it("applies the theme's default transition to every boundary the storyboard leaves unset", () => {
    const tl = buildTimeline(sb, {}, lightTheme);
    expect(lightTheme.motion.transition).toBe("slide");
    expect(tl.transitions).toEqual([
      { type: "slide", startFrame: 42, frames: 18, direction: "left" },
      { type: "slide", startFrame: 84, frames: 18, direction: "left" },
    ]);
    expect(tl.totalFrames).toBe(180 - 36);
  });

  it("cuts when no theme is given, like v1", () => {
    const tl = buildTimeline(sb, {});
    expect(tl.totalFrames).toBe(180);
    expect(tl.transitions.every((t) => t.type === "cut" && t.frames === 0)).toBe(true);
  });

  it("a storyboard transition overrides the theme's; a cut never overlaps", () => {
    const sb2 = board(30, [
      { durationMs: 2000, transition: { type: "cut", durationMs: 900 } },
      { durationMs: 2000, transition: { type: "zoomBlur", durationMs: 300, direction: "up" } },
      { durationMs: 2000 },
    ]);
    const tl = buildTimeline(sb2, {}, lightTheme);
    expect(tl.transitions).toEqual([
      { type: "cut", startFrame: 60, frames: 0, direction: "left" },
      { type: "zoomBlur", startFrame: 111, frames: 9, direction: "up" },
    ]);
    expect(tl.totalFrames).toBe(171);
  });

  it("ignores a transition on the last scene", () => {
    const sb2 = board(30, [{ durationMs: 1000, transition: { type: "fade" } }]);
    expect(buildTimeline(sb2, {}, lightTheme)).toMatchObject({ totalFrames: 30, transitions: [] });
  });

  it("shortens a transition so every scene keeps a frame of its own", () => {
    // 10 frames each at 30 fps; a 600 ms transition (18 frames) does not fit.
    const short = board(30, [{ durationMs: 333 }, { durationMs: 333 }, { durationMs: 333 }]);
    const tl = buildTimeline(short, {}, lightTheme);
    const [a, b] = tl.transitions;
    expect(a!.frames).toBe(9);
    expect(b!.frames).toBe(0);
    for (let i = 0; i < 3; i++) {
      const { first, last } = soloFrames(tl, i);
      expect(last).toBeGreaterThanOrEqual(first);
    }
    for (let n = 0; n < tl.totalFrames; n++) expect(scenesOnScreen(frameAt(tl, n)).length).toBeLessThanOrEqual(2);
  });

  it("covers every frame with one or two scenes, in order", () => {
    const tl = buildTimeline(sb, {}, lightTheme);
    const seen = new Map<number, number>();
    for (let n = 0; n < tl.totalFrames; n++) {
      for (const scene of scenesOnScreen(frameAt(tl, n))) {
        expect(scene.localFrame).toBe(n - tl.scenes[scene.sceneIndex]!.startFrame);
        seen.set(scene.sceneIndex, (seen.get(scene.sceneIndex) ?? 0) + 1);
      }
    }
    expect([...seen.values()]).toEqual(tl.scenes.map((s) => s.frames));
  });
});

describe("validateStoryboard: transition", () => {
  const input = (transition: unknown) => ({
    title: "T",
    aspect: "9:16",
    scenes: [{ id: "a", component: "TitleCard", props: {}, durationMs: 1000, transition }],
  });

  it("accepts a transition and keeps it", () => {
    const result = validateStoryboard(input({ type: "wipe", durationMs: 400, direction: "right" }));
    expect(result.ok && result.storyboard.scenes[0]!.transition).toEqual({ type: "wipe", durationMs: 400, direction: "right" });
  });

  it("rejects bad transitions", () => {
    const errors = (t: unknown) => (validateStoryboard(input(t)) as { errors: string[] }).errors;
    expect(errors("slide")).toEqual(['scenes[0] ("a"): transition must be an object (got "slide")']);
    expect(errors({ type: "spin" })[0]).toMatch(/transition\.type must be "cut", "fade", "slide", "zoomBlur" or "wipe"/);
    expect(errors({ type: "fade", durationMs: -1 })[0]).toMatch(/transition\.durationMs must be a positive integer/);
    expect(errors({ type: "fade", direction: "sideways" })[0]).toMatch(/transition\.direction must be "left", "right", "up" or "down"/);
    expect(errors({ type: "fade", speed: 2 })[0]).toMatch(/transition: unknown field "speed"/);
  });

  it("accepts a theme default override", () => {
    const result = validateStoryboard({ ...input(undefined), themeOverrides: { motion: { transition: "fade" } } });
    expect(result.ok).toBe(true);
    const bad = validateStoryboard({ ...input(undefined), themeOverrides: { motion: { transition: "spin" } } });
    expect(bad.ok).toBe(false);
  });
});

describe("transitionStyle", () => {
  const size = { width: 1080, height: 1920 };
  const state = (type: "slide" | "zoomBlur" | "fade" | "wipe" | "cut", direction: "in" | "out", p: number, slide = "left" as const) => ({
    type,
    direction,
    transitionProgress: p,
    slideDirection: slide,
  });

  const opacity = (type: "slide" | "fade", direction: "in" | "out", p: number) => Number(transitionStyle(state(type, direction, p), size).opacity);

  it("slide: outgoing travels 0 to -12% of the frame, incoming +12% to 0, in the same direction", () => {
    expect(transitionStyle(state("slide", "out", 0), size)).toMatchObject({ transform: "translate(0px, 0px)", opacity: 1 });
    expect(transitionStyle(state("slide", "in", 1), size)).toMatchObject({ transform: "translate(0px, 0px)", opacity: 1 });
    const outLate = transitionStyle(state("slide", "out", 0.2), size);
    const inEarly = transitionStyle(state("slide", "in", 0.4), size);
    expect(outLate.transform).toMatch(/^translate\(-\d+(\.\d+)?px, 0px\)$/);
    expect(inEarly.transform).toMatch(/^translate\(\d+(\.\d+)?px, 0px\)$/);
    expect(transitionStyle(state("slide", "out", 0.28), size).transform).toBe("translate(-129.6px, 0px)");
    expect(transitionStyle(state("slide", "in", 0.28), size).transform).toBe("translate(129.6px, 0px)");
    // Vertical slides travel on the frame's height.
    expect(transitionStyle(state("slide", "out", 0.28, "up" as never), size).transform).toBe("translate(0px, -230.4px)");
  });

  it("slide: the outgoing scene keeps moving as it fades out by 28%", () => {
    const xs = [0.05, 0.1, 0.15, 0.2, 0.25].map((p) => parseFloat(transitionStyle(state("slide", "out", p), size).transform!.slice(10)));
    expect(xs.every((x, i) => x < 0 && (i === 0 || x < xs[i - 1]!))).toBe(true);
    expect(opacity("slide", "out", 0.14)).toBeCloseTo(0.5, 2);
    expect(opacity("slide", "out", 0.28)).toBe(0);
    expect(opacity("slide", "out", 0.5)).toBeLessThanOrEqual(0.05);
  });

  it("slide: the incoming scene enters at 0.35 opacity as the outgoing one is gone, and is solid by 60%", () => {
    expect(opacity("slide", "in", 0.27)).toBe(0);
    expect(opacity("slide", "in", 0.28)).toBeCloseTo(0.35, 2);
    expect(opacity("slide", "in", 0.5)).toBeGreaterThanOrEqual(0.6);
    expect(opacity("slide", "in", 0.6)).toBe(1);
  });

  it("slide: never two half-visible scenes", () => {
    for (let p = 0; p <= 1; p += 0.01) {
      expect(Math.min(opacity("slide", "out", p), opacity("slide", "in", p))).toBeLessThanOrEqual(0.05);
    }
  });

  it("zoomBlur: outgoing scales up and blurs, incoming scales down from 0.8 and sharpens", () => {
    expect(transitionStyle(state("zoomBlur", "out", 0), size)).toMatchObject({ transform: "scale(1)", filter: "blur(0px)" });
    expect(transitionStyle(state("zoomBlur", "out", 0.6), size)).toMatchObject({ transform: "scale(1.2)", filter: "blur(10px)" });
    expect(transitionStyle(state("zoomBlur", "in", 0.4), size)).toMatchObject({ transform: "scale(0.8)", filter: "blur(10px)" });
    expect(transitionStyle(state("zoomBlur", "in", 1), size)).toMatchObject({ transform: "scale(1)", filter: "blur(0px)" });
  });

  it("fade: outgoing is gone by 55%, incoming starts at 45%", () => {
    expect(opacity("fade", "out", 0)).toBe(1);
    expect(opacity("fade", "out", 0.55)).toBe(0);
    expect(opacity("fade", "in", 0.45)).toBe(0);
    expect(opacity("fade", "in", 0)).toBe(0);
    expect(opacity("fade", "in", 1)).toBe(1);
    for (let p = 0; p <= 1; p += 0.01) {
      expect(Math.min(opacity("fade", "out", p), opacity("fade", "in", p))).toBeLessThanOrEqual(0.05);
    }
  });

  it("wipe masks both sides with complementary soft edges", () => {
    const into = transitionStyle(state("wipe", "in", 0.5), size);
    const out = transitionStyle(state("wipe", "out", 0.5), size);
    expect(into.maskImage).toMatch(/^linear-gradient\(to left, #000 \d.*transparent/);
    expect(out.maskImage).toMatch(/^linear-gradient\(to left, transparent .*#000/);
  });

  it("cut adds nothing", () => {
    expect(transitionStyle(state("cut", "in", 0.5), size)).toEqual({});
  });
});

describe("Frame during a transition", () => {
  const scenes = [
    { id: "one", props: { title: "First" }, durationMs: 2000, transition: { type: "slide" as const } },
    { id: "two", props: { title: "Second" }, durationMs: 2000, transition: { type: "zoomBlur" as const } },
    { id: "three", props: { title: "Third" }, durationMs: 2000 },
  ];
  const sb = board(30, scenes);
  const tl = buildTimeline(sb, {}, lightTheme);
  const render = (frame: number, theme: Theme = lightTheme, timeline = tl, storyboard = sb) =>
    renderToStaticMarkup(createElement(Frame, { storyboard, theme, timeline, frame }));
  const mid = (i: number) => tl.transitions[i]!.startFrame + Math.floor(tl.transitions[i]!.frames / 2);

  /** The opacity of the transition layer holding `text`. */
  const layerOpacity = (html: string, text: string) => {
    const layers = html.split('<div style="position:absolute;inset:0;').slice(1);
    const layer = layers.find((l) => l.includes(text));
    return Number(layer?.match(/^[^"]*opacity:([\d.]+)/)?.[1]);
  };

  it("mid-slide: both scenes move, but only the incoming scene's text is legible", () => {
    const html = render(mid(0));
    expect(html.match(/transform:translate\(/g)).toHaveLength(2);
    expect(layerOpacity(html, "First")).toBeLessThanOrEqual(0.05);
    expect(layerOpacity(html, "Second")).toBeGreaterThanOrEqual(0.6);
  });

  it("mid-zoomBlur applies a blur filter", () => {
    const html = render(mid(1));
    expect(html).toContain("Second");
    expect(html).toContain("Third");
    expect(html).toMatch(/filter:blur\([1-9][\d.]*px\)/);
  });

  it("outside a transition shows one scene, untransformed", () => {
    const html = render(soloFrames(tl, 1).first + 2);
    expect(html).toContain("Second");
    expect(html).not.toContain("First");
    expect(html).not.toContain("Third");
    expect(html).not.toContain("transform:translate(");
    expect(html).not.toContain("blur(");
  });

  it("a storyboard without transitions renders with the theme default", () => {
    const plain = board(30, [{ durationMs: 2000 }, { durationMs: 2000 }]);
    const timeline = buildTimeline(plain, {}, withTransition("fade"));
    expect(timeline.transitions[0]).toMatchObject({ type: "fade", frames: 18 });
    const html = render(51, withTransition("fade"), timeline, plain);
    expect(html).toContain("Scene 0");
    expect(html).toContain("Scene 1");
  });

  it("renders both aspects", () => {
    const wide = { ...sb, aspect: "16:9" as const };
    const html = render(mid(0), neutralTheme, tl, wide);
    expect(html).toMatch(/^<div style="position:relative;width:1920px;height:1080px/);
    expect(html).toContain("transform:translate(-");
  });
});

describe("sampleVisibleFrames skips transitions", () => {
  it("measures only frames where one scene is on screen", async () => {
    const sb = board(30, [{ durationMs: 2000 }, { durationMs: 2000 }, { durationMs: 2000 }]);
    const tl = buildTimeline(sb, {}, lightTheme);
    const visible: FrameMeasurement = {
      texts: [{ opacity: 1 }],
      keys: [],
    } as unknown as FrameMeasurement;
    const measured = await sampleVisibleFrames(tl, async () => visible);
    for (const { frame } of measured) expect(frameAt(tl, frame).pair).toBeUndefined();
    expect(measured.map((m) => m.frame)).toEqual([0, 20, 41, 60, 71, 83, 102, 122, 143]);
  });
});

describe("transition fixtures", () => {
  it.each(["transitions.json", "transitions-wide.json"])("%s is valid and uses every transition type", (file) => {
    const json = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", file), "utf8"));
    const result = validateStoryboard(json);
    expect(result.ok).toBe(true);
    const types = new Set(result.ok ? result.storyboard.scenes.map((s) => s.transition?.type) : []);
    for (const type of ["cut", "fade", "slide", "zoomBlur", "wipe"]) expect(types).toContain(type);
  });
});
