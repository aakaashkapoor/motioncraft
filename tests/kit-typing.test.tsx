// Design v3, life #10: typing with a live caret. Characters land at 30-45 per
// second with seeded jitter and pauses at punctuation, the same way for the
// same seed on every render; the terminal prints output with a short fade and
// rise and scrolls with the `enter` spring; the chat composer types a message
// before it is sent; the browser's address bar can type its url.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  BrowserWindow,
  ChatWindow,
  NOMINAL_SCENE_MS,
  SceneClockContext,
  TYPE_FIT_ATTRIBUTE,
  TerminalWindow,
  addressBarTyping,
  caretBlink,
  chatTiming,
  chatWindowLayout,
  contentArea,
  lightTheme,
  terminalFrame,
  terminalSchedule,
  tween,
  typedCount,
  typingSpan,
  typingTimes,
  type Aspect,
  type ChatMessage,
  type SceneTime,
  type TerminalLine,
} from "../src/index";

const theme = lightTheme;
const T = theme.motion.typing;
/** The mean gap between keystrokes, in ms. */
const BASE = 1000 / T.cps;
const FPS = 30;

/** A scene of `endMs`, at its start. */
const scene = (endMs: number): SceneTime => ({ ms: 0, endMs, leftMs: endMs });
/** The scene a component drawn without a clock assumes. */
const NOMINAL = scene(NOMINAL_SCENE_MS);

/** Parses an inline `style="..."` attribute into a map. */
function parseStyle(style: string): Map<string, string> {
  return new Map(
    style
      .split(";")
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(":");
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as const;
      }),
  );
}

/** The full markup of the first element carrying `attr` (with `value`, if given), or undefined. */
function element(html: string, attr: string, value?: string): string | undefined {
  const start = html.search(new RegExp(`<[a-z]+[^>]*\\s${attr}${value === undefined ? "(=|\\s|>)" : `="${value}"`}`));
  if (start < 0) return undefined;
  const tag = /<[^>]*>/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let m = tag.exec(html); m !== null; m = tag.exec(html)) {
    const t = m[0];
    if (t.startsWith("</")) depth--;
    else if (!t.endsWith("/>")) depth++;
    if (depth === 0) return html.slice(start, tag.lastIndex);
  }
  throw new Error(`unclosed element with ${attr}`);
}

function styleOf(markup: string): Map<string, string> {
  const open = /^<[^>]*>/.exec(markup)![0];
  return parseStyle(/style="([^"]*)"/.exec(open)?.[1] ?? "");
}

const stripTags = (html: string) =>
  html.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

/** The gaps between consecutive keystrokes, the first measured from `from`. */
const gaps = (chars: readonly number[], from: number) => chars.map((t, i) => t - (i === 0 ? from : chars[i - 1]!));

/** Every frame of a 3 s scene, at 30 fps. */
function everyFrame(draw: () => ReactElement, frames = 3 * FPS): string[] {
  return Array.from({ length: frames }, (_, frame) =>
    renderToStaticMarkup(<SceneClockContext.Provider value={{ fps: FPS, frame, frames }}>{draw()}</SceneClockContext.Provider>),
  );
}

