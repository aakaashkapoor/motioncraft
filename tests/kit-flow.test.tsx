// Flowing connectors (design v3, life #11): once a connector has drawn, an
// accent dot travels it every 1.4 s (expo in-out), and along a FlowDiagram the
// node the dot reaches glows, one node at a time, in sequence.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Arrow,
  FlowDiagram,
  Handoff,
  SceneClockContext,
  arrowGeometry,
  curveEasing,
  flowDiagramLayout,
  flowDiagramTiming,
  flowDot,
  flowGlow,
  lightTheme,
  mixColors,
  neutralTheme,
  pointAlong,
  withAlpha,
  type Aspect,
  type Point,
} from "../src/index";

const theme = lightTheme;
const { flow, leadMs, mark, enter, fx } = theme.motion;
const ease = curveEasing(flow.curve);

/** Renders `element` `ms` into a 20 s scene, on a clock that counts whole ms. */
function at(ms: number, element: ReactElement): string {
  return renderToStaticMarkup(<SceneClockContext.Provider value={{ fps: 1000, frame: ms, frames: 20001 }}>{element}</SceneClockContext.Provider>);
}

/** The flowing dot's centre and opacity, or undefined when none is drawn. */
function dotOf(html: string): { x: number; y: number; opacity: number } | undefined {
  const g = /<g data-flow-dot=""[^>]*>/.exec(html)?.[0];
  if (g === undefined) return undefined;
  const m = /transform="translate\(([-\d.]+) ([-\d.]+)\)"/.exec(g);
  if (m === null) throw new Error(`no translate on ${g}`);
  return { x: parseFloat(m[1]!), y: parseFloat(m[2]!), opacity: parseFloat(/opacity="([^"]*)"/.exec(g)?.[1] ?? "NaN") };
}

const close = (a: Point, b: Point, digits = 1) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
};

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Which nodes are lit: each glow within 0.05 of `expected`. */
function expectLit(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((g, i) => expect(g, `node ${i} of ${JSON.stringify(actual)}`).toBeCloseTo(expected[i]!, 1));
}

describe("pointAlong", () => {
  it("walks a straight arrow evenly from start to end", () => {
    const g = arrowGeometry({ x: 100, y: 200 }, { x: 400, y: 600 }, 0, 20);
    close(pointAlong(g, 0), { x: 100, y: 200 }, 6);
    close(pointAlong(g, 0.25), { x: 175, y: 300 }, 6);
    close(pointAlong(g, 1), { x: 400, y: 600 }, 6);
  });

  it("measures a curve by arc length, so equal fractions are equal distances", () => {
    const g = arrowGeometry({ x: 0, y: 500 }, { x: 1000, y: 500 }, 0.5, 20);
    close(pointAlong(g, 0), g.start, 6);
    close(pointAlong(g, 1), g.end, 6);
    // Symmetric, so halfway along is the curve's midpoint.
    close(pointAlong(g, 0.5), g.mid, 1);
    const points = Array.from({ length: 11 }, (_, i) => pointAlong(g, i / 10));
    const steps = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
    for (const step of steps) expect(step).toBeCloseTo(g.length / 10, 0);
  });

  it("clamps fractions outside 0..1 to the ends", () => {
    const g = arrowGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, 0, 10);
    close(pointAlong(g, -1), g.start, 6);
    close(pointAlong(g, 2), g.end, 6);
  });
});

