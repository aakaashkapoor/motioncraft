import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, NOMINAL_SCENE_MS, curveEasing, drawPath, frameSize, lightTheme, neutralTheme, type Aspect, type Rect } from "../src/index";
import { kit } from "../src/kit";
import {
  AnchorProvider,
  Arrow,
  anchorPoint,
  arrowGeometry,
  arrowTiming,
  resolveArrowEnds,
  type ArrowProps,
} from "../src/kit/Arrow";

const theme = lightTheme;
/** The line sweeps in on the `mark` token's curve. */
const easing = curveEasing(theme.motion.mark.curve);

type Extra = Omit<ArrowProps, "progress" | "theme" | "aspect">;
const render = (props: Extra, progress: number, aspect: Aspect = "9:16") =>
  renderToStaticMarkup(<Arrow progress={progress} theme={theme} aspect={aspect} {...props} />);

/** The line's path data and dash values. */
function line(html: string): { d: string; dasharray: string; dashoffset: number } {
  const m = /<path[^>]*data-arrow-line[^>]*>/.exec(html)?.[0];
  if (m === undefined) throw new Error(`no arrow line in ${html}`);
  const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(m)?.[1] ?? "";
  return { d: attr("d"), dasharray: attr("stroke-dasharray"), dashoffset: parseFloat(attr("stroke-dashoffset")) };
}

function headOpacity(html: string): number {
  const m = /<polyline[^>]*data-arrow-head[^>]*>/.exec(html)?.[0];
  if (m === undefined) throw new Error(`no arrow head in ${html}`);
  return parseFloat(/opacity="([^"]*)"/.exec(m)?.[1] ?? "NaN");
}

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe("Arrow geometry", () => {
  it("draws a straight arrow as a line from A to B", () => {
    const g = arrowGeometry({ x: 100, y: 200 }, { x: 400, y: 600 }, 0, 20);
    expect(g.length).toBeCloseTo(500, 6);
    close(g.control, { x: 250, y: 400 });
    close(g.mid, { x: 250, y: 400 });
    expect(g.d).toBe("M 100 200 Q 250 400 400 600");
    // The head points along the line, its tip on B.
    close(g.head[1], { x: 400, y: 600 });
    const back = { x: (g.head[0].x + g.head[2].x) / 2, y: (g.head[0].y + g.head[2].y) / 2 };
    close(back, { x: 400 - 0.6 * 20, y: 600 - 0.8 * 20 });
  });

  it("bends a curved arrow to the left of travel for positive curve, right for negative", () => {
    const up = arrowGeometry({ x: 0, y: 500 }, { x: 1000, y: 500 }, 0.5, 20);
    // Control point is `curve` x chord off the midpoint; the curve peaks halfway there.
    close(up.control, { x: 500, y: 0 });
    close(up.mid, { x: 500, y: 250 });
    expect(up.d).toBe("M 0 500 Q 500 0 1000 500");
    // Arc length of this parabola, in closed form.
    const b = 1000;
    const h = 250;
    const exact = Math.sqrt(b * b + 16 * h * h) / 2 + ((b * b) / (8 * h)) * Math.asinh((4 * h) / b);
    expect(up.length).toBeCloseTo(exact, 1);
    expect(up.length).toBeGreaterThan(1000);

    const down = arrowGeometry({ x: 0, y: 500 }, { x: 1000, y: 500 }, -0.5, 20);
    close(down.mid, { x: 500, y: 750 });
  });

  it("aims a curved arrow's head along the curve's final tangent", () => {
    const g = arrowGeometry({ x: 0, y: 500 }, { x: 1000, y: 500 }, 0.5, 20);
    close(g.head[1], { x: 1000, y: 500 });
    // Tangent at the end runs from the control point (500, 0) to (1000, 500): 45 degrees.
    const back = { x: (g.head[0].x + g.head[2].x) / 2, y: (g.head[0].y + g.head[2].y) / 2 };
    close(back, { x: 1000 - 20 / Math.SQRT2, y: 500 - 20 / Math.SQRT2 });
  });

  it("rejects two ends at the same point and a non-finite curve", () => {
    expect(() => arrowGeometry({ x: 5, y: 5 }, { x: 5, y: 5 }, 0, 20)).toThrow(/same point/);
    expect(() => arrowGeometry({ x: 0, y: 0 }, { x: 5, y: 5 }, Number.NaN, 20)).toThrow(/curve/);
  });
});