describe("typingTimes", () => {
  const LONG = "abcdefghij".repeat(12);

  it("lands 30-45 characters per second on average, each gap jittered by at most +-30%", () => {
    const times = typingTimes(theme, LONG, "speed");
    expect(times).toHaveLength(LONG.length);
    const steps = gaps(times, 0);
    for (const gap of steps) {
      expect(gap).toBeGreaterThanOrEqual(BASE * (1 - T.jitter) - 1e-9);
      expect(gap).toBeLessThanOrEqual(BASE * (1 + T.jitter) + 1e-9);
    }
    const cps = LONG.length / (times.at(-1)! / 1000);
    expect(cps).toBeGreaterThanOrEqual(30);
    expect(cps).toBeLessThanOrEqual(45);
    // The jitter is real: some keystrokes come fast, some slow.
    expect(Math.max(...steps) - Math.min(...steps)).toBeGreaterThan(BASE * T.jitter);
  });

  it("is the same for the same seed and different for another", () => {
    expect(typingTimes(theme, LONG, 1)).toEqual(typingTimes(theme, LONG, 1));
    expect(typingTimes(theme, LONG, "a")).toEqual(typingTimes(theme, LONG, "a"));
    expect(typingTimes(theme, LONG, 2)).not.toEqual(typingTimes(theme, LONG, 1));
  });

  it("pauses 200-400 ms after punctuation that ends a clause, but not inside a word or a file name", () => {
    const text = "Ready? Render video.json, then ship it.";
    const times = typingTimes(theme, text, 0);
    const gap = (i: number) => times[i]! - times[i - 1]!;
    for (const i of [text.indexOf("?") + 1, text.indexOf(",") + 1]) {
      expect(gap(i)).toBeGreaterThanOrEqual(T.pauseMinMs + BASE * (1 - T.jitter) - 1e-9);
      expect(gap(i)).toBeLessThanOrEqual(T.pauseMaxMs + BASE * (1 + T.jitter) + 1e-9);
    }
    expect(gap(text.indexOf(".json") + 1)).toBeLessThanOrEqual(BASE * (1 + T.jitter) + 1e-9);
  });

  it("counts the characters shown at a given ms", () => {
    const times = typingTimes(theme, "npm test", 0);
    expect(typedCount(times, -1)).toBe(0);
    expect(typedCount(times, times[0]! - 0.001)).toBe(0);
    expect(typedCount(times, times[0]!)).toBe(1);
    expect(typedCount(times, times[4]! - 0.001)).toBe(4);
    expect(typedCount(times, times[4]!)).toBe(5);
    expect(typedCount(times, times.at(-1)! + 1000)).toBe("npm test".length);
  });
});

describe("typingSpan", () => {
  it("pauses on the empty field, then types, every keystroke scaled by the pace", () => {
    const span = typingSpan(theme, "npm test", 1000, 0);
    expect(span.start).toBe(1000);
    expect(span.typeStart).toBeGreaterThan(span.start);
    expect(span.chars).toHaveLength("npm test".length);
    expect(span.chars[0]).toBeGreaterThan(span.typeStart);
    expect(span.end).toBe(span.chars.at(-1));
    typingTimes(theme, "npm test", 0).forEach((t, i) => expect(span.chars[i]! - span.typeStart).toBeCloseTo(t, 9));
    const fast = typingSpan(theme, "npm test", 1000, 0, 0.5);
    expect(fast.end - 1000).toBeCloseTo((span.end - 1000) / 2, 9);
    expect(typingSpan(theme, "", 1000, 0).end).toBe(typingSpan(theme, "", 1000, 0).typeStart);
  });
});

describe("caretBlink", () => {
  it("blinks once every 1.06 s: on as it starts, off half a period later", () => {
    expect(caretBlink(theme, 0)).toBeCloseTo(1, 9);
    expect(caretBlink(theme, T.blinkMs / 2)).toBeCloseTo(0, 9);
    expect(caretBlink(theme, T.blinkMs)).toBeCloseTo(1, 9);
    expect(caretBlink(theme, T.blinkMs * 3.5)).toBeCloseTo(0, 9);
  });
});

const LINES: TerminalLine[] = [
  { prompt: true, text: "npx motioncraft render video.json" },
  { text: "rendered 240 frames" },
  { text: "wrote out/video.mp4" },
];

/** Long enough to fill a window several times over. */
const LONG_LINES: TerminalLine[] = Array.from({ length: 28 }, (_, i) =>
  i % 4 === 0 ? { prompt: true, text: `npm run step-${i / 4 + 1}` } : { text: `step ${i}: drew ${i * 10} frames` },
);

const terminal = (ms: number, extra: { lines?: TerminalLine[]; aspect?: Aspect; seed?: number | string } = {}) =>
  renderToStaticMarkup(
    <TerminalWindow progress={ms / NOMINAL_SCENE_MS} theme={theme} aspect={extra.aspect ?? "9:16"} lines={extra.lines ?? LINES} seed={extra.seed} />,
  );

/** The text each terminal line shows, by line index; lines not drawn are absent. */
function terminalTexts(html: string): Map<number, string> {
  const re = /data-terminal-text="(\d+)"[^>]*>(.*?)<\/span>/g;
  return new Map([...html.matchAll(re)].map((m) => [Number(m[1]), stripTags(m[2]!)]));
}