describe("flowDot", () => {
  it("is not there until the line has drawn", () => {
    expect(flowDot(theme, -1)).toBeUndefined();
  });

  it("travels the line once per flow token, expo in-out", () => {
    expect(flowDot(theme, 0)).toEqual({ trip: 0, along: 0, opacity: 0 });
    expect(flowDot(theme, flow.ms / 4)!.along).toBeCloseTo(ease(0.25), 9);
    expect(flowDot(theme, flow.ms / 2)).toMatchObject({ trip: 0, along: 0.5, opacity: 1 });
    expect(flowDot(theme, (3 * flow.ms) / 4)!.along).toBeCloseTo(ease(0.75), 9);
    // Every 1.4 s it sets off again.
    expect(flowDot(theme, flow.ms)).toEqual({ trip: 1, along: 0, opacity: 0 });
    expect(flowDot(theme, 1.5 * flow.ms)).toMatchObject({ trip: 1, along: 0.5, opacity: 1 });
    expect(flowDot(theme, 7.5 * flow.ms)).toMatchObject({ trip: 7, along: 0.5, opacity: 1 });
  });

  it("is off when the flow token has no duration", () => {
    const off = { ...theme, motion: { ...theme.motion, flow: { ...flow, ms: 0 } } };
    expect(flowDot(off, 1000)).toBeUndefined();
    expect(flowGlow(off, 3, 1000)).toEqual([0, 0, 0]);
    const html = at(3000, <Arrow progress={0} theme={off} aspect="9:16" from={{ x: 200, y: 400 }} to={{ x: 800, y: 1200 }} />);
    expect(html).not.toContain("data-flow-dot");
  });

  it("fades in as it leaves and out as it lands, so a new trip never jumps", () => {
    const fast = theme.motion["fx.fast"].ms;
    expect(flowDot(theme, fast)!.opacity).toBe(1);
    expect(flowDot(theme, flow.ms - fast)!.opacity).toBe(1);
    expect(flowDot(theme, flow.ms - 1)!.opacity).toBeLessThan(0.1);
    expect(flowDot(theme, flow.ms - 1)!.along).toBeCloseTo(1, 3);
  });
});

describe("Arrow: a dot flows along it", () => {
  const from = { x: 200, y: 400 };
  const to = { x: 800, y: 1200 };
  const drawn = leadMs + mark.ms;
  const arrow = (props: Record<string, unknown> = {}, aspect: Aspect = "9:16") => <Arrow progress={0} theme={theme} aspect={aspect} from={from} to={to} {...props} />;

  it("draws no dot while the line is drawing", () => {
    expect(dotOf(at(leadMs, arrow()))).toBeUndefined();
    expect(dotOf(at(drawn - 1, arrow()))).toBeUndefined();
    expect(dotOf(at(drawn, arrow()))).toMatchObject({ ...from, opacity: 0 });
  });

  it("puts the dot where the flow token says, at given ms", () => {
    close(dotOf(at(drawn + flow.ms / 2, arrow()))!, { x: 500, y: 800 });
    close(dotOf(at(drawn + flow.ms / 4, arrow()))!, lerp(from, to, ease(0.25)));
    close(dotOf(at(drawn + (3 * flow.ms) / 4, arrow()))!, lerp(from, to, ease(0.75)));
    // The next trip, 1.4 s later.
    close(dotOf(at(drawn + 1.5 * flow.ms, arrow()))!, { x: 500, y: 800 });
    expect(dotOf(at(drawn + 1.5 * flow.ms, arrow()))!.opacity).toBe(1);
  });

  it("follows a curved arrow by arc length", () => {
    const g = arrowGeometry(from, to, 0.3, 1);
    close(dotOf(at(drawn + flow.ms / 2, arrow({ curve: 0.3 })))!, pointAlong(g, 0.5));
    close(dotOf(at(drawn + (3 * flow.ms) / 4, arrow({ curve: 0.3 })))!, pointAlong(g, ease(0.75)));
  });

  it("starts flowing when a v2 window has finished drawing", () => {
    // [0.1, 0.2] of a 20 s scene: drawn at 4 s.
    expect(dotOf(at(3999, arrow({ window: [0.1, 0.2] })))).toBeUndefined();
    close(dotOf(at(4000 + flow.ms / 2, arrow({ window: [0.1, 0.2] })))!, { x: 500, y: 800 });
  });

  it("is a 10-14 px accent dot in a disc of the flow glow that cuts the line, so it reads on an accent line", () => {
    const html = at(drawn + flow.ms / 2, arrow({ color: "text" }));
    const g = /<g data-flow-dot=""[^>]*>(.*?)<\/g>/.exec(html)?.[1] ?? "";
    expect(g).toContain(`r="${flow.dotPx / 2}" fill="${theme.colors.accent}"`);
    expect(g).toContain(`r="${flow.dotPx / 2 + flow.glowPx}" fill="${mixColors(theme.colors.ground, theme.colors.accent, flow.glowOpacity)}"`);
  });

  it("flows in a Handoff too", () => {
    const handoff = (
      <Handoff
        progress={0}
        theme={theme}
        aspect="9:16"
        from={{ component: "Card", props: { icon: "chat", title: "The prompt" } }}
        to={{ component: "AppWindow", props: { title: "Plan" } }}
      />
    );
    expect(dotOf(at(2000, handoff))).toBeDefined();
  });
});

