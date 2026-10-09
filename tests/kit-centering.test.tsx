// Design v3, section C: in 9:16 every kit block is centered on x = 540, the
// scene's main block sits on the optical center instead of the top of the
// content area, the primary visual fills the frame (760-840 px wide), cards
// center or hug their content, and a docked element never shrinks below 40%
// of the frame width. Pure layouts and static markup; the browser-measured
// version of the same checks is in `centering.test.ts`.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BigNumber,
  Card,
  CardRow,
  Pinned,
  SAFE_PROFILES,
  TitleCard,
  cardRowLayout,
  chatWindowLayout,
  contentArea,
  flowDiagramLayout,
  kit,
  lightTheme,
  pinnedLayout,
  safeZones,
  textColumn,
  windowLayout,
  type CardData,
  type Rect,
  type SafeProfile,
  type Theme,
} from "../src/index";
import { windowBox } from "../src/kit/windowLayout";
import { AVG_CHAR_EM } from "../src/layout/textFit";

const TOLERANCE = 2;
const themeFor = (safe: SafeProfile): Theme => ({ ...lightTheme, safe });
const centerX = (r: Rect) => r.x + r.width / 2;
const centerY = (r: Rect) => r.y + r.height / 2;

function parseStyle(style: string): Map<string, string> {
  return new Map(
    style
      .split(";")
      .filter((d) => d.includes(":"))
      .map((d) => {
        const i = d.indexOf(":");
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as const;
      }),
  );
}

function boxOf(style: Map<string, string>): Rect {
  const num = (key: string) => parseFloat(style.get(key) ?? "NaN");
  return { x: num("left"), y: num("top"), width: num("width"), height: num("height") };
}

/** The box of the first element with `attr`, offset by the root's box (the components nest one level). */
function blockBox(html: string, attr: string): Rect {
  const root = boxOf(parseStyle(/^<div[^>]*?style="([^"]*)"/.exec(html)![1]!));
  const m = new RegExp(`<[a-z]+[^>]*?${attr}[^>]*?style="([^"]*)"`).exec(html);
  if (m === null) throw new Error(`no ${attr}`);
  const inner = boxOf(parseStyle(m[1]!));
  return { x: root.x + inner.x, y: root.y + inner.y, width: inner.width, height: inner.height };
}

function rootBox(html: string): Rect {
  return boxOf(parseStyle(/^<div[^>]*?style="([^"]*)"/.exec(html)![1]!));
}

const CARDS: CardData[] = [
  { icon: "file", title: "Write" },
  { icon: "check", title: "Check" },
  { icon: "play", title: "Render" },
];

describe.each(SAFE_PROFILES)("9:16 %s: blocks are centered on x = 540", (profile) => {
  const theme = themeFor(profile);
  const area = contentArea(theme, "9:16");
  /** Where a block `height` tall centers: the optical center, or as near it as the content area allows. */
  const expectedY = (height: number) => {
    const optical = safeZones("9:16", profile).opticalCenter;
    return Math.min(Math.max(optical, area.y + height / 2), area.y + area.height - height / 2);
  };
  const expectOnOptical = (box: Rect) => expect(Math.abs(centerY(box) - expectedY(box.height))).toBeLessThanOrEqual(TOLERANCE);

  it("TitleCard", () => {
    const html = renderToStaticMarkup(<TitleCard progress={0.5} theme={theme} aspect="9:16" title="Videos from a prompt" subtitle="Code-drawn" />);
    const box = rootBox(html);
    expect(Math.abs(centerX(box) - 540)).toBeLessThanOrEqual(TOLERANCE);
    expectOnOptical(box);
    expect(html).toContain('data-block="TitleCard"');
  });

  it("BigNumber", () => {
    const html = renderToStaticMarkup(<BigNumber progress={0.5} theme={theme} aspect="9:16" value={100} suffix="%" label="code-drawn frames" />);
    const box = rootBox(html);
    expect(Math.abs(centerX(box) - 540)).toBeLessThanOrEqual(TOLERANCE);
    expectOnOptical(box);
    expect(html).toContain('data-block="BigNumber"');
  });

  it("Card, on the optical center", () => {
    const html = renderToStaticMarkup(<Card progress={0.5} theme={theme} aspect="9:16" icon="chat" title="The prompt" subtitle="A launch intro" />);
    const card = blockBox(html, "data-card=");
    expect(Math.abs(centerX(card) - 540)).toBeLessThanOrEqual(TOLERANCE);
    expectOnOptical(card);
  });

  it("CardRow, as a block on the optical center", () => {
    const { cells } = cardRowLayout(theme, "9:16", CARDS);
    const left = Math.min(...cells.map((c) => c.x));
    const right = Math.max(...cells.map((c) => c.x + c.width));
    const top = Math.min(...cells.map((c) => c.y));
    const bottom = Math.max(...cells.map((c) => c.y + c.height));
    const block = { x: area.x + left, y: area.y + top, width: right - left, height: bottom - top };
    expect(Math.abs(centerX(block) - 540)).toBeLessThanOrEqual(TOLERANCE);
    expectOnOptical(block);
  });

  it("AppWindow and BrowserWindow fill the frame's width as the primary visual", () => {
    for (const toolbar of [false, true]) {
      const { box } = windowLayout(theme, "9:16", toolbar);
      expect(Math.abs(centerX(box) - 540)).toBeLessThanOrEqual(TOLERANCE);
      expect(box.width).toBe(safeZones("9:16", profile).primaryWidth);
    }
  });

  it("TerminalWindow and CodeWindow sit on the optical center", () => {
    const box = windowBox(theme, "9:16", 300);
    expect(Math.abs(centerX(box) - 540)).toBeLessThanOrEqual(TOLERANCE);
    expectOnOptical(box);
    expect(box.width).toBe(safeZones("9:16", profile).primaryWidth);
  });

  it("ChatWindow", () => {
    const { window } = chatWindowLayout(theme, "9:16", { messages: [{ author: "Maya", time: "9:41", text: "Intro video for launch?" }] });
    expect(Math.abs(centerX(window) - 540)).toBeLessThanOrEqual(TOLERANCE);
    expectOnOptical(window);
    expect(window.width).toBe(safeZones("9:16", profile).primaryWidth);
  });
});