/** Opacity and downward offset of terminal line `i`, or undefined when it is not drawn. */
function terminalLine(html: string, i: number): { opacity: number; rise: number } | undefined {
  const markup = element(html, "data-terminal-line", String(i));
  if (markup === undefined) return undefined;
  const style = styleOf(markup);
  const rise = /translateY\((-?[\d.]+)px\)/.exec(style.get("transform") ?? "")?.[1];
  return { opacity: parseFloat(style.get("opacity") ?? "1"), rise: rise === undefined ? 0 : parseFloat(rise) };
}

function caretOpacity(html: string): number {
  const markup = element(html, "data-terminal-caret");
  if (markup === undefined) throw new Error("no caret");
  return parseFloat(styleOf(markup).get("opacity") ?? "NaN");
}

describe("TerminalWindow typing", () => {
  const schedule = terminalSchedule(theme, "9:16", LINES, { time: NOMINAL });

  it("shows exactly the characters that have landed at a given ms", () => {
    const entry = schedule.entries[0]!;
    const text = LINES[0]!.text;
    expect(entry.chars).toHaveLength(text.length);
    expect(terminalTexts(terminal(entry.start + 0.01)).get(0)).toBe("");
    expect(terminalTexts(terminal(entry.typeStart + 0.01)).get(0)).toBe("");
    for (const k of [1, 2, 9, 16, text.length]) {
      expect(terminalTexts(terminal(entry.chars[k - 1]! + 0.01)).get(0)).toBe(text.slice(0, k));
      expect(terminalTexts(terminal(entry.chars[k - 1]! - 0.01)).get(0)).toBe(text.slice(0, k - 1));
    }
  });

  it("types commands at the typing token's pace, with jitter", () => {
    const entry = schedule.entries[0]!;
    // The command has no clause punctuation, so no pauses: every gap is a jittered keystroke.
    const steps = gaps(entry.chars, entry.typeStart);
    for (const gap of steps) {
      expect(gap).toBeGreaterThanOrEqual(BASE * (1 - T.jitter) - 1e-9);
      expect(gap).toBeLessThanOrEqual(BASE * (1 + T.jitter) + 1e-9);
    }
    expect(new Set(steps.map((g) => g.toFixed(3))).size).toBeGreaterThan(steps.length / 2);
  });

  it("types the same way on every render for a seed, and differently for another", () => {
    const draw = (seed: number) => () => <TerminalWindow progress={0} theme={theme} aspect="9:16" lines={LINES} seed={seed} />;
    const a = everyFrame(draw(7));
    expect(everyFrame(draw(7))).toEqual(a);
    expect(everyFrame(draw(8))).not.toEqual(a);
    const seeded = terminalSchedule(theme, "9:16", LINES, { time: NOMINAL, seed: 7 });
    expect(terminalSchedule(theme, "9:16", LINES, { time: NOMINAL, seed: 7 })).toEqual(seeded);
    expect(seeded.entries[0]!.chars).not.toEqual(schedule.entries[0]!.chars);
  });

  it("fades and rises each output line in over 120 ms", () => {
    const out = schedule.entries[1]!;
    expect(terminalLine(terminal(out.start - 0.01), 1)).toBeUndefined();
    const mid = terminalLine(terminal(out.start + T.ms / 2), 1)!;
    expect(mid.opacity).toBeGreaterThan(0);
    expect(mid.opacity).toBeLessThan(1);
    expect(mid.rise).toBeGreaterThan(0);
    expect(mid.rise).toBeLessThanOrEqual(theme.spacing.xxs);
    const landed = terminalLine(terminal(out.start + T.ms + 0.01), 1)!;
    expect(landed.opacity).toBe(1);
    expect(landed.rise).toBe(0);
  });

  it("blinks the caret on the fresh prompt with a 1.06 s period", () => {
    const idle = schedule.entries.at(-1)!.start;
    expect(schedule.entries).toHaveLength(LINES.length + 1);
    expect(caretOpacity(terminal(idle + 0.01))).toBeCloseTo(1, 3);
    expect(caretOpacity(terminal(idle + T.blinkMs / 2))).toBeCloseTo(0, 3);
    expect(caretOpacity(terminal(idle + T.blinkMs))).toBeCloseTo(1, 3);
  });

  it.each(ASPECTS)("keeps long output at the mono step and scrolls a capped window instead of shrinking it (%s)", (aspect) => {
    const long = terminalSchedule(theme, aspect, LONG_LINES, { time: NOMINAL });
    expect(long.size).toBe(theme.type.mono[aspect].size);
    expect(long.rows.reduce((a, b) => a + b, 0)).toBeGreaterThan(long.visibleRows);
    expect(long.scrolls.length).toBeGreaterThan(0);
    const html = terminal(NOMINAL_SCENE_MS * 0.9, { lines: LONG_LINES, aspect });
    expect(html).not.toContain(TYPE_FIT_ATTRIBUTE);
    expect(html).toContain(`font-size:${theme.type.mono[aspect].size}px`);
    const box = styleOf(element(html, "data-window")!);
    const area = contentArea(theme, aspect);
    expect(parseFloat(box.get("top")!) + parseFloat(box.get("height")!)).toBeLessThanOrEqual(area.y + area.height);
  });

  it("lets the earliest lines go once they have scrolled away, keeping the latest", () => {
    const html = terminal(NOMINAL_SCENE_MS * 0.9, { lines: LONG_LINES });
    const shown = [...terminalTexts(html).keys()];
    expect(shown).not.toContain(0);
    expect(shown).toContain(LONG_LINES.length - 1);
    expect(element(html, "data-terminal-line", String(LONG_LINES.length))).toBeDefined();
  });

  it("scrolls with the enter spring", () => {
    const long = terminalSchedule(theme, "9:16", LONG_LINES, { time: scene(30_000) });
    const scrolled = (ms: number) => long.scrolls.reduce((sum, s) => sum + s.rows * tween(theme.motion.enter, ms - s.at), 0);
    const first = long.scrolls[0]!;
    expect(terminalFrame(theme, long, first.at).scroll).toBeCloseTo(0, 9);
    for (const ms of [first.at + 50, first.at + theme.motion.enter.ms / 3, first.at + theme.motion.enter.ms, long.entries.at(-1)!.start + 2000]) {
      expect(terminalFrame(theme, long, ms).scroll).toBeCloseTo(scrolled(ms), 9);
    }
    const end = terminalFrame(theme, long, long.entries.at(-1)!.start + 2000);
    expect(end.scroll).toBe(long.scrolls.reduce((sum, s) => sum + s.rows, 0));
  });

  it.each(ASPECTS)("stacks the drawn lines from the top, moved by the scroll offset (%s)", (aspect) => {
    const long = terminalSchedule(theme, aspect, LONG_LINES, { time: scene(30_000) });
    const end = long.entries.at(-1)!.start + 1000;
    for (let ms = 0; ms <= end; ms += 1000 / FPS) {
      const frame = terminalFrame(theme, long, ms);
      let y = frame.offset;
      frame.entries.forEach((e, i) => {
        if (!e.shown) return;
        expect(e.top).toBeCloseTo(y, 6);
        y += long.rows[i]! * long.rowHeight;
      });
    }
  });

  it.each(ASPECTS)("fades a line out as it glides up, not before its scroll starts (%s)", (aspect) => {
    const long = terminalSchedule(theme, aspect, LONG_LINES, { time: scene(30_000) });
    const first = long.scrolls[0]!;
    const leaving = long.entries.map((e, i) => [e, i] as const).filter(([e]) => e.leave > first.at && e.leave <= first.at + theme.motion.enter.ms);
    expect(leaving.length).toBeGreaterThan(0);
    for (const [entry, i] of leaving) {
      expect(terminalFrame(theme, long, first.at).entries[i]!.opacity).toBeGreaterThan(0.75);
      const going = terminalFrame(theme, long, entry.leave - 1).entries[i]!;
      expect(going.top).toBeLessThan(-long.rowHeight / 4);
      expect(going.opacity).toBeLessThan(0.5);
      expect(terminalFrame(theme, long, entry.leave).entries[i]!.shown).toBe(false);
    }
  });

  it.each(ASPECTS)("never shows a line outside the window while it scrolls (%s)", (aspect) => {
    for (const time of [scene(30_000), NOMINAL]) {
      const long = terminalSchedule(theme, aspect, LONG_LINES, { time });
      const bottom = long.visibleRows * long.rowHeight;
      const end = long.entries.at(-1)!.start + 1000;
      for (let ms = 0; ms <= end; ms += 1000 / FPS) {
        terminalFrame(theme, long, ms).entries.forEach((e, i) => {
          if (!e.shown || e.opacity <= 0) return;
          expect(e.top + e.rise, `line ${i} at ${ms.toFixed(0)} ms`).toBeGreaterThanOrEqual(-long.padding);
          expect(e.top + e.rise + long.rows[i]! * long.rowHeight, `line ${i} at ${ms.toFixed(0)} ms`).toBeLessThanOrEqual(bottom + long.padding);
        });
      }
    }
  });
});

