// ChatWindow's interface moment from the owner's reference: a message with
// Approve / Reject, a scripted cursor that clicks Approve, the button resolving
// to "Approved by ...", and the message lifting out as a floating card.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  ChatWindow,
  NOMINAL_SCENE_MS,
  chatMoments,
  chatTiming,
  chatWindowLayout,
  contentArea,
  cursorTiming,
  lightTheme,
  type Aspect,
  type ChatMessage,
  type ChatWindowProps,
  type Rect,
} from "../src/index";

const theme = lightTheme;

const MESSAGES: ChatMessage[] = [
  { author: "Monitor", badge: "ALERT", time: "2:14 PM", text: "Error rate on checkout is above 2%.", highlight: true },
  {
    author: "Deploy Bot",
    badge: "APP",
    time: "2:15 PM",
    text: "Hotfix 2.4.1 is ready to roll out.",
    actions: [
      { id: "approve", label: "Approve", resolved: "Approved by Maya Chen" },
      { id: "reject", label: "Reject" },
    ],
    shareId: "deploy",
    lift: {},
  },
];
const CURSOR = { target: "approve" };

const props = (extra: Partial<ChatWindowProps> = {}): ChatWindowProps => ({
  progress: 0,
  theme,
  aspect: "16:9",
  channel: "deploys",
  messages: MESSAGES,
  cursor: CURSOR,
  ...extra,
});

/** The chat `ms` into a nominal scene, drawn without a clock. */
const renderAt = (aspect: Aspect, ms: number, extra: Partial<ChatWindowProps> = {}) =>
  renderToStaticMarkup(<ChatWindow {...props({ aspect, progress: ms / NOMINAL_SCENE_MS, ...extra })} />);

function styleOf(html: string, attr: string): Map<string, string> | undefined {
  const style = new RegExp(`<[a-z]+[^>]*?${attr}[^>]*?style="([^"]*)"`).exec(html)?.[1];
  if (style === undefined) return undefined;
  return new Map(
    style.split(";").map((d) => {
      const i = d.indexOf(":");
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as const;
    }),
  );
}
const opacityOf = (html: string, attr: string) => parseFloat(styleOf(html, attr)?.get("opacity") ?? "NaN");

const moments = chatMoments(theme, { messages: MESSAGES, cursor: CURSOR });
const CLICK = moments.clickMs!;
const LIFT = moments.liftMs[1]!;

describe("chatMoments", () => {
  it("clicks a beat after the target's message lands, and lifts once the click has resolved", () => {
    const landed = chatTiming(theme, MESSAGES)[1]!.appear[1];
    const cursorIn = cursorTiming(theme, CLICK).appearMs;
    expect(cursorIn).toBeGreaterThanOrEqual(landed + theme.motion.beat.ms);
    expect(LIFT).toBeGreaterThan(CLICK);
    // The cursor has gone before the message leaves.
    expect(LIFT).toBeGreaterThanOrEqual(cursorTiming(theme, CLICK).leaveMs[1]);
    expect(moments.liftMs[0]).toBeUndefined();
    // The whole moment fits in the nominal scene.
    expect(LIFT + theme.motion.enter.ms).toBeLessThan(NOMINAL_SCENE_MS);
  });

  it("takes the times a storyboard gives", () => {
    const given = chatMoments(theme, { messages: [MESSAGES[0]!, { ...MESSAGES[1]!, lift: { atMs: 4200 } }], cursor: { target: "approve", atMs: 3100 } });
    expect(given.clickMs).toBe(3100);
    expect(given.liftMs[1]).toBe(4200);
  });

  it("lifts a message without a click a beat after it lands", () => {
    const plain = chatMoments(theme, { messages: [MESSAGES[0]!, { ...MESSAGES[1]!, actions: undefined }] });
    expect(plain.clickMs).toBeUndefined();
    expect(plain.liftMs[1]).toBe(chatTiming(theme, 2)[1]!.appear[1] + theme.motion.beat.ms);
  });

  it("names the missing target when the cursor's target is not an action", () => {
    expect(() => chatMoments(theme, { messages: MESSAGES, cursor: { target: "merge" } })).toThrow(/"merge".*approve, reject/);
  });
});

