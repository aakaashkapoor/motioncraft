// Fill the frame (design v3, section C) for Receipt, Notification and
// ScrambleText: in 9:16 each one's primary visual spans the primary width,
// centered on the frame's center line, with type from the ramp's 9:16 steps.
// The Receipt's tilted card stays inside its slot, rotation included. 16:9
// keeps the layouts the visual review found fine.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Notification,
  Receipt,
  ScrambleText,
  SceneClockContext,
  contentArea,
  frameSize,
  kit,
  lightTheme,
  safeZones,
  scrambleTextLayout,
  sectionLayout,
  textColumn,
  type Aspect,
  type Rect,
} from "../src/index";
// Not on the package's public surface: the card's layout, rotation included.
import { receiptFit } from "../src/kit/receiptFit";

const theme = lightTheme;
const TALL = "9:16";
const WIDE = "16:9";
const PRIMARY = safeZones(TALL, theme.safe).primaryWidth;
const MID = frameSize(TALL).width / 2;

/** Spans at least 85% of the primary width and is centered on the frame's center line (within 5% of the primary width). */
function expectFills(left: number, right: number) {
  expect(right - left).toBeGreaterThanOrEqual(0.85 * PRIMARY);
  expect(Math.abs((left + right) / 2 - MID)).toBeLessThanOrEqual(0.05 * PRIMARY);
}

/** The axis-aligned box a rect covers once turned `deg` degrees about its center. */
function turned(box: Rect, deg: number): Rect {
  const rad = (Math.abs(deg) * Math.PI) / 180;
  const width = box.width * Math.cos(rad) + box.height * Math.sin(rad);
  const height = box.height * Math.cos(rad) + box.width * Math.sin(rad);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

function expectInside(inner: Rect, outer: Rect) {
  const eps = 0.5;
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - eps);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - eps);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + eps);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + eps);
}

/** A style's number, e.g. `left` of `left:12.5px;top:3px`. */
function num(style: string, key: string): number {
  const m = new RegExp(`(?:^|;)${key}:(-?[\\d.]+)`).exec(style);
  if (m === null) throw new Error(`no ${key} in ${style}`);
  return Number(m[1]);
}

// tests/fixtures/receipt.json and receipt-wide.json.
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
};
/** Scene 2's Section: the receipt is in its content slot, tilted +2. */
const splitSlot = (aspect: Aspect) => sectionLayout(theme, aspect, { eyebrow: "Split four ways", headline: "Everyone pays $19.40" }).content;

describe("Receipt fills the frame and keeps its tilted card in its slot", () => {
  it("spans the primary width in 9:16, centered, with rows at the body step (the label step is the floor)", () => {
    const fit = receiptFit(theme, TALL, BILL, undefined, -2);
    expectFills(fit.box.x, fit.box.x + fit.box.width);
    expect(fit.shrunk).toBe(false);
    expect(fit.row.size).toBeGreaterThanOrEqual(theme.type.label[TALL].size);
    expect(fit.row.size).toBe(theme.type.body[TALL].size);
    expect(fit.note.size).toBeGreaterThanOrEqual(theme.type.label[TALL].size);
  });

  it.each([
    ["9:16 alone", TALL, undefined, -2],
    ["9:16 in a Section", TALL, splitSlot(TALL), 2],
    ["16:9 alone", WIDE, undefined, -2],
    ["16:9 in a Section (receipt-wide scene 2)", WIDE, splitSlot(WIDE), 2],
    ["16:9 tilted the most", WIDE, undefined, 4],
  ] as const)("keeps the rotated card inside its slot and the safe area (%s)", (_, aspect, slot, tilt) => {
    const fit = receiptFit(theme, aspect, BILL, slot, tilt);
    const bounds = turned(fit.box, tilt);
    expectInside(bounds, slot ?? contentArea(theme, aspect));
    expectInside(bounds, safeZones(aspect, theme.safe).area);
  });

  it("keeps the 16:9 card the size it was", () => {
    for (const slot of [undefined, splitSlot(WIDE)]) {
      const fit = receiptFit(theme, WIDE, BILL, slot, 2);
      expect(fit.box.width).toBe(720);
      expect(fit.row.size).toBe(theme.type.mono[WIDE].size);
      expect(fit.shrunk).toBe(false);
    }
  });

  it("draws the card where the fit puts it", () => {
    const fit = receiptFit(theme, TALL, BILL, undefined, -2);
    const area = contentArea(theme, TALL);
    const html = renderToStaticMarkup(<Receipt progress={0.5} theme={theme} aspect={TALL} {...BILL} />);
    const style = /data-block="Receipt" style="([^"]*)"/.exec(html)![1]!;
    expect(num(style, "left") + area.x).toBeCloseTo(fit.box.x, 1);
    expect(num(style, "top") + area.y).toBeCloseTo(fit.box.y, 1);
    expect(num(style, "width")).toBeCloseTo(fit.box.width, 1);
    expect(html).toContain(`font-size:${theme.type.body[TALL].size}px`);
  });
});

