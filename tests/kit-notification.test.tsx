// Notification: banners drop in over a scene on a crisp spring, frosted over
// whatever is behind them; a newer banner lands on top and pushes the earlier
// ones down on the same spring. Ported from HyperFrames native-notification-pop.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  NOMINAL_SCENE_MS,
  Notification,
  contentArea,
  kit,
  lightTheme,
  notificationErrors,
  notificationLayout,
  notificationTiming,
  safeZones,
  type Aspect,
  type NotificationProps,
} from "../src/index";

const theme = lightTheme;

const TWO = [
  { app: "Deploys", title: "Deploy finished", body: "web-app is live on production", icon: "check", time: "now" },
  { app: "Messages", title: "New message from Maya", body: "Is the intro ready to ship?", icon: "chat", time: "now" },
];
const TERMINAL = { component: "TerminalWindow", props: { lines: [{ prompt: true, text: "npm run deploy" }, { text: "done in 4.2s" }] } };

const props = (aspect: Aspect, extra: Partial<NotificationProps> = {}): NotificationProps => ({ progress: 0, theme, aspect, notifications: TWO, ...extra });
const renderAt = (aspect: Aspect, ms: number, extra: Partial<NotificationProps> = {}) =>
  renderToStaticMarkup(<Notification {...props(aspect, { progress: ms / NOMINAL_SCENE_MS, ...extra })} />);

interface Drawn {
  index: number;
  top: number;
  left: number;
  width: number;
  height: number;
  opacity: number;
}

/** Each banner drawn, in markup order, with its box relative to the component's area. */
function banners(html: string): Drawn[] {
  return [...html.matchAll(/data-notification="(\d+)"[^>]*?style="([^"]*)"/g)].map((m) => {
    const style = m[2]!;
    const num = (key: string, fallback?: number) => {
      const v = new RegExp(`(?:^|;)${key}:(-?[\\d.]+)`).exec(style);
      if (v === null) {
        if (fallback !== undefined) return fallback;
        throw new Error(`no ${key} in ${style}`);
      }
      return Number(v[1]);
    };
    return { index: Number(m[1]), top: num("top"), left: num("left"), width: num("width"), height: num("height"), opacity: num("opacity", 1) };
  });
}

