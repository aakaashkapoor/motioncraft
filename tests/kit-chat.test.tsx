import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  ChatWindow,
  NOMINAL_SCENE_MS,
  chatTiming,
  chatWindowLayout,
  contentArea,
  exitMs,
  kit,
  lightTheme,
  neutralTheme,
  type Aspect,
  type ChatMessage,
  type ChatWindowProps,
  type Rect,
} from "../src/index";

/** Parses an inline `style="..."` attribute into a map. */
function parseStyle(style: string): Map<string, string> {
  return new Map(
    style.split(";").map((d) => {
      const i = d.indexOf(":");
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as const;
    }),
  );
}

/** Reads the root element's inline style back out of server-rendered HTML. */
function rootBox(html: string): Rect & { opacity: number } {
  const style = /^<[a-z]+[^>]*?style="([^"]*)"/.exec(html)?.[1];
  if (style === undefined) throw new Error(`no root style in ${html}`);
  const decls = parseStyle(style);
  const num = (key: string) => parseFloat(decls.get(key) ?? "NaN");
  return { opacity: num("opacity"), x: num("left"), y: num("top"), width: num("width"), height: num("height") };
}

interface Shown {
  index: number;
  opacity: number;
  rise: number;
}

/** Opacity and vertical offset of every element carrying `attr`, in index order. */
function states(html: string, attr: string): Shown[] {
  const re = new RegExp(`<[a-z]+[^>]*?${attr}="(\\d+)"[^>]*?style="([^"]*)"`, "g");
  return [...html.matchAll(re)]
    .map((m) => {
      const decls = parseStyle(m[2]!);
      const rise = /translate[XY]\((-?[\d.]+)px\)/.exec(decls.get("transform") ?? "")?.[1];
      return { index: Number(m[1]), opacity: parseFloat(decls.get("opacity") ?? "NaN"), rise: rise === undefined ? 0 : parseFloat(rise) };
    })
    .sort((a, b) => a.index - b.index);
}

const messages = (html: string) => states(html, "data-chat-message");
const typing = (html: string) => states(html, "data-chat-typing");

const MESSAGES: ChatMessage[] = [
  { author: "Maya Chen", time: "9:41", text: "Deploy is green, shipping the release now." },
  { author: "Build Bot", avatar: { initials: "BB", color: "#2f54d4" }, time: "9:42", text: "Release 2.4 is live.", badge: "APP" },
  { author: "Sam Ortiz", time: "9:43", text: "Nice work, everyone!", reactions: [{ emoji: "🎉", count: 4 }], highlight: true },
];

const SIDEBAR = { workspace: "Acme Studio", channels: ["general", "releases", "design"] };

const render = (aspect: Aspect, progress: number, extra: Partial<ChatWindowProps> = {}) =>
  renderToStaticMarkup(
    <ChatWindow progress={progress} theme={lightTheme} aspect={aspect} channel="releases" messages={MESSAGES} sidebar={SIDEBAR} {...extra} />,
  );

/** The chat `ms` into a scene, drawn without a clock. */
const renderAt = (aspect: Aspect, ms: number, extra: Partial<ChatWindowProps> = {}) => render(aspect, ms / NOMINAL_SCENE_MS, extra);

/** A scene of `endMs`, at its start. */
const scene = (endMs: number) => ({ ms: 0, endMs, leftMs: endMs });
/** The latest a conversation may end in a scene of `endMs`: a beat before the exit. */
const latest = (endMs: number) => endMs - exitMs(lightTheme, lightTheme.motion.enter.ms) - lightTheme.motion.beat.ms;

function inside(outer: Rect, inner: Rect) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 0.5);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 0.5);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 0.5);
}