const TYPED: ChatMessage[] = [
  { author: "Maya Chen", time: "9:41", text: "Can you render the launch video?", typed: true },
  { author: "Render Bot", time: "9:42", text: "Rendering now.", badge: "APP" },
];

const chat = (ms: number, extra: { messages?: ChatMessage[]; seed?: number } = {}) =>
  renderToStaticMarkup(
    <ChatWindow progress={ms / NOMINAL_SCENE_MS} theme={theme} aspect="9:16" channel="releases" messages={extra.messages ?? TYPED} seed={extra.seed} />,
  );

/** What the composer shows: the typed text (undefined when it shows its placeholder) and whether it has a caret. */
function composer(html: string): { typed: string | undefined; placeholder: boolean; caret: boolean } {
  const box = element(html, "data-chat-composer")!;
  const typed = element(box, "data-chat-composer-text");
  return { typed: typed === undefined ? undefined : stripTags(typed), placeholder: box.includes("Message # releases"), caret: box.includes("data-caret") };
}

function opacityOf(html: string, attr: string, i: number): number {
  return parseFloat(styleOf(element(html, attr, String(i))!).get("opacity") ?? "NaN");
}

describe("ChatWindow composer typing", () => {
  const timing = chatTiming(theme, TYPED, 0, NOMINAL);
  const first = timing[0]!;
  const text = TYPED[0]!.text;

  it("types a typed message into the composer, character by character, before it is sent", () => {
    expect(first.chars).toHaveLength(text.length);
    expect(timing[1]!.chars).toBeUndefined();
    const before = composer(chat(first.typing[0] - 1));
    expect(before.typed).toBeUndefined();
    expect(before.placeholder).toBe(true);
    for (const k of [1, 4, 12, text.length]) {
      const html = chat(first.chars![k - 1]! + 0.01);
      expect(composer(html).typed).toBe(text.slice(0, k));
      expect(composer(html).caret).toBe(true);
      expect(opacityOf(html, "data-chat-message", 0)).toBe(0);
    }
  });

  it("types at the typing token's pace, then holds the whole message for a beat before sending it", () => {
    expect(first.typing[1] - first.chars!.at(-1)!).toBeCloseTo(theme.motion.beat.ms, 6);
    for (const gap of gaps(first.chars!, first.chars![0]!).slice(1)) {
      expect(gap).toBeGreaterThanOrEqual(BASE * (1 - T.jitter) - 1e-9);
      expect(gap).toBeLessThanOrEqual(BASE * (1 + T.jitter) + 1e-9);
    }
  });

  it("sends it: the composer clears and the message lands", () => {
    expect(first.appear[0]).toBe(first.typing[1]);
    const sent = chat(first.appear[0] + 1);
    expect(composer(sent).typed).toBeUndefined();
    expect(composer(sent).placeholder).toBe(true);
    expect(composer(sent).caret).toBe(false);
    expect(opacityOf(chat(first.appear[1]), "data-chat-message", 0)).toBeCloseTo(1, 3);
    // The reply follows with its typing indicator.
    expect(timing[1]!.typing[0]).toBeGreaterThan(first.appear[0]);
  });

  it("shows no typing indicator for a typed message, and still does for the reply", () => {
    const during = chat((first.typing[0] + first.typing[1]) / 2);
    expect(opacityOf(during, "data-chat-typing", 0)).toBe(0);
    const reply = timing[1]!;
    expect(opacityOf(chat((reply.typing[0] + reply.typing[1]) / 2), "data-chat-typing", 1)).toBeGreaterThan(0.5);
  });

  it("types the same way on every render for a seed, and differently for another", () => {
    const draw = (seed: number) => () => <ChatWindow progress={0} theme={theme} aspect="9:16" channel="releases" messages={TYPED} seed={seed} />;
    const a = everyFrame(draw(3));
    expect(everyFrame(draw(3))).toEqual(a);
    expect(everyFrame(draw(4))).not.toEqual(a);
    expect(chatTiming(theme, TYPED, 0, NOMINAL, 4)[0]!.chars).not.toEqual(first.chars);
  });

  it("makes room in the composer for the message it types, inside the content area", () => {
    const plain = TYPED.map(({ typed: _, ...m }) => m);
    for (const aspect of ASPECTS) {
      const area = contentArea(theme, aspect);
      const typed = chatWindowLayout(theme, aspect, { messages: TYPED });
      expect(typed.composerHeight).toBeGreaterThanOrEqual(chatWindowLayout(theme, aspect, { messages: plain }).composerHeight);
      expect(typed.window.y + typed.window.height).toBeLessThanOrEqual(area.y + area.height);
    }
    // In 9:16 the question wraps in the composer, so the composer grows to hold both lines.
    expect(chatWindowLayout(theme, "9:16", { messages: TYPED }).composerHeight).toBeGreaterThan(chatWindowLayout(theme, "9:16", { messages: plain }).composerHeight);
  });
});