describe("Notification", () => {
  it("is a kit component", () => {
    expect(kit.Notification).toBeDefined();
  });

  it("drops the first banner at 400 ms and the next 900 ms later by default", () => {
    expect(notificationTiming(theme, 2).drops).toEqual([400, 1300]);
    expect(notificationTiming(theme, 3).drops).toEqual([400, 1300, 2200]);
    expect(notificationTiming(theme, 2, [200, 700]).drops).toEqual([200, 700]);
  });

  it.each(ASPECTS)("shows no banner before atMs[0] (%s)", (aspect) => {
    for (const ms of [0, 150, 399]) expect(banners(renderAt(aspect, ms)).filter((b) => b.opacity > 0)).toEqual([]);
    expect(banners(renderAt(aspect, 650, { atMs: [600, 1500] })).filter((b) => b.opacity > 0)).toHaveLength(1);
    expect(banners(renderAt(aspect, 550, { atMs: [600, 1500] })).filter((b) => b.opacity > 0)).toEqual([]);
  });

  it.each(ASPECTS)("holds every banner in place, newest on top (%s)", (aspect) => {
    const three = [...TWO, { app: "Calendar", title: "Standup in 5 minutes", icon: "clock" }];
    const html = renderAt(aspect, 3200, { notifications: three });
    const shown = banners(html);
    expect(shown).toHaveLength(3);
    for (const b of shown) expect(b.opacity).toBe(1);
    const byIndex = [...shown].sort((a, b) => a.index - b.index);
    // The newest sits highest, each earlier one below it with a gap.
    expect(byIndex[2]!.top).toBeLessThan(byIndex[1]!.top);
    expect(byIndex[1]!.top).toBeLessThan(byIndex[0]!.top);
    expect(byIndex[2]!.top + byIndex[2]!.height).toBeLessThan(byIndex[1]!.top);
    expect(byIndex[1]!.top + byIndex[1]!.height).toBeLessThan(byIndex[0]!.top);
    // Newest drawn last, so it is on top where banners overlap mid-motion.
    expect(shown.map((b) => b.index)).toEqual([0, 1, 2]);
    // The layout's rest boxes are where they are drawn.
    const layout = notificationLayout(theme, aspect, three);
    const area = contentArea(theme, aspect);
    for (const b of shown) {
      expect(b.top + area.y).toBeCloseTo(layout.rest[b.index]!.y, 1);
      expect(b.left + area.x).toBeCloseTo(layout.rest[b.index]!.x, 1);
    }
    for (const word of ["Deploy finished", "Is the intro ready to ship?", "Standup in 5 minutes", "Calendar"]) expect(html).toContain(word);
  });

  it("a new banner pushes the earlier one down on a spring with a slight overshoot", () => {
    const at = (ms: number) => banners(renderAt("9:16", ms)).find((b) => b.index === 0)!.top;
    const rest = notificationLayout(theme, "9:16", TWO).rest;
    const area = contentArea(theme, "9:16");
    // Alone, the first banner sits at the top; once the second lands it is below it.
    expect(at(1200) + area.y).toBeCloseTo(rest[1]!.y, 1);
    expect(at(2500) + area.y).toBeCloseTo(rest[0]!.y, 1);
    const path = Array.from({ length: 30 }, (_, i) => at(1300 + i * 15) + area.y);
    expect(Math.max(...path)).toBeGreaterThan(rest[0]!.y + 1);
    // Landed by ~450 ms after the drop.
    expect(at(1300 + 460) + area.y).toBeCloseTo(rest[0]!.y, 1);
  });

  it("lays banners inside the 9:16 safe area, top-center at the content width", () => {
    const { area } = safeZones("9:16", theme.safe);
    const html = renderAt("9:16", 3200, { notifications: [...TWO, { app: "Calendar", title: "Standup", body: "Room 4" }] });
    const content = contentArea(theme, "9:16");
    for (const b of banners(html)) {
      const x = b.left + content.x;
      const y = b.top + content.y;
      expect(x).toBeGreaterThanOrEqual(area.x);
      expect(y).toBeGreaterThanOrEqual(area.y);
      expect(x + b.width).toBeLessThanOrEqual(area.x + area.width);
      expect(y + b.height).toBeLessThanOrEqual(area.y + area.height);
      expect(x + b.width / 2).toBeCloseTo(540, 0);
      expect(b.width).toBe(content.width);
    }
  });

  it("sits top-right, about 640 px wide, in 16:9, and never wider than a narrow slot", () => {
    const area = contentArea(theme, "16:9");
    const { rest } = notificationLayout(theme, "16:9", TWO);
    for (const box of rest) {
      expect(box.width).toBe(640);
      expect(box.x + box.width).toBe(area.x + area.width);
    }
    // The newest is at the top of the content area.
    expect(rest.at(-1)!.y).toBe(area.y);
    const slot = { x: 1100, y: 300, width: 560, height: 700 };
    const nested = notificationLayout(theme, "16:9", TWO, slot);
    for (const box of nested.rest) {
      expect(box.width).toBeLessThanOrEqual(slot.width);
      expect(box.y + box.height).toBeLessThanOrEqual(slot.y + slot.height);
    }
  });

  it("renders the content behind the banners", () => {
    const html = renderAt("9:16", 3200, { content: TERMINAL });
    const content = html.indexOf("data-notification-content");
    expect(content).toBeGreaterThanOrEqual(0);
    expect(html).toContain("npm run deploy");
    expect(content).toBeLessThan(html.indexOf('data-notification="0"'));
  });

  it("is frosted: a translucent card with a backdrop blur, and an icon on the accent", () => {
    const html = renderAt("9:16", 3200);
    expect(html).toMatch(/data-notification="0"[^>]*?backdrop-filter:blur\(\d+px\)/);
    expect(html).toContain("data-notification-icon");
    // Generic chrome: no OS names (the theme's font stack may still list system fonts).
    expect(html).not.toMatch(/(Apple|iOS|macOS|iPhone|Android)/);
  });

  describe("validation", () => {
    it("accepts one to three banners", () => {
      expect(notificationErrors({ notifications: TWO })).toEqual([]);
      expect(notificationErrors({ notifications: TWO.slice(0, 1), atMs: [300] })).toEqual([]);
    });
    it.each([
      ["no banners", { notifications: [] }, /1-3/],
      ["four banners", { notifications: [...TWO, ...TWO] }, /1-3/],
      ["an empty title", { notifications: [{ app: "A", title: " " }] }, /notifications\[0\]\.title/],
      ["a missing app", { notifications: [{ title: "Hi" }] }, /notifications\[0\]\.app/],
      ["an unknown icon", { notifications: [{ app: "A", title: "B", icon: "nope" }] }, /icon/],
      ["too few drop times", { notifications: TWO, atMs: [400] }, /atMs/],
      ["drop times out of order", { notifications: TWO, atMs: [900, 400] }, /atMs/],
      ["a negative drop time", { notifications: TWO.slice(0, 1), atMs: [-1] }, /atMs/],
    ])("rejects %s", (_, input, message) => {
      expect(notificationErrors(input).join("\n")).toMatch(message);
    });
    it("throws when drawn with four notifications", () => {
      expect(() => renderAt("9:16", 1000, { notifications: [...TWO, ...TWO] })).toThrow(/Notification/);
    });
  });
});