describe("chatTiming", () => {
  it.each([1, 2, 3, 6, 10])("types, then shows each of %i messages in order, all before the exit", (count) => {
    const timing = chatTiming(lightTheme, count, 0, scene(NOMINAL_SCENE_MS));
    expect(timing).toHaveLength(count);
    let last = 0;
    for (const { typing: t, appear } of timing) {
      expect(t[0]).toBeGreaterThanOrEqual(last);
      expect(t[1]).toBeGreaterThan(t[0]);
      expect(appear[0]).toBeGreaterThanOrEqual(t[1]);
      expect(appear[1]).toBeGreaterThan(appear[0]);
      last = appear[0];
    }
    expect(timing.at(-1)!.appear[1]).toBeLessThanOrEqual(latest(NOMINAL_SCENE_MS) + 1e-9);
  });

  it("plays at the same pace in any scene it fits, starting once the window has faded in", () => {
    const { leadMs, fx, beat, enter } = lightTheme.motion;
    const natural = chatTiming(lightTheme, 3);
    expect(chatTiming(lightTheme, 3, 0, scene(9000))).toEqual(natural);
    expect(natural[0]!.typing).toEqual([leadMs + fx.ms, leadMs + fx.ms + beat.ms]);
    expect(natural[0]!.appear[1] - natural[0]!.appear[0]).toBe(enter.ms);
    // The next message types once the one before it shows.
    expect(natural[1]!.typing[0]).toBe(natural[0]!.appear[0] + fx.ms);
  });

  it("speeds up only to finish before a short scene's exit, and makes room for cards", () => {
    const short = chatTiming(lightTheme, 3, 0, scene(3000));
    expect(short.at(-1)!.appear[1]).toBeCloseTo(latest(3000), 6);
    expect(chatTiming(lightTheme, 3, 2, scene(3000)).at(-1)!.appear[1]).toBeLessThan(short.at(-1)!.appear[1]);
  });
});