describe("Arrow anchors", () => {
  const box: Rect = { x: 100, y: 200, width: 300, height: 100 };

  it("puts each side's point at the middle of that edge, pushed out by the gap", () => {
    close(anchorPoint(box, "top", 10), { x: 250, y: 190 });
    close(anchorPoint(box, "bottom", 10), { x: 250, y: 310 });
    close(anchorPoint(box, "left", 10), { x: 90, y: 250 });
    close(anchorPoint(box, "right", 10), { x: 410, y: 250 });
    close(anchorPoint(box, "center", 10), { x: 250, y: 250 });
  });

  it("resolves an arrow between two elements, picking facing sides when none is given", () => {
    const boxes = { a: { x: 0, y: 0, width: 200, height: 100 }, b: { x: 600, y: 0, width: 200, height: 100 } };
    const sideways = resolveArrowEnds({ anchor: "a" }, { anchor: "b" }, boxes, 10);
    close(sideways.start, { x: 210, y: 50 });
    close(sideways.end, { x: 590, y: 50 });

    const stacked = { a: boxes.a, b: { x: 0, y: 800, width: 200, height: 100 } };
    const down = resolveArrowEnds({ anchor: "a" }, { anchor: "b" }, stacked, 10);
    close(down.start, { x: 100, y: 110 });
    close(down.end, { x: 100, y: 790 });
  });

  it("honours an explicit side and mixes anchors with frame points", () => {
    const boxes = { a: { x: 0, y: 0, width: 200, height: 100 } };
    const ends = resolveArrowEnds({ anchor: "a", side: "top" }, { x: 900, y: 900 }, boxes, 10);
    close(ends.start, { x: 100, y: -10 });
    close(ends.end, { x: 900, y: 900 });
  });

  it("names a missing anchor in the error", () => {
    expect(() => resolveArrowEnds({ anchor: "nope" }, { x: 0, y: 0 }, {}, 10)).toThrow(/"nope"/);
  });

  it("finds anchors from elements rendered in the same scene", () => {
    const boxes = { chat: { x: 100, y: 300, width: 300, height: 200 }, cards: { x: 100, y: 1000, width: 300, height: 200 } };
    const html = renderToStaticMarkup(
      <AnchorProvider value={boxes}>
        <Arrow progress={0.5} theme={theme} aspect="9:16" from={{ anchor: "chat" }} to={{ anchor: "cards" }} />
      </AnchorProvider>,
    );
    const gap = theme.spacing.xs;
    const expected = arrowGeometry({ x: 250, y: 500 + gap }, { x: 250, y: 1000 - gap }, 0, 1);
    expect(line(html).d).toBe(expected.d);
  });

  it("lets the storyboard pass anchor boxes as a prop", () => {
    const html = render({ from: { anchor: "a", side: "right" }, to: { x: 900, y: 400 }, anchors: { a: { x: 100, y: 350, width: 200, height: 100 } } }, 0.5);
    expect(line(html).d).toMatch(/^M 316 400 /);
  });
});