describe("in 9:16 the primary visual is 760-840 px wide (shorts)", () => {
  it("a stack of cards", () => {
    const { cells } = cardRowLayout(lightTheme, "9:16", [
      { icon: "zap", title: "Faster builds", subtitle: "Fonts are cached between runs" },
      { icon: "box", title: "Smaller bundle", subtitle: "Unused icons are dropped" },
      { icon: "clock", title: "Fewer waits", subtitle: "Frames render in parallel" },
    ]);
    for (const cell of cells) {
      expect(cell.width).toBeGreaterThanOrEqual(600);
      expect(cell.width).toBeLessThanOrEqual(840);
    }
  });
});

describe("cards", () => {
  const theme = lightTheme;

  it("a single-line label is centered: icon above, text centered", () => {
    const html = renderToStaticMarkup(<CardRow progress={0.9} theme={theme} aspect="16:9" cards={CARDS} />);
    expect(html).toMatch(/data-card-content="label"[^>]*style="[^"]*flex-direction:column;align-items:center/);
    expect(html).toMatch(/data-card-text=""[^>]*style="[^"]*text-align:center/);
  });

  it("a multi-line card keeps left-aligned text but hugs its content, centered as a block", () => {
    const html = renderToStaticMarkup(<Card progress={0.5} theme={theme} aspect="9:16" icon="chat" title="The prompt" subtitle="A launch intro" />);
    const card = blockBox(html, "data-card=");
    expect(card.width).toBeLessThan(contentArea(theme, "9:16").width * 0.8);
    expect(html).toMatch(/data-card-text=""[^>]*style="[^"]*text-align:left/);
    expect(Math.abs(centerX(card) - 540)).toBeLessThanOrEqual(TOLERANCE);
  });

  it("a stack of multi-line cards shares the widest card's width, never more than the primary width", () => {
    const short = cardRowLayout(theme, "9:16", [
      { icon: "zap", title: "Fast", subtitle: "Yes" },
      { icon: "box", title: "Small", subtitle: "Also" },
    ]);
    const long = cardRowLayout(theme, "9:16", [
      { icon: "zap", title: "A title that runs long", subtitle: "With a subtitle that runs longer still, past one line" },
      { icon: "box", title: "Small", subtitle: "Also" },
    ]);
    expect(new Set(short.cells.map((c) => c.width)).size).toBe(1);
    expect(short.cells[0]!.width).toBeLessThan(long.cells[0]!.width);
    expect(long.cells[0]!.width).toBeLessThanOrEqual(safeZones("9:16").primaryWidth);
  });
});

