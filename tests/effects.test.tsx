// Scene effects: a ring or highlight drawn around an element, or a shake or
// pulse of it, at a cue. The timing and geometry are pure; the render draws
// ring and highlight in the camera world at the target's measured box, and
// moves the target itself for shake and pulse.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BigNumber, buildTimeline, Card, effectBox, EFFECT_PADDING_PX, lightTheme, pulseScale, resolveTheme, ringDraw, sceneWords, shakeOffset, StepList, validateStoryboard, type Storyboard } from "../src/index";
import { Frame } from "../src/render/page";

const theme = lightTheme;

describe("effect timing", () => {
  it("draws a ring on over about 400 ms from its cue, and holds", () => {
    expect(ringDraw(theme, -1)).toBe(0);
    expect(ringDraw(theme, 0)).toBe(0);
    expect(ringDraw(theme, 200)).toBeGreaterThan(0);
    expect(ringDraw(theme, 200)).toBeLessThan(1);
    expect(ringDraw(theme, 400)).toBe(1);
    expect(ringDraw(theme, 5000)).toBe(1);
  });

  it("shakes ±8 px, decaying, and ends at offset 0", () => {
    expect(shakeOffset(-10)).toBe(0);
    expect(shakeOffset(0)).toBe(0);
    const samples = Array.from({ length: 36 }, (_, i) => shakeOffset(i * 10));
    expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(8);
    expect(Math.max(...samples.map(Math.abs))).toBeGreaterThan(4);
    expect(samples.some((x) => x < 0) && samples.some((x) => x > 0)).toBe(true);
    expect(shakeOffset(360)).toBe(0);
    expect(shakeOffset(1000)).toBe(0);
    expect(shakeOffset(600, 600)).toBe(0);
  });

  it("pulses 1 -> 1.06 -> 1", () => {
    expect(pulseScale(-1)).toBe(1);
    expect(pulseScale(160)).toBeCloseTo(1.06, 3);
    expect(pulseScale(80)).toBeGreaterThan(1);
    expect(pulseScale(320)).toBe(1);
    expect(pulseScale(1000)).toBe(1);
  });

  it("pads the target's box by 12 px on every side", () => {
    const rect = { x: 100, y: 200, width: 300, height: 80 };
    expect(effectBox(rect)).toEqual({ x: 100 - EFFECT_PADDING_PX, y: 200 - EFFECT_PADDING_PX, width: 300 + 2 * EFFECT_PADDING_PX, height: 80 + 2 * EFFECT_PADDING_PX });
  });
});

const NARRATION = "Three steps, and the second one is where the money moves.";
const TARGET = { x: 160, y: 700, width: 760, height: 120 };

