// Annotate's circle closes on itself: its pen loop goes round a little more
// than once, and the overlap must run along the ellipse, not spiral off it.
// tests/fixtures/annotate.json frame 186 drew the start inside the loop and the
// end outside, so the start read as a stray accent stroke under the line above.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Annotate, ASPECTS, NOMINAL_SCENE_MS, annotateLayout, lightTheme, type Aspect } from "../src/index";
import { circleEllipse, circleMarkStroke } from "../src/kit/annotateCircle";

const theme = lightTheme;
const CIRCLE = { text: "Latency fell 40 percent", mark: "40 percent", note: "p99, last quarter", markStyle: "circle" as const, notePosition: "above" as const };

const points = (d: string) => [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));

/** How far `p` is from the ellipse, in px along its radius. */
function offEllipse(p: { x: number; y: number }, e: { cx: number; cy: number; rx: number; ry: number }): number {
  const dx = p.x - e.cx;
  const dy = p.y - e.cy;
  const r = Math.hypot(dx / e.rx, dy / e.ry);
  return Math.abs(1 - r) * Math.hypot(dx, dy) / Math.max(r, 1e-9);
}

describe.each(ASPECTS)("Annotate circle (%s)", (aspect: Aspect) => {
  const layout = annotateLayout(theme, aspect, CIRCLE);
  const box = layout.mark;

  it.each([0, 1, 7, "x"])("starts and ends on the ellipse, within its stroke width (seed %s)", (seed) => {
    const stroke = circleMarkStroke(theme, box.width, box.height, layout.spec, `${seed}:${CIRCLE.mark}`);
    const ellipse = circleEllipse(theme, box.width, box.height);
    const pts = points(stroke.d);
    expect(offEllipse(pts[0]!, ellipse)).toBeLessThanOrEqual(stroke.width);
    expect(offEllipse(pts.at(-1)!, ellipse)).toBeLessThanOrEqual(stroke.width);
    // The overlap, where the loop passes its start again, stays on the ellipse: no tail inside or out.
    const overlap = Math.ceil(pts.length * 0.1);
    for (const p of [...pts.slice(0, overlap), ...pts.slice(-overlap)]) expect(offEllipse(p, ellipse)).toBeLessThanOrEqual(stroke.width);
    // And nothing leaves the mark's box by more than half the stroke.
    const tolerance = stroke.width / 2 + 0.5;
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(-tolerance);
      expect(p.x).toBeLessThanOrEqual(box.width + tolerance);
      expect(p.y).toBeGreaterThanOrEqual(-tolerance);
      expect(p.y).toBeLessThanOrEqual(box.height + tolerance);
    }
  });

  it("still wanders: not a perfect ellipse", () => {
    const stroke = circleMarkStroke(theme, box.width, box.height, layout.spec, `0:${CIRCLE.mark}`);
    const ellipse = circleEllipse(theme, box.width, box.height);
    const most = Math.max(...points(stroke.d).map((p) => offEllipse(p, ellipse)));
    expect(most).toBeGreaterThan(1);
  });

  it("Annotate draws the closed circle", () => {
    const html = renderToStaticMarkup(<Annotate progress={3000 / NOMINAL_SCENE_MS} theme={theme} aspect={aspect} {...CIRCLE} />);
    const d = /data-annotate-mark=""[^>]*?\sd="([^"]+)"/.exec(html)![1]!;
    expect(d).toBe(circleMarkStroke(theme, box.width, box.height, layout.spec, `0:${CIRCLE.mark}`).d);
  });
});