const NODES = ["Prompt", "Storyboard", "Render", "Video"];

/** Opacity of each node's glow, in order. */
function glows(html: string): number[] {
  return [...html.matchAll(/data-flow-glow=""[^>]*?style="([^"]*)"/g)].map((m) => parseFloat(/opacity:([^;]*)/.exec(m[1]!)?.[1] ?? "NaN"));
}

describe("flowGlow", () => {
  const steps = (ms: number) => flowGlow(theme, NODES.length, ms);

  it("lights nothing before the flow starts", () => {
    expect(steps(-1)).toEqual([0, 0, 0, 0]);
  });

  it("lights the first node as the dot appears on it", () => {
    expect(steps(0)).toEqual([0, 0, 0, 0]);
    expectLit(steps(theme.motion["fx.fast"].ms), [1, 0, 0, 0]);
  });

  it("lights each node as the dot arrives, one after another", () => {
    // The dot reaches node k + 1 at the end of trip k.
    expect(steps(flow.ms)).toEqual([0, 1, 0, 0]);
    expect(steps(2 * flow.ms)).toEqual([0, 0, 1, 0]);
    expectLit(steps(3 * flow.ms - theme.motion["fx.fast"].ms), [0, 0, 0, 1]);
    // Midway, the light is in the dot: no node is lit.
    expect(steps(1.5 * flow.ms)).toEqual([0, 0, 0, 0]);
    // Lighting follows the dot in: the next node brightens as it closes in.
    const arriving = [1.6, 1.7, 1.8, 1.9].map((k) => steps(k * flow.ms)[2]!);
    for (let i = 1; i < arriving.length; i++) expect(arriving[i]).toBeGreaterThan(arriving[i - 1]!);
  });

  it("starts over from the first node after the last", () => {
    expect(steps(3 * flow.ms)).toEqual([0, 0, 0, 0]);
    expectLit(steps(3 * flow.ms + theme.motion["fx.fast"].ms), [1, 0, 0, 0]);
    expect(steps(4 * flow.ms)).toEqual([0, 1, 0, 0]);
  });

  it("never lights more than one node at a time, and changes smoothly", () => {
    let previous = steps(0);
    for (let ms = 0; ms <= 6 * flow.ms; ms += 5) {
      const now = steps(ms);
      expect(now.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1 + 1e-9);
      now.forEach((g, i) => expect(Math.abs(g - previous[i]!)).toBeLessThan(0.35));
      previous = now;
    }
  });

  it("works for two nodes: one arrow, lit at each end", () => {
    expectLit(flowGlow(theme, 2, theme.motion["fx.fast"].ms), [1, 0]);
    expect(flowGlow(theme, 2, flow.ms / 2)).toEqual([0, 0]);
    expectLit(flowGlow(theme, 2, flow.ms - theme.motion["fx.fast"].ms), [0, 1]);
  });
});