describe("Pinned", () => {
  const chat = { component: "ChatWindow", props: { channel: "launch", messages: [{ author: "Maya", time: "9:41", text: "Intro video?" }], shareId: "chat" } };
  const content = { component: "CardRow", props: { cards: CARDS } };

  it.each(["9:16", "16:9"] as const)("%s: the docked element is at least 40 percent of the frame width", (aspect) => {
    const layout = pinnedLayout(lightTheme, aspect);
    expect(layout.mode).toBe("dock");
    const frameWidth = aspect === "9:16" ? 1080 : 1920;
    // The element fills its dock's width: the pinned box is what it shows at.
    expect(layout.pinned.width).toBeGreaterThanOrEqual(0.4 * frameWidth - 0.5);
  });

  it("9:16: docks centered on x = 540, above or below the content", () => {
    const top = pinnedLayout(lightTheme, "9:16", "topRight");
    expect(Math.abs(centerX(top.pinned) - 540)).toBeLessThanOrEqual(TOLERANCE);
    expect(top.content.y).toBeGreaterThan(top.pinned.y + top.pinned.height);
    expect(Math.abs(centerX(top.content) - 540)).toBeLessThanOrEqual(TOLERANCE);
    const bottom = pinnedLayout(lightTheme, "9:16", "bottomLeft");
    expect(bottom.pinned.y).toBeGreaterThan(bottom.content.y + bottom.content.height);
    expect(Math.abs(centerX(bottom.pinned) - 540)).toBeLessThanOrEqual(TOLERANCE);
  });

  it("becomes an icon chip when docking at 40% would crowd out the content", () => {
    const area = contentArea(lightTheme, "9:16");
    const tight = { ...area, height: 520 };
    const layout = pinnedLayout(lightTheme, "9:16", "topRight", tight);
    expect(layout.mode).toBe("chip");
    expect(layout.pinned.height).toBeLessThan(tight.height / 4);
    expect(layout.content.height).toBeGreaterThan(tight.height / 2);
    const html = renderToStaticMarkup(createElement(Pinned as never, { progress: 0.5, theme: lightTheme, aspect: "9:16", area: tight, pinned: chat, content }));
    expect(html).toContain("data-pinned-chip");
    expect(html).toContain('data-share-id="chat"');
    expect(html).toContain("launch");
    expect(html).not.toContain("data-pinned-frame");
  });

  it("lays the content out at its own size in the content box, not scaled down", () => {
    const html = renderToStaticMarkup(createElement(Pinned as never, { progress: 0.5, theme: lightTheme, aspect: "9:16", pinned: chat, content }));
    expect(html).not.toMatch(/data-pinned-content=""[^>]*transform:scale/);
    expect(kit.Pinned).toBe(Pinned);
  });
});

describe("nested in a window's content slot", () => {
  it("a component centers in the window, not on the frame's optical center", () => {
    const html = renderToStaticMarkup(
      createElement(kit.AppWindow!, { progress: 0.5, theme: lightTheme, aspect: "9:16", title: "w", content: { component: "Card", props: { title: "Hi" } } }),
    );
    // The nested frame: the Card's root is the content area, its card centered in it.
    const nested = /data-window-content=""[\s\S]*?<div style="([^"]*)"><div data-card="0"[^>]*?style="([^"]*)"/.exec(html);
    if (nested === null) throw new Error("no nested card");
    const root = boxOf(parseStyle(nested[1]!));
    const card = boxOf(parseStyle(nested[2]!));
    const area = contentArea(lightTheme, "9:16");
    expect(root).toEqual(area);
    expect(Math.abs(card.y + card.height / 2 - area.height / 2)).toBeLessThanOrEqual(TOLERANCE);
  });
});

describe("lists sit on the optical center, no wider than the text column", () => {
  const theme = lightTheme;
  const lists = [
    ["FeatureList", { items: [{ icon: "lock", text: "Runs locally" }, { icon: "code", text: "Every frame is code" }, { icon: "check", text: "Checked before render" }] }],
    ["StepList", { items: ["Hook", "Ask", "Plan", "Demo"] }],
  ] as const;

  it.each(lists)("%s", (name, props) => {
    const html = renderToStaticMarkup(createElement(kit[name]!, { progress: 0.8, theme, aspect: "9:16", ...props }));
    const box = rootBox(html);
    expect(Math.abs(centerX(box) - 540)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(centerY(box) - safeZones("9:16").opticalCenter)).toBeLessThanOrEqual(TOLERANCE);
    const inner = /data-block="[^"]*"[^>]*?style="[^"]*max-width:(\d+(?:\.\d+)?)px/.exec(html);
    expect(inner).not.toBeNull();
    expect(parseFloat(inner![1]!)).toBeLessThanOrEqual(textColumn(theme, "9:16").width);
  });
});