describe("Notification gives its content the whole slot", () => {
  const TERMINAL = { component: "TerminalWindow", props: { lines: [{ prompt: true, text: "npm run deploy" }, { text: "building web-app..." }, { text: "done in 4.2s" }] } };
  const NOTES = [{ app: "Deploys", title: "Deploy finished", body: "web-app is live on production", icon: "check", time: "now" }];
  const window = (html: string) => {
    const style = /data-window="terminal"[^>]*?style="([^"]*)"/.exec(html)![1]!;
    return { left: num(style, "left"), top: num(style, "top"), width: num(style, "width"), height: num(style, "height") };
  };
  const scaled = /transform:scale\(0\.\d+\)/;

  it("draws the content at full size across the primary width in 9:16, the banner over it", () => {
    const html = renderToStaticMarkup(<Notification progress={0.6} theme={theme} aspect={TALL} notifications={NOTES} content={TERMINAL} />);
    expect(html).not.toMatch(scaled);
    const w = window(html);
    expectFills(w.left, w.left + w.width);
  });

  it.each([TALL, WIDE] as const)("lays the content out in a Section's slot at full size, as it would lay out there alone (%s)", (aspect) => {
    const slot = sectionLayout(theme, aspect, { headline: "Deploys, as they land" }).content;
    const html = renderToStaticMarkup(<Notification progress={0.6} theme={theme} aspect={aspect} area={slot} notifications={NOTES} content={TERMINAL} />);
    expect(html).toContain("data-notification-content");
    expect(html).not.toMatch(scaled);
    const Terminal = kit.TerminalWindow!;
    const alone = window(renderToStaticMarkup(<Terminal {...TERMINAL.props} progress={0.6} theme={theme} aspect={aspect} area={slot} />));
    // The nested component is drawn in frame coordinates, so the content box sits at (0, 0) of the frame.
    const nested = window(html);
    expect(nested).toEqual(alone);
    if (aspect === TALL) expectFills(nested.left, nested.left + nested.width);
  });
});

describe("ScrambleText takes the ramp step that fits the primary width", () => {
  const FPS = 30;
  const draw = (props: { text: string; style?: "clean" | "terminal"; label?: string }, aspect: Aspect) =>
    renderToStaticMarkup(
      <SceneClockContext.Provider value={{ fps: FPS, frame: 90, frames: 150 }}>
        <ScrambleText {...props} progress={0.6} theme={theme} aspect={aspect} />
      </SceneClockContext.Provider>,
    );
  const fontSize = (html: string) => Number(/data-scramble-line=""[^>]*?font-size:([\d.]+)px/.exec(html)![1]);

  it("sets a short word at the hero step in 9:16", () => {
    const layout = scrambleTextLayout(theme, TALL, "SHIP", "clean", undefined);
    expect(layout.size).toBe(theme.type.hero[TALL].size);
    expect(layout.fitted).toBe(false);
    expect(fontSize(draw({ text: "SHIP" }, TALL))).toBe(theme.type.hero[TALL].size);
  });

  it("sets a word too wide for hero and display at the headline step in 9:16, filling the text column", () => {
    const layout = scrambleTextLayout(theme, TALL, "MOTIONCRAFT", "clean", undefined);
    expect(layout.size).toBe(theme.type.headline[TALL].size);
    const left = MID - layout.lineWidth / 2;
    expectFills(left, left + layout.lineWidth);
    expect(layout.lineWidth).toBeLessThanOrEqual(textColumn(theme, TALL).width);
  });

  it("sizes a terminal line that fits no step to the primary width in 9:16", () => {
    const layout = scrambleTextLayout(theme, TALL, "npm run render", "terminal", "Renders on your machine");
    const frame = layout.lineWidth + 2 * (layout.padX + theme.hairline);
    expect(frame).toBeLessThanOrEqual(PRIMARY);
    expect(frame).toBeGreaterThanOrEqual(PRIMARY - 2);
    expect(layout.box.x + layout.box.width / 2).toBeCloseTo(MID, 0);
    expect(layout.size).toBeGreaterThan(60);
  });

  it("keeps 16:9 at the headline step", () => {
    for (const props of [{ text: "MOTIONCRAFT" }, { text: "SHIP" }, { text: "npm run render", style: "terminal" as const }]) {
      expect(fontSize(draw(props, WIDE))).toBe(theme.type.headline[WIDE].size);
    }
  });
});