function board(effects: unknown[], scene: Record<string, unknown> = {}): Storyboard {
  const result = validateStoryboard({
    title: "Effects",
    aspect: "9:16",
    scenes: [
      {
        id: "steps",
        component: "StepList",
        props: { items: ["Scan", "Split", "Settle"], shareIds: ["scan", "split", "settle"] },
        narration: NARRATION,
        durationMs: 6000,
        effects,
        ...scene,
      },
    ],
  });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

function render(sb: Storyboard, ms: number, measured = true): string {
  const t = resolveTheme(sb);
  const timeline = buildTimeline(sb, {}, t);
  const effectTargets = measured ? new Map([[0, sb.scenes[0]!.effects!.map(() => ({ rect: TARGET, depth: 1 }))]]) : undefined;
  const frame = Math.round((ms * timeline.fps) / 1000);
  return renderToStaticMarkup(<Frame storyboard={sb} theme={t} timeline={timeline} frame={frame} effectTargets={effectTargets} />);
}

/** The opening tag of the first element marked `data-effect="kind"`. */
const effectTag = (html: string, kind: string) => new RegExp(`<[a-z]+ [^>]*data-effect="${kind}"[^>]*>`).exec(html)?.[0];
const px = (tag: string, key: string) => Number(new RegExp(`${key}:(-?[\\d.]+)px`).exec(tag)?.[1]);

describe("ring and highlight in the render", () => {
  it("is invisible before its cue and drawn after it", () => {
    const sb = board([{ target: "split", kind: "ring", at: 2000 }]);
    expect(effectTag(render(sb, 1900), "ring")).toBeUndefined();
    expect(effectTag(render(sb, 2600), "ring")).toBeDefined();
  });

  it("resolves a word cue through the scene's words", () => {
    const sb = board([{ target: "split", kind: "ring", at: { word: "second" } }]);
    const t = resolveTheme(sb);
    const timeline = buildTimeline(sb, {}, t);
    const words = sceneWords(t, NARRATION, ((timeline.scenes[0]!.frames - 1) * 1000) / timeline.fps);
    const start = words.find((w) => w.text === "second")!.startMs;
    expect(start).toBeGreaterThan(500);
    expect(effectTag(render(sb, start - 100), "ring")).toBeUndefined();
    expect(effectTag(render(sb, start + 500), "ring")).toBeDefined();
  });

  it("encloses the target's measured box", () => {
    for (const kind of ["ring", "highlight"]) {
      const tag = effectTag(render(board([{ target: "split", kind, at: 500 }]), 2000), kind)!;
      expect(tag).toBeDefined();
      expect(px(tag, "left")).toBeLessThanOrEqual(TARGET.x);
      expect(px(tag, "top")).toBeLessThanOrEqual(TARGET.y);
      expect(px(tag, "left") + px(tag, "width")).toBeGreaterThanOrEqual(TARGET.x + TARGET.width);
      expect(px(tag, "top") + px(tag, "height")).toBeGreaterThanOrEqual(TARGET.y + TARGET.height);
    }
  });

  it("draws nothing for a target that is not measured", () => {
    expect(effectTag(render(board([{ target: "split", kind: "ring", at: 500 }]), 2000, false), "ring")).toBeUndefined();
  });

  it("draws in the colour role, accent by default", () => {
    const sb = board([{ target: "split", kind: "ring", at: 500, color: "negative" }]);
    expect(render(sb, 2000).toLowerCase()).toContain(resolveTheme(sb).colors.negative.toLowerCase());
    const plain = board([{ target: "split", kind: "ring", at: 500 }]);
    expect(render(plain, 2000).toLowerCase()).toContain(resolveTheme(plain).colors.accent.toLowerCase());
  });

  it("highlights with a translucent band that sweeps left to right", () => {
    const sb = board([{ target: "split", kind: "highlight", at: 500 }]);
    const early = /data-effect-band=""[^>]*/.exec(render(sb, 600))?.[0] ?? "";
    const done = /data-effect-band=""[^>]*/.exec(render(sb, 2000))?.[0] ?? "";
    expect(px(early, "width")).toBeLessThan(px(done, "width"));
    expect(done).toMatch(/opacity:0\.22/);
  });
});

/** The style rule the scene sets on `[data-share-id="id"]`, if any. */
const ruleFor = (html: string, id: string) => new RegExp(`\\[data-share-id="${id}"\\]\\{([^}]*)\\}`).exec(html.replace(/&quot;/g, '"'))?.[1];

describe("shake and pulse in the render", () => {
  it("shakes the target after its cue only, and ends at rest", () => {
    const sb = board([{ target: "split", kind: "shake", at: 1000 }]);
    expect(ruleFor(render(sb, 900), "split")).toBeUndefined();
    expect(ruleFor(render(sb, 1100), "split")).toMatch(/translate:-?[\d.]+px 0/);
    expect(ruleFor(render(sb, 1500), "split")).toBeUndefined();
  });

  it("pulses the target after its cue only", () => {
    const sb = board([{ target: "split", kind: "pulse", at: 1000 }]);
    expect(ruleFor(render(sb, 900), "split")).toBeUndefined();
    expect(ruleFor(render(sb, 1160), "split")).toMatch(/scale:1\.0\d+/);
    expect(ruleFor(render(sb, 1400), "split")).toBeUndefined();
  });

  it("needs no measured box", () => {
    expect(ruleFor(render(board([{ target: "split", kind: "shake", at: 1000 }]), 1100, false), "split")).toBeDefined();
  });

  it("scopes the rule to its own scene", () => {
    const html = render(board([{ target: "split", kind: "pulse", at: 1000 }]), 1160);
    expect(html.replace(/&quot;/g, '"')).toMatch(/\[data-effects="steps"\] \[data-share-id="split"\]\{/);
    expect(html).toMatch(/data-camera=""[^>]*data-effects="steps"/);
  });
});

describe("effect targets on kit components", () => {
  it("StepList marks each step with its shareId", () => {
    const html = renderToStaticMarkup(<StepList progress={0.8} theme={theme} aspect="9:16" items={["A", "B"]} shareIds={["a", "b"]} />);
    expect(html).toMatch(/<li [^>]*data-share-id="a"/);
    expect(html).toMatch(/<li [^>]*data-share-id="b"/);
  });

  it("BigNumber and Card take a shareId", () => {
    expect(renderToStaticMarkup(<BigNumber progress={0.8} theme={theme} aspect="9:16" value={42} shareId="n" />)).toContain('data-share-id="n"');
    expect(renderToStaticMarkup(<Card progress={0.8} theme={theme} aspect="9:16" title="Owed" shareId="c" />)).toContain('data-share-id="c"');
  });
});

describe("effects validation", () => {
  const errors = (effects: unknown, scene: Record<string, unknown> = {}) => {
    const result = validateStoryboard({
      title: "Effects",
      aspect: "9:16",
      scenes: [{ id: "a", component: "StepList", props: { items: ["Scan", "Split"], shareIds: ["scan", "split"] }, narration: NARRATION, durationMs: 5000, effects, ...scene }],
    });
    return result.ok ? [] : result.errors;
  };

  it("accepts each kind on a step, a word cue, a colour and a duration", () => {
    expect(errors([{ target: "split", kind: "ring", at: { word: "second" } }])).toEqual([]);
    expect(errors([{ target: "scan", kind: "highlight", at: 800, color: "positive" }])).toEqual([]);
    expect(errors([{ target: "scan", kind: "shake", at: 800, color: "negative", durationMs: 400 }])).toEqual([]);
    expect(errors([{ target: "split", kind: "pulse", at: 0, durationMs: 2000 }])).toEqual([]);
  });

  it("finds a shareId nested in the scene's props", () => {
    const pinned = { component: "Pinned", props: { pinned: { component: "BigNumber", props: { value: 3, shareId: "n" } }, content: { component: "Card", props: { title: "x" } } } };
    expect(errors([{ target: "n", kind: "pulse", at: 500 }], pinned)).toEqual([]);
  });

  it("rejects an unknown target", () => {
    expect(errors([{ target: "nope", kind: "ring", at: 500 }])).toEqual([expect.stringMatching(/effects\[0\]\.target "nope" is not a shareId in this scene \(it has "scan", "split"\)/)]);
  });

  it("rejects a bad kind, colour, duration, cue or field", () => {
    expect(errors([{ target: "split", kind: "glow", at: 500 }])).toEqual([expect.stringMatching(/effects\[0\]\.kind must be "ring", "highlight", "shake" or "pulse"/)]);
    expect(errors([{ target: "split", kind: "ring", at: 500, color: "#f00" }])).toEqual([expect.stringMatching(/effects\[0\]\.color must be/)]);
    expect(errors([{ target: "split", kind: "shake", at: 500, durationMs: 50 }])).toEqual([expect.stringMatching(/effects\[0\]\.durationMs must be a whole number from 100 to 2000/)]);
    expect(errors([{ target: "split", kind: "shake", at: 500, durationMs: 2001 }])).toHaveLength(1);
    expect(errors([{ target: "split", kind: "ring", at: { word: "banana" } }])).toEqual([expect.stringMatching(/effects\[0\]\.at: word "banana" is not in this scene's narration/)]);
    expect(errors([{ target: "split", kind: "ring", at: -5 }])).toHaveLength(1);
    expect(errors([{ target: "split", kind: "ring", at: 500, size: 3 }])).toEqual([expect.stringMatching(/effects\[0\]: unknown field "size"/)]);
    expect(errors([{ target: "split", kind: "ring" }])).toHaveLength(1);
    expect(errors({ target: "split" })).toEqual([expect.stringMatching(/effects must be an array/)]);
  });

  it("rejects a cue at or after the end of a fixed-length scene", () => {
    expect(errors([{ target: "split", kind: "ring", at: 5000 }])).toEqual([expect.stringMatching(/effects\[0\]\.at \(5000\) is not before the end of the scene/)]);
  });
});