describe("ChatWindow actions and cursor", () => {
  it("draws the actions as buttons, the first one filled with the accent", () => {
    const html = renderAt("16:9", CLICK - 1000);
    expect(html).toContain(">Approve<");
    expect(html).toContain(">Reject<");
    expect(styleOf(html, 'data-chat-action="approve"')!.get("background-color")).toBe(theme.colors.accent);
    expect(styleOf(html, 'data-chat-action="reject"')!.get("background-color")).toBe(theme.colors.surface);
  });

  it("puts the cursor in its target button: hidden before it appears, on the way, then clicking", () => {
    const { appearMs, moveMs } = cursorTiming(theme, CLICK);
    expect(renderAt("16:9", appearMs - 10)).not.toContain("data-cursor=");
    const moving = renderAt("16:9", (moveMs[0] + moveMs[1]) / 2);
    expect(moving).toMatch(/data-cursor-target="approve"[^]*data-cursor=/);
    expect(renderAt("16:9", CLICK + 20)).toContain("data-cursor-ring");
    // Once it has gone, so has its copy of the buttons.
    expect(renderAt("16:9", cursorTiming(theme, CLICK).leaveMs[1] + 10)).not.toContain("data-cursor-target");
  });

  it("resolves the clicked action at the click: the buttons give way to 'Approved by ...' with a check", () => {
    const before = renderAt("9:16", CLICK - 20);
    expect(opacityOf(before, "data-chat-actions=")).toBeCloseTo(1, 3);
    expect(before).not.toContain("data-chat-resolved");
    const after = renderAt("9:16", CLICK + theme.motion["fx.fast"].ms);
    expect(opacityOf(after, "data-chat-actions=")).toBeCloseTo(0, 3);
    expect(opacityOf(after, "data-chat-resolved=")).toBeCloseTo(1, 3);
    expect(after).toContain("Approved by Maya Chen");
    expect(after).toMatch(/data-chat-resolved=[^>]*>[^]*?<svg/);
  });

  it("resolves to the action's label when it has no resolved text", () => {
    const html = renderAt("9:16", CLICK + 500, { cursor: { target: "reject", atMs: CLICK } });
    expect(/data-chat-resolved="reject"/.test(html)).toBe(true);
  });
});

describe("ChatWindow lift out", () => {
  it("keeps the message, and its shareId, in the window until it lifts", () => {
    const html = renderAt("16:9", LIFT - 20);
    expect(html).not.toContain("data-chat-lift");
    expect(html).toMatch(/data-share-id="deploy"[^>]*data-chat-message="1"|data-chat-message="1"[^>]*data-share-id="deploy"/);
  });

  it("lifts it out at its ms and settles it as a floating card that carries the shareId", () => {
    const html = renderAt("16:9", LIFT + theme.motion.enter.ms);
    expect(html).toMatch(/data-chat-lift="1"[^>]*data-share-id="deploy"|data-share-id="deploy"[^>]*data-chat-lift="1"/);
    expect([...html.matchAll(/data-share-id="deploy"/g)]).toHaveLength(1);
    expect(opacityOf(html, 'data-chat-message="1"')).toBeCloseTo(theme.motion.liftOut.ghostOpacity, 3);
    const card = styleOf(html, 'data-chat-lift="1"')!;
    expect(card.get("transform")).toMatch(/translate\(0px, 0px\) scale\(/);
    expect(card.get("box-shadow")).toContain(`${theme.motion.liftOut.shadowBlurPx}px`);
    // The card shows the message as it is: resolved.
    const cardHtml = html.slice(html.indexOf('data-chat-lift="1"'));
    expect(cardHtml).toContain("Approved by Maya Chen");
    expect(cardHtml).toContain("Hotfix 2.4.1 is ready to roll out.");
    expect(cardHtml).not.toContain("data-cursor=");
  });

  it.each(ASPECTS)("settles beside the window (beside in 16:9; lower, in front of it, in 9:16), inside the content area, unshrunk (%s)", (aspect) => {
    const layout = chatWindowLayout(theme, aspect, { messages: MESSAGES });
    const lift = layout.lifts[1]!;
    expect(layout.lifts[0]).toBeUndefined();
    expect(lift.scale).toBeGreaterThanOrEqual(1);
    const area = contentArea(theme, aspect);
    const card: Rect = { x: lift.to.x, y: lift.to.bottom - lift.height * lift.scale, width: lift.width * lift.scale, height: lift.height * lift.scale };
    expect(card.x).toBeGreaterThanOrEqual(area.x - 0.5);
    expect(card.x + card.width).toBeLessThanOrEqual(area.x + area.width + 0.5);
    expect(card.y).toBeGreaterThanOrEqual(area.y - 0.5);
    expect(card.y + card.height).toBeLessThanOrEqual(area.y + area.height + 0.5);
    const w = layout.window;
    if (aspect === "16:9") expect(card.x).toBeGreaterThanOrEqual(w.x + w.width);
    else {
      expect(card.y + card.height).toBeGreaterThan(w.y + w.height);
      expect(card.x + card.width / 2).toBeCloseTo(w.x + w.width / 2, 0);
    }
    // It lifts from the message's place: its left edge in the window's message list, its bottom on the list's bottom.
    expect(lift.from.x).toBeGreaterThanOrEqual(w.x);
    expect(lift.from.x).toBeLessThan(w.x + w.width / 2);
    expect(lift.from.bottom).toBeLessThan(w.y + w.height);
    expect(lift.from.bottom).toBeGreaterThan(w.y + w.height - layout.composerHeight - 3 * theme.spacing.md);
  });
});
