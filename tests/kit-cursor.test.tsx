import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Cursor, cursorAt, cursorTiming, darkTheme, lightTheme } from "../src/index";

const theme = lightTheme;
const { cursor, fx } = theme.motion;
const CLICK = 3000;

describe("cursorTiming", () => {
  it("fades in, moves over the cursor token's 600 ms, clicks, then leaves", () => {
    const t = cursorTiming(theme, CLICK);
    expect(t.clickMs).toBe(CLICK);
    expect(t.moveMs).toEqual([CLICK - cursor.ms, CLICK]);
    expect(cursor.ms).toBe(600);
    expect(t.appearMs).toBe(CLICK - cursor.ms - fx.ms);
    // It stays until the ring has faded, then fades out.
    expect(t.leaveMs[0]).toBeGreaterThanOrEqual(CLICK + cursor.ringMs);
    expect(t.leaveMs[1] - t.leaveMs[0]).toBe(fx.ms);
  });
});

describe("cursorAt", () => {
  const distance = (s: { x: number; y: number }) => Math.hypot(s.x, s.y);

  it("is not shown before it appears or after it leaves", () => {
    const t = cursorTiming(theme, CLICK);
    expect(cursorAt(theme, t.appearMs - 1, CLICK).opacity).toBe(0);
    expect(cursorAt(theme, 0, CLICK).opacity).toBe(0);
    expect(cursorAt(theme, t.leaveMs[1] + 1, CLICK).opacity).toBe(0);
  });

  it("waits travelPx from its target, then moves onto it, ease in-out", () => {
    const t = cursorTiming(theme, CLICK);
    const waiting = cursorAt(theme, t.moveMs[0], CLICK);
    expect(waiting.opacity).toBeCloseTo(1, 6);
    expect(distance(waiting)).toBeCloseTo(cursor.travelPx, 3);
    // Ease in-out: a quarter of the way in time is well under a quarter of the way in space.
    const quarter = cursorAt(theme, t.moveMs[0] + cursor.ms / 4, CLICK);
    expect(distance(quarter)).toBeGreaterThan(cursor.travelPx * 0.75);
    const half = cursorAt(theme, t.moveMs[0] + cursor.ms / 2, CLICK);
    expect(distance(half)).toBeGreaterThan(0);
    expect(distance(half)).toBeLessThan(cursor.travelPx);
    const landed = cursorAt(theme, CLICK, CLICK);
    expect(landed.x).toBeCloseTo(0, 6);
    expect(landed.y).toBeCloseTo(0, 6);
  });

  it("fires the click at the click time: a press 0.92 -> 1 and a soft ring", () => {
    expect(cursorAt(theme, CLICK - 1, CLICK).clicked).toBe(false);
    expect(cursorAt(theme, CLICK - 1, CLICK).ring.opacity).toBe(0);
    expect(cursorAt(theme, CLICK - 1, CLICK).scale).toBe(1);
    const click = cursorAt(theme, CLICK, CLICK);
    expect(click.clicked).toBe(true);
    expect(click.scale).toBeCloseTo(cursor.pressScale, 6);
    expect(click.ring.opacity).toBeCloseTo(cursor.ringOpacity, 6);
    const mid = cursorAt(theme, CLICK + cursor.ringMs / 2, CLICK);
    expect(mid.ring.size).toBeGreaterThan(click.ring.size);
    expect(mid.ring.opacity).toBeLessThan(click.ring.opacity);
    expect(cursorAt(theme, CLICK + cursor.pressMs, CLICK).scale).toBeCloseTo(1, 6);
    expect(cursorAt(theme, CLICK + cursor.ringMs, CLICK).ring.opacity).toBeCloseTo(0, 6);
    expect(cursorAt(theme, CLICK + cursor.ringMs, CLICK).ring.size).toBeCloseTo(cursor.ringPx, 6);
    expect(cursorAt(theme, CLICK + 5000, CLICK).clicked).toBe(true);
  });
});

describe("Cursor", () => {
  const render = (ms: number, t = theme) => renderToStaticMarkup(<Cursor theme={t} ms={ms} clickMs={CLICK} />);

  it("draws an arrow pointer the size of the token, offset from its target", () => {
    const html = render(CLICK - cursor.ms / 2);
    expect(html).toContain("data-cursor");
    expect(html).toContain("<svg");
    expect(html).toContain(`height="${cursor.sizePx}"`);
    expect(html).toMatch(/translate\(-?[\d.]+px, -?[\d.]+px\)/);
    expect(html).not.toContain("data-cursor-ring");
  });

  it("shows the ring only around the click, in the text colour so it shows on an accent button", () => {
    expect(render(CLICK)).toMatch(new RegExp(`data-cursor-ring[^>]*background-color:${theme.colors.text}`));
    expect(render(CLICK + cursor.ringMs + 1)).not.toContain("data-cursor-ring");
  });

  it("draws nothing while hidden, and works with any theme", () => {
    expect(render(0)).toBe("");
    expect(render(CLICK, darkTheme)).toContain("data-cursor");
  });
});