describe("FlowDiagram: nodes light in sequence", () => {
  const diagram = (aspect: Aspect = "9:16", t = theme) => <FlowDiagram progress={0} theme={t} aspect={aspect} nodes={NODES} caption="From idea to video" />;
  const timing = flowDiagramTiming(theme, NODES.length);

  it("starts the flow once the diagram has built", () => {
    expect(timing.flow).toBe(Math.max(timing.nodes.at(-1)! + enter.ms, timing.arrows.at(-1)! + mark.ms, timing.caption + fx.ms));
    expect(timing.flow).toBeLessThanOrEqual(theme.motion.cascadeMs);
  });

  it("lights no node while the diagram builds", () => {
    for (const ms of [0, leadMs, timing.arrows.at(-1)!, timing.flow]) {
      const html = at(ms, diagram());
      expect(glows(html)).toEqual([0, 0, 0, 0]);
      expect(dotOf(html)?.opacity ?? 0).toBe(0);
    }
  });

  it.each(["9:16", "16:9"] as const)("has the active node glowing as the dot arrives, at given ms (%s)", (aspect) => {
    const fast = theme.motion["fx.fast"].ms;
    expectLit(glows(at(timing.flow + fast, diagram(aspect))), [1, 0, 0, 0]);
    expect(glows(at(timing.flow + flow.ms, diagram(aspect)))).toEqual([0, 1, 0, 0]);
    expect(glows(at(timing.flow + 2 * flow.ms, diagram(aspect)))).toEqual([0, 0, 1, 0]);
    expectLit(glows(at(timing.flow + 3 * flow.ms - fast, diagram(aspect))), [0, 0, 0, 1]);
    expectLit(glows(at(timing.flow + 3 * flow.ms + fast, diagram(aspect))), [1, 0, 0, 0]);
  });

  it.each(["9:16", "16:9"] as const)("sends the dot down each arrow in turn, at given ms (%s)", (aspect) => {
    // In the diagram's own px, like its arrows.
    const { arrows } = flowDiagramLayout(theme, aspect, NODES, "From idea to video");
    const middle = (i: number) => ({ x: (arrows[i]!.x1 + arrows[i]!.x2) / 2, y: (arrows[i]!.y1 + arrows[i]!.y2) / 2 });
    for (const i of [0, 1, 2]) close(dotOf(at(timing.flow + (i + 0.5) * flow.ms, diagram(aspect)))!, middle(i));
    // Then back to the first arrow.
    close(dotOf(at(timing.flow + 3.5 * flow.ms, diagram(aspect)))!, middle(0));
    // Three quarters of the way through a trip, the dot is closing in on the next node.
    const a = arrows[1]!;
    close(dotOf(at(timing.flow + 1.75 * flow.ms, diagram(aspect)))!, lerp({ x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }, ease(0.75)));
  });

  it("glows with a 6 px ring of the accent at 25%, and an accent edge", () => {
    const html = at(timing.flow + flow.ms, diagram());
    const lit = [...html.matchAll(/data-flow-glow=""[^>]*?style="([^"]*)"/g)][1]![1]!;
    expect(lit).toContain(`box-shadow:0 0 0 ${flow.glowPx}px ${withAlpha(theme.colors.accent, flow.glowOpacity)}`);
    expect(lit).toContain(`solid ${theme.colors.accent}`);
  });

  it("keeps unlit nodes on a quiet border, so only the active one is accented", () => {
    const html = at(timing.flow + flow.ms, diagram());
    const borders = [...html.matchAll(/data-flow-node="\d+"[^>]*?style="([^"]*)"/g)].map((m) => /(?:^|;)border:([^;]*)/.exec(m[1]!)?.[1] ?? "");
    for (const border of borders) expect(border).toContain(theme.colors.border);
  });

  it("flows in the neutral theme too", () => {
    const t = flowDiagramTiming(neutralTheme, NODES.length);
    expect(glows(at(t.flow + neutralTheme.motion.flow.ms, diagram("16:9", neutralTheme)))).toEqual([0, 1, 0, 0]);
  });
});