describe("Section", () => {
  const props = {
    eyebrow: "Why it works",
    headline: "Made for agents",
    note: "Checked before it renders",
    content: { component: "FeatureList", props: { items: [{ icon: "lock", text: "Runs locally" }, { icon: "code", text: "Code" }] } },
  };
  const partStyle = (html: string, part: string) => parseStyle(new RegExp(`data-section-part="${part}"[^>]*?style="([^"]*)"`).exec(html)![1]!);

  it("stacked (9:16, and wide content in 16:9), its text is centered on the frame", () => {
    for (const [aspect, contentWidth] of [["9:16", "narrow"], ["16:9", "wide"]] as const) {
      const html = renderToStaticMarkup(createElement(kit.Section!, { progress: 0.8, theme: lightTheme, aspect, contentWidth, ...props }));
      for (const part of ["eyebrow", "headline", "note"]) {
        const style = partStyle(html, part);
        expect(style.get("text-align"), `${aspect} ${part}`).toBe("center");
        expect(Math.abs(centerX(boxOf(style)) - (aspect === "9:16" ? 540 : 960))).toBeLessThanOrEqual(TOLERANCE);
      }
    }
  });

  it("keeps the note, low in the frame, clear of the right rail", () => {
    const html = renderToStaticMarkup(createElement(kit.Section!, { progress: 0.8, theme: lightTheme, aspect: "9:16", ...props }));
    const note = boxOf(partStyle(html, "note"));
    expect(note.width).toBeLessThanOrEqual(textColumn(lightTheme, "9:16").width);
  });

  it("beside its content in 16:9, its text stays left-aligned", () => {
    const html = renderToStaticMarkup(createElement(kit.Section!, { progress: 0.8, theme: lightTheme, aspect: "16:9", ...props }));
    expect(partStyle(html, "headline").get("text-align")).toBeUndefined();
  });
});

describe("FlowDiagram", () => {
  it("sits on the optical center, centered on x = 540", () => {
    const area = contentArea(lightTheme, "9:16");
    const { nodes } = flowDiagramLayout(lightTheme, "9:16", ["Prompt", "Storyboard", "Video"]);
    const top = Math.min(...nodes.map((n) => n.y));
    const bottom = Math.max(...nodes.map((n) => n.y + n.height));
    const left = Math.min(...nodes.map((n) => n.x));
    const right = Math.max(...nodes.map((n) => n.x + n.width));
    expect(Math.abs(area.x + (left + right) / 2 - 540)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(area.y + (top + bottom) / 2 - safeZones("9:16").opticalCenter)).toBeLessThanOrEqual(TOLERANCE);
  });
});

describe("Card in a short, wide slot", () => {
  it("puts its icon beside the text when there is no room for it above, and stays as tall as its content", () => {
    const slot = { x: 120, y: 240, width: 840, height: 187 };
    const html = renderToStaticMarkup(<Card progress={0.5} theme={lightTheme} aspect="9:16" area={slot} icon="chat" title="The prompt" subtitle="A launch intro" />);
    expect(html).toMatch(/data-card-content="text"[^>]*style="[^"]*flex-direction:row/);
    const card = blockBox(html, "data-card=");
    expect(card.height).toBeLessThanOrEqual(slot.height);
    expect(Math.abs(centerX(card) - 540)).toBeLessThanOrEqual(TOLERANCE);
  });
});