describe("Arrow drawing", () => {
  const from = { x: 200, y: 400 };
  const to = { x: 800, y: 1200 };

  it("is registered in the kit", () => {
    expect(kit.Arrow).toBe(Arrow);
  });

  it("sweeps in with the mark token once it starts", () => {
    const { mark } = theme.motion;
    expect(arrowTiming(theme, -10).drawn).toBe(0);
    expect(arrowTiming(theme, mark.ms / 2).drawn).toBeCloseTo(easing(0.5), 9);
    expect(arrowTiming(theme, mark.ms).drawn).toBe(1);
    expect(arrowTiming(theme, mark.ms + 1000).drawn).toBe(1);
    // Over a given duration, from a v2 window.
    expect(arrowTiming(theme, 1000, 2000).drawn).toBeCloseTo(easing(0.5), 9);
  });

  it("starts drawing on the scene's lead, the same in any scene", () => {
    const at = (ms: number) => line(render({ from, to }, ms / NOMINAL_SCENE_MS)).dashoffset;
    expect(at(theme.motion.leadMs)).toBe(1000);
    expect(at(theme.motion.leadMs + theme.motion.mark.ms / 2)).toBeLessThan(1000);
    expect(at(theme.motion.leadMs + theme.motion.mark.ms)).toBe(0);
  });

  it("uses drawPath's dash values: hidden at 0, half drawn at 0.5, whole at 1", () => {
    const length = 1000; // a 600 x 800 line
    const window: [number, number] = [0, 0.8];
    const at = (p: number) => line(render({ from, to, window }, p));
    expect(at(0)).toMatchObject({ dasharray: `${length} ${length}`, dashoffset: length });
    expect(at(0.4).dashoffset).toBeCloseTo(drawPath(easing(0.5), length).strokeDashoffset, 1);
    expect(at(0.8)).toMatchObject({ dasharray: `${length} ${length}`, dashoffset: 0 });
  });

  it("keeps the arrowhead hidden until the line completes", () => {
    const window: [number, number] = [0, 0.8];
    expect(headOpacity(render({ from, to, window }, 0))).toBe(0);
    expect(headOpacity(render({ from, to, window }, 0.4))).toBe(0);
    expect(headOpacity(render({ from, to, window }, 0.6))).toBe(0);
    expect(headOpacity(render({ from, to, window }, 0.8))).toBe(1);
  });

  it("strokes with the theme's accent by default, or another color role", () => {
    expect(render({ from, to }, 0.5)).toContain(`stroke="${theme.colors.accent}"`);
    expect(render({ from, to, color: "textMuted" }, 0.5)).toContain(`stroke="${theme.colors.textMuted}"`);
    expect(() => render({ from, to, color: "#ff0000" as never }, 0.5)).toThrow(/color role/);
  });

  it("puts the label at the curve's midpoint once the line is mostly drawn", () => {
    const g = arrowGeometry(from, to, 0.3, 1);
    const html = render({ from, to, curve: 0.3, label: "Then" }, 0.5);
    expect(html).toContain("Then");
    expect(html).toContain(`left:${Math.round(g.mid.x * 100) / 100}px`);
    const hidden = render({ from, to, curve: 0.3, label: "Then", window: [0, 0.8] }, 0);
    expect(/data-arrow-label[^>]*opacity:0/.test(hidden)).toBe(true);
  });

  it.each(ASPECTS)("fills the frame and fades out at the end (%s)", (aspect) => {
    const html = render({ from, to: { x: 700, y: 900 } }, 1, aspect);
    const { width, height } = frameSize(aspect);
    expect(html).toContain(`width:${width}px`);
    expect(html).toContain(`height:${height}px`);
    expect(html).toMatch(/^<div[^>]*opacity:0[;"]/);
    expect(render({ from, to: { x: 700, y: 900 } }, 0.5, aspect)).toMatch(/^<div[^>]*opacity:1[;"]/);
  });

  it("marks the line as a key element for the safe-area checks", () => {
    expect(render({ from, to }, 0.5)).toContain('data-key-element="arrow"');
  });

  it("works with the neutral theme too", () => {
    const html = renderToStaticMarkup(<Arrow progress={0.5} theme={neutralTheme} aspect="16:9" from={from} to={{ x: 1500, y: 800 }} />);
    expect(html).toContain(neutralTheme.colors.accent);
  });
});