const URL = "https://example.com/pricing";
const SHOWN_URL = "example.com/pricing";
const PAGE = { component: "TitleCard", props: { title: "Simple pricing", subtitle: "One plan" } };

const browser = (ms: number, extra: { typeUrl?: boolean; seed?: number } = {}) =>
  renderToStaticMarkup(
    <BrowserWindow progress={ms / NOMINAL_SCENE_MS} theme={theme} aspect="9:16" url={URL} content={PAGE} typeUrl={extra.typeUrl ?? true} seed={extra.seed} />,
  );

const addressText = (html: string) => stripTags(element(element(html, "data-address-bar")!, "data-address-text")!);
const addressCaret = (html: string) => element(html, "data-address-bar")!.includes("data-caret");
const page = (html: string) => element(html, "data-window-content")!;

describe("BrowserWindow address bar typing", () => {
  const span = addressBarTyping(theme, URL, NOMINAL);

  it("types its url, without the scheme, once the window has arrived", () => {
    const { leadMs, fx } = theme.motion;
    expect(span.start).toBe(leadMs + fx.ms);
    expect(span.chars).toHaveLength(SHOWN_URL.length);
    expect(addressText(browser(0))).toBe("");
    expect(addressText(browser(span.typeStart))).toBe("");
    for (const k of [1, 7, 12, SHOWN_URL.length]) {
      expect(addressText(browser(span.chars[k - 1]! + 0.01))).toBe(SHOWN_URL.slice(0, k));
    }
    expect(addressText(browser(span.end + 1000))).toBe(SHOWN_URL);
  });

  it("shows a caret in the address bar while it types, and drops it once the url is entered", () => {
    expect(addressCaret(browser(span.start + 1))).toBe(true);
    expect(addressCaret(browser((span.typeStart + span.end) / 2))).toBe(true);
    expect(addressCaret(browser(span.end + 1))).toBe(false);
  });

  it("loads the page only once the url has been typed", () => {
    expect(page(browser(span.end - 1))).toBe(page(browser(1)));
    expect(page(browser(span.end + 800))).not.toBe(page(browser(1)));
    // Without typing, the page arrives with the window.
    expect(page(browser(span.end - 1, { typeUrl: false }))).not.toBe(page(browser(1, { typeUrl: false })));
  });

  it("shows the whole url from the first frame when it does not type", () => {
    expect(addressText(browser(0, { typeUrl: false }))).toBe(SHOWN_URL);
    expect(addressCaret(browser(span.start + 1, { typeUrl: false }))).toBe(false);
  });

  it("types the same way for a seed, and differently for another", () => {
    expect(addressBarTyping(theme, URL, NOMINAL, 5)).toEqual(addressBarTyping(theme, URL, NOMINAL, 5));
    expect(addressBarTyping(theme, URL, NOMINAL, 6).chars).not.toEqual(addressBarTyping(theme, URL, NOMINAL, 5).chars);
    const draw = (seed: number) => () => <BrowserWindow progress={0} theme={theme} aspect="9:16" url={URL} typeUrl seed={seed} />;
    expect(everyFrame(draw(5))).toEqual(everyFrame(draw(5)));
  });
});