describe("review fixes", () => {
  it("a label card with a step number keeps its text centered under its icon", () => {
    const html = renderToStaticMarkup(<Card progress={0.5} theme={lightTheme} aspect="9:16" icon="check" title="Checked" step={2} />);
    const text = parseStyle(/data-card-text=""[^>]*?style="([^"]*)"/.exec(html)![1]!);
    expect(parseFloat(text.get("padding-right") ?? "0")).toBe(0);
    expect(text.get("text-align")).toBe("center");
  });

  it("FlowDiagram keeps its caption in the text column and its stacked nodes at the primary width", () => {
    const area = contentArea(lightTheme, "9:16");
    const column = textColumn(lightTheme, "9:16");
    const layout = flowDiagramLayout(lightTheme, "9:16", ["Prompt", "Storyboard", "Video"], "Every single frame renders locally too");
    const caption = layout.caption!;
    expect(area.x + caption.x).toBeGreaterThanOrEqual(column.x);
    expect(area.x + caption.x + caption.width).toBeLessThanOrEqual(column.x + column.width);
    for (const node of layout.nodes) {
      expect(node.width).toBeLessThanOrEqual(safeZones("9:16").primaryWidth);
      expect(Math.abs(area.x + node.x + node.width / 2 - 540)).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  it("FlowDiagram never breaks words: in a 16:9 Section slot four nodes stack, even a few px over", () => {
    const slot = { x: 975, y: 64, width: 849, height: 759 };
    const { nodes } = flowDiagramLayout(lightTheme, "16:9", ["Write", "Render", "Check", "Ship"], undefined, slot);
    expect(new Set(nodes.map((n) => n.x)).size).toBe(1);
  });

  it("CardRow picks a title size at which every word fits its card", () => {
    const slot = { x: 120, y: 677, width: 840, height: 521 };
    const cards = [{ icon: "check", title: "All green" }, { icon: "clock", title: "Under a minute" }];
    const { cells, metrics } = cardRowLayout(lightTheme, "9:16", cards, slot);
    const inner = cells[0]!.width - 2 * (metrics.padding + metrics.border);
    expect("minute".length * metrics.title.size * AVG_CHAR_EM).toBeLessThanOrEqual(inner);
  });

  it("16:9 ChatWindow centers its cards on the window beside them", () => {
    const messages = [{ author: "Ana", time: "9:41", text: "Ready?" }];
    const layout = chatWindowLayout(lightTheme, "16:9", { messages, cards: messages });
    expect(Math.abs(centerY(layout.cards!) - centerY(layout.window))).toBeLessThanOrEqual(TOLERANCE);
  });

  const term = (title?: string) => ({ component: "TerminalWindow", props: { ...(title && { title }), lines: [{ prompt: true, text: "npm test" }], shareId: "t" } });
  const crosspost = { ...lightTheme, safe: "crosspost" as const };

  it("a chip's long label is cut to fit, and the chip stays in the text column", () => {
    const html = renderToStaticMarkup(createElement(Pinned as never, { progress: 0.5, theme: crosspost, aspect: "9:16", pinned: term("storyboard.json - motioncraft demo for the launch") }));
    const chip = boxOf(parseStyle(/data-pinned-chip=""[^>]*?style="([^"]*)"/.exec(html)![1]!));
    const column = textColumn(crosspost, "9:16");
    expect(chip.x).toBeGreaterThanOrEqual(column.x);
    expect(chip.x + chip.width).toBeLessThanOrEqual(column.x + column.width);
    const label = /data-pinned-chip=""[\s\S]*?<span[^>]*>([^<]*)<\/span>/.exec(html)![1]!;
    expect(label.endsWith("…")).toBe(true);
    const { size } = crosspost.type.label["9:16"];
    const room = chip.width - size - crosspost.spacing.xs - 2 * crosspost.spacing.md;
    expect(label.length * size * AVG_CHAR_EM).toBeLessThanOrEqual(room + 0.5);
  });

  it("a chip names a window without a title by its kind", () => {
    const html = renderToStaticMarkup(createElement(Pinned as never, { progress: 0.5, theme: crosspost, aspect: "9:16", pinned: term() }));
    expect(html).toMatch(/data-pinned-chip=""[\s\S]*?<span[^>]*>Terminal<\/span>/);
  });

  it("checks the pinned component even when it shows as a chip", () => {
    const render = () => renderToStaticMarkup(createElement(Pinned as never, { progress: 0.5, theme: crosspost, aspect: "9:16", pinned: { component: "Nope", props: {} } }));
    expect(render).toThrow(/Pinned: unknown component "Nope"/);
  });

  it("becomes a chip rather than dock under 40% of the frame width in a narrow slot", () => {
    expect(pinnedLayout(lightTheme, "9:16", "topRight", { x: 300, y: 300, width: 400, height: 900 }).mode).toBe("chip");
  });

  it("a docked Image fills the dock, not the whole frame", () => {
    const layout = pinnedLayout(lightTheme, "9:16");
    const html = renderToStaticMarkup(
      createElement(Pinned as never, { progress: 0.5, theme: lightTheme, aspect: "9:16", pinned: { component: "Image", props: { src: "a.png" } } }),
    );
    const media = boxOf(parseStyle(/data-media="image"[^>]*?style="([^"]*)"/.exec(html)![1]!));
    expect(media).toEqual(layout.dock);
  });
});
