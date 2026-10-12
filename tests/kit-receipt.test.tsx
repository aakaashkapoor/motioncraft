// Receipt: a paper card in the mono font, tilted a touch, its lines printing
// in top to bottom like paper feeding out of a till: the merchant, the items,
// a dashed divider, the subtotal, tax and tip, another divider and the bold
// total, which pops as it lands.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  NOMINAL_SCENE_MS,
  Receipt,
  contentArea,
  safeZones,
  kit,
  lightTheme,
  receiptErrors,
  receiptLayout,
  receiptLines,
  receiptTiming,
  receiptTotalWarnings,
  type Aspect,
  type ReceiptProps,
  type Storyboard,
} from "../src/index";
import { formatChartValue } from "../src/kit/chart";

const theme = lightTheme;

const BILL = {
  title: "Trattoria Roma",
  items: [
    { label: "Margherita pizza", amount: 14.5 },
    { label: "Truffle pasta", amount: 22 },
    { label: "Caesar salad", amount: 11.25, note: "no croutons" },
    { label: "Tiramisu", amount: 8 },
    { label: "Sparkling water", amount: 4.5 },
  ],
  summary: [
    { label: "Subtotal", amount: 60.25 },
    { label: "Tax", amount: 5.35 },
    { label: "Tip", amount: 12 },
  ],
  total: { amount: 77.6 },
  highlight: 1,
};

const props = (aspect: Aspect, extra: Partial<ReceiptProps> = {}): ReceiptProps => ({ progress: 0, theme, aspect, ...BILL, ...extra });
const renderAt = (aspect: Aspect, ms: number, extra: Partial<ReceiptProps> = {}) =>
  renderToStaticMarkup(<Receipt {...props(aspect, { progress: ms / NOMINAL_SCENE_MS, ...extra })} />);

/** How far each printed line has fed out, 0..1, read from its clip, in order. */
function fed(html: string): number[] {
  return [...html.matchAll(/data-receipt-line="\d+"[^>]*?style="[^"]*?clip-path:inset\(0 0 ([\d.]+)% 0\)/g)].map((m) => Math.round((1 - Number(m[1]) / 100) * 1000) / 1000);
}