describe("ChatWindow", () => {
  it("is registered in the kit", () => {
    expect(kit.ChatWindow).toBe(ChatWindow);
  });

  it.each(ASPECTS)("sits inside the content area (%s)", (aspect) => {
    const area = contentArea(lightTheme, aspect);
    for (const progress of [0, 0.5, 1]) inside(area, rootBox(render(aspect, progress)));
    for (const cards of [undefined, MESSAGES.slice(0, 2)]) {
      const layout = chatWindowLayout(lightTheme, aspect, { messages: MESSAGES, sidebar: SIDEBAR, cards });
      inside(area, layout.window);
      if (cards) inside(area, layout.cards!);
    }
  });

  it.each(ASPECTS)("renders every message, author, time and the header (%s)", (aspect) => {
    const html = render(aspect, 0.9);
    for (const m of MESSAGES) {
      expect(html).toContain(m.author);
      expect(html).toContain(m.time);
      expect(html).toContain(m.text);
    }
    expect(html).toContain("releases");
    expect(html).toContain(">APP<");
    expect(html).toContain(">BB<");
    expect(html).toContain(">MC<");
    expect(html).toContain("🎉");
    expect(messages(html)).toHaveLength(MESSAGES.length);
  });

  it("shows messages in order as the scene plays", () => {
    const timing = chatTiming(lightTheme, MESSAGES.length);
    for (let i = 0; i < MESSAGES.length; i++) {
      const before = messages(renderAt("16:9", timing[i]!.typing[0]));
      const after = messages(renderAt("16:9", timing[i]!.appear[1]));
      expect(before[i]!.opacity).toBeCloseTo(0, 3);
      expect(after[i]!.opacity).toBeCloseTo(1, 3);
      for (let j = 0; j < i; j++) expect(before[j]!.opacity).toBeCloseTo(1, 3);
      for (let j = i + 1; j < MESSAGES.length; j++) expect(after[j]!.opacity).toBeCloseTo(0, 3);
    }
  });

  it("rises each message into place", () => {
    const { appear } = chatTiming(lightTheme, MESSAGES.length)[0]!;
    const early = messages(renderAt("9:16", appear[0] + lightTheme.motion.fx.ms / 2))[0]!;
    expect(early.opacity).toBeGreaterThan(0);
    expect(early.opacity).toBeLessThan(1);
    expect(early.rise).toBeGreaterThan(0);
    expect(messages(renderAt("9:16", appear[1]))[0]!.rise).toBeCloseTo(0, 3);
  });

  it("shows a typing indicator before each message, and hides it once the message lands", () => {
    const timing = chatTiming(lightTheme, MESSAGES.length);
    for (let i = 0; i < MESSAGES.length; i++) {
      const { typing: t, appear } = timing[i]!;
      const during = renderAt("9:16", (t[0] + t[1]) / 2);
      expect(typing(during)[i]!.opacity).toBeGreaterThan(0.5);
      expect(messages(during)[i]!.opacity).toBeCloseTo(0, 3);
      for (let j = 0; j < MESSAGES.length; j++) if (j !== i) expect(typing(during)[j]!.opacity).toBeCloseTo(0, 3);
      expect(typing(renderAt("9:16", appear[1]))[i]!.opacity).toBeCloseTo(0, 3);
    }
  });

  it("shows the sidebar in 16:9 and collapses it in 9:16", () => {
    const wide = render("16:9", 0.9);
    expect(wide).toContain("data-chat-sidebar");
    expect(wide).toContain("Acme Studio");
    expect(wide).toContain("general");
    expect(wide).toContain("design");
    const tall = render("9:16", 0.9);
    expect(tall).not.toContain("data-chat-sidebar");
    expect(tall).not.toContain("design");
    expect(chatWindowLayout(lightTheme, "9:16", { messages: MESSAGES, sidebar: SIDEBAR }).sidebarWidth).toBe(0);
    expect(chatWindowLayout(lightTheme, "16:9", { messages: MESSAGES, sidebar: SIDEBAR }).sidebarWidth).toBeGreaterThan(0);
  });

  it("marks the active channel in the accent", () => {
    const html = render("16:9", 0.9);
    const active = /<[a-z]+[^>]*data-chat-channel="active"[^>]*style="([^"]*)"/.exec(html)?.[1];
    expect(active).toBeDefined();
    expect(parseStyle(active!).get("background-color")).toBe(lightTheme.colors.accent);
    expect([...html.matchAll(/data-chat-channel="active"/g)]).toHaveLength(1);
  });

  it("has no sidebar when none is given", () => {
    expect(render("16:9", 0.9, { sidebar: undefined })).not.toContain("data-chat-sidebar");
  });

  it("slides floating cards in beside the window", () => {
    const cards = [{ author: "Maya Chen", time: "9:41", text: "Shipped!" }];
    const timing = chatTiming(lightTheme, MESSAGES.length, cards.length);
    expect(states(renderAt("16:9", timing.at(-1)!.appear[0], { cards }), "data-chat-card")[0]!.opacity).toBeCloseTo(0, 3);
    const shown = states(render("16:9", 0.85, { cards }), "data-chat-card");
    expect(shown).toHaveLength(1);
    expect(shown[0]!.opacity).toBeCloseTo(1, 3);
    expect(render("16:9", 0.85, { cards })).toContain("Shipped!");
    for (const aspect of ASPECTS) {
      const { window, cards: box } = chatWindowLayout(lightTheme, aspect, { messages: MESSAGES, cards });
      const overlapX = Math.min(window.x + window.width, box!.x + box!.width) - Math.max(window.x, box!.x);
      const overlapY = Math.min(window.y + window.height, box!.y + box!.height) - Math.max(window.y, box!.y);
      expect(overlapX <= 0 || overlapY <= 0).toBe(true);
    }
  });

  it("carries a shareId on the window", () => {
    expect(render("16:9", 0.5, { shareId: "chat" })).toContain('data-share-id="chat"');
    expect(render("16:9", 0.5)).not.toContain("data-share-id");
  });

  it("enters and exits", () => {
    expect(rootBox(render("16:9", 0.5)).opacity).toBeCloseTo(1, 3);
    expect(rootBox(render("16:9", 1)).opacity).toBeCloseTo(0, 3);
  });

  it("works with any theme and escapes text", () => {
    const html = renderToStaticMarkup(
      <ChatWindow progress={0.9} theme={neutralTheme} aspect="9:16" channel="x" messages={[{ author: "<i>", time: "1", text: "<b>" }]} />,
    );
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&lt;i&gt;");
  });
});