describe("Receipt", () => {
  it("is a kit component", () => {
    expect(kit.Receipt).toBeDefined();
  });

  it("prints its lines in order: title, items, divider, summary, divider, total", () => {
    const kinds = receiptLines(props("9:16")).map((line) => line.kind);
    expect(kinds).toEqual(["title", "item", "item", "item", "item", "item", "divider", "summary", "summary", "summary", "divider", "total"]);
    expect(receiptLines(props("9:16", { title: undefined, summary: undefined })).map((l) => l.kind)).toEqual(["item", "item", "item", "item", "item", "divider", "total"]);
  });

  it("starts each line ~90 ms after the one above, the total last", () => {
    const timing = receiptTiming(theme, receiptLines(props("9:16")).length);
    const gaps = timing.lines.slice(1).map((start, i) => start - timing.lines[i]!);
    for (const gap of gaps) expect(gap).toBeCloseTo(90, 0);
    expect(timing.lines[0]).toBeGreaterThan(theme.motion.leadMs);
    expect(timing.total).toBe(timing.lines.at(-1));
    // A long receipt prints tighter, so it still settles early.
    const long = receiptTiming(theme, 20);
    expect(long.lines[1]! - long.lines[0]!).toBeLessThan(90);
    expect(long.settled).toBeLessThanOrEqual(2300);
  });

  it("feeds the lines out top to bottom, each by a clip, not a fade", () => {
    const timing = receiptTiming(theme, receiptLines(props("9:16")).length);
    const html = renderAt("9:16", timing.lines[4]! + 30);
    const shown = fed(html);
    expect(shown).toHaveLength(12);
    // Earlier lines are further out; later ones not started yet.
    for (let i = 1; i < shown.length; i++) expect(shown[i]).toBeLessThanOrEqual(shown[i - 1]!);
    expect(shown[0]).toBe(1);
    expect(shown[4]).toBeGreaterThan(0);
    expect(shown[4]).toBeLessThan(1);
    expect(shown.at(-1)).toBe(0);
    expect(html).not.toMatch(/data-receipt-line="\d+"[^>]*?style="[^"]*?opacity/);
  });

  it.each(ASPECTS)("holds every amount formatted exactly (%s)", (aspect) => {
    const html = renderAt(aspect, 3000);
    expect(fed(html).every((f) => f === 1)).toBe(true);
    const format = { prefix: "$", decimals: 2 };
    for (const { amount } of [...BILL.items, ...BILL.summary, BILL.total]) expect(html).toContain(`>${formatChartValue(amount, format)}<`);
    expect(html).toContain(">$77.60<");
    expect(html).toContain(">Total<");
    expect(html).toContain("Trattoria Roma");
    expect(html).toContain("no croutons");
  });

  it("formats with the given prefix, suffix and decimals", () => {
    const html = renderAt("9:16", 3000, { prefix: "", suffix: " EUR", decimals: 0, total: { label: "Due", amount: 1250 } });
    expect(html).toContain(">1,250 EUR<");
    expect(html).toContain(">Due<");
  });

  it("is tilted by `tilt` (default -2 degrees)", () => {
    expect(renderAt("9:16", 3000)).toContain("rotate(-2deg)");
    expect(renderAt("9:16", 3000, { tilt: 3.5 })).toContain("rotate(3.5deg)");
  });

  it("marks only the highlighted row", () => {
    const html = renderAt("9:16", 3000);
    const marks = [...html.matchAll(/data-receipt-mark="(\d+)"/g)].map((m) => m[1]);
    expect(marks).toEqual(["1"]);
    expect(renderAt("9:16", 3000, { highlight: undefined })).not.toContain("data-receipt-mark");
  });

  it("pops the total as it lands", () => {
    const timing = receiptTiming(theme, receiptLines(props("9:16")).length);
    const scaleAt = (ms: number) => Number(/data-receipt-total=""[^>]*?scale\(([\d.]+)\)/.exec(renderAt("9:16", ms))![1]);
    expect(scaleAt(timing.landed + theme.motion.pop.ms / 2)).toBeGreaterThan(1);
    expect(scaleAt(3000)).toBe(1);
  });

  it.each(ASPECTS)("lays out centered, primary width in 9:16 and at most 720 px in 16:9 (%s)", (aspect) => {
    const { box } = receiptLayout(theme, aspect, BILL);
    const frameWidth = aspect === "9:16" ? 1080 : 1920;
    expect(box.x + box.width / 2).toBeCloseTo(frameWidth / 2, 0);
    if (aspect === "16:9") expect(box.width).toBeLessThanOrEqual(720);
    else expect(box.width).toBe(safeZones(aspect, theme.safe).primaryWidth);
  });

  it("fits twelve items and four summary rows in either frame and a narrow slot, shrinking below the ramp only as a last resort", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ label: `Item ${i + 1}`, amount: i + 1 }));
    const summary = ["Subtotal", "Tax", "Tip", "Fee"].map((label) => ({ label, amount: 1 }));
    const data = { items, summary, title: "Shop", total: { amount: 82 } };
    for (const aspect of ASPECTS) {
      const area = contentArea(theme, aspect);
      const { box } = receiptLayout(theme, aspect, data);
      expect(box.y).toBeGreaterThanOrEqual(area.y);
      expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
    }
    const slot = { x: 96, y: 300, width: 600, height: 900 };
    const nested = receiptLayout(theme, "16:9", data, slot);
    expect(nested.box.width).toBeLessThanOrEqual(slot.width);
    expect(nested.box.height).toBeLessThanOrEqual(slot.height);
    expect(nested.row.size).toBeGreaterThanOrEqual(theme.type.eyebrow["16:9"].size * 0.7);
    expect(receiptLayout(theme, "9:16", BILL).shrunk).toBe(false);
    expect(receiptLayout(theme, "16:9", BILL).shrunk).toBe(false);
  });

  it("keeps long labels on one line and never wraps amounts", () => {
    const html = renderAt("16:9", 3000, { items: [{ label: "A very long item name that goes on and on and on and on", amount: 1234.5 }], summary: [], highlight: undefined });
    expect(html).toMatch(/data-receipt-label=""[^>]*?text-overflow:ellipsis/);
    expect(html).toMatch(/data-receipt-amount=""[^>]*?white-space:nowrap/);
  });

  describe("validation", () => {
    const ok = { items: BILL.items, total: BILL.total };
    it("accepts a valid receipt", () => {
      expect(receiptErrors({ ...BILL })).toEqual([]);
      expect(receiptErrors(ok)).toEqual([]);
    });
    it.each([
      ["no items", { ...ok, items: [] }, /1-12 items/],
      ["13 items", { ...ok, items: Array.from({ length: 13 }, () => ({ label: "x", amount: 1 })) }, /1-12 items/],
      ["5 summary rows", { ...ok, summary: Array.from({ length: 5 }, () => ({ label: "x", amount: 1 })) }, /0-4 rows/],
      ["a negative amount", { ...ok, items: [{ label: "x", amount: -1 }] }, /items\[0\]\.amount/],
      ["an infinite total", { ...ok, total: { amount: Infinity } }, /total\.amount/],
      ["an empty label", { ...ok, items: [{ label: " ", amount: 1 }] }, /items\[0\]\.label/],
      ["tilt 9", { ...ok, tilt: 9 }, /tilt/],
      ["highlight out of range", { ...ok, highlight: 5 }, /highlight/],
      ["fractional highlight", { ...ok, highlight: 0.5 }, /highlight/],
      ["bad decimals", { ...ok, decimals: -1 }, /decimals/],
    ])("rejects %s", (_, input, message) => {
      expect(receiptErrors(input).join("\n")).toMatch(message);
    });
    it("throws when drawn with 13 items or tilt 9", () => {
      expect(() => renderAt("9:16", 1000, { items: Array.from({ length: 13 }, () => ({ label: "x", amount: 1 })) })).toThrow(/Receipt/);
      expect(() => renderAt("9:16", 1000, { tilt: 9 })).toThrow(/tilt/);
    });
  });

  describe("receiptTotalWarnings", () => {
    const board = (receipt: Record<string, unknown>, nested = false): Storyboard =>
      ({
        title: "t",
        aspect: "9:16",
        fps: 30,
        scenes: [
          nested
            ? { id: "bill", component: "Section", props: { headline: "The bill", content: { component: "Receipt", props: receipt } }, durationMs: 3000 }
            : { id: "bill", component: "Receipt", props: receipt, durationMs: 3000 },
        ],
      }) as Storyboard;

    it("is quiet when the sums agree (a subtotal restates the items)", () => {
      expect(receiptTotalWarnings(board(BILL))).toEqual([]);
      expect(receiptTotalWarnings(board({ items: [{ label: "a", amount: 0.1 }, { label: "b", amount: 0.2 }], total: { amount: 0.3 } }))).toEqual([]);
    });

    it("warns when items and summary do not add up to the total", () => {
      const warnings = receiptTotalWarnings(board({ ...BILL, total: { amount: 80 } }));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/scene "bill"/);
      expect(warnings[0]).toMatch(/77\.60/);
      expect(warnings[0]).toMatch(/80\.00/);
    });

    it("warns when a subtotal does not match the items, nested too", () => {
      const summary = [{ label: "Subtotal", amount: 50 }, ...BILL.summary.slice(1)];
      const warnings = receiptTotalWarnings(board({ ...BILL, summary, total: { amount: 67.35 } }, true));
      expect(warnings.join("\n")).toMatch(/Subtotal/);
    });
  });
});
