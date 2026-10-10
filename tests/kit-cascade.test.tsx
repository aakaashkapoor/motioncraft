// Design v3, life #8 and #9, and the owner's reference: cards and list rows
// lift in one by one (y +80, scale 0.94, the `enter` spring, 90 ms apart),
// their shadow growing with the lift; a highlight moves along the items over
// time, the active one popping with its chip in the accent while the others
// stay calm, and comes to rest on the last; the shine crosses the card it
// rests on, and AppWindow and BrowserWindow as they land, once.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AppWindow,
  BrowserWindow,
  Card,
  CardRow,
  FeatureList,
  SceneClockContext,
  StepList,
  cardRowTiming,
  exitMs,
  fade,
  featureListTiming,
  highlightAt,
  highlightLevel,
  highlightShineMs,
  highlightStops,
  lightTheme,
  stepListTiming,
  tween,
  withAlpha,
  type CardData,
  type HighlightSpec,
} from "../src/index";

const theme = lightTheme;
const { enter, lift, pop, shine, leadMs } = theme.motion;
const fast = theme.motion["fx.fast"];

/** Draws `element` `ms` into a scene of `sceneMs`, on a 1000 fps clock so any ms can be drawn. */
function at(element: ReactElement, ms: number, sceneMs = 10_000): string {
  return renderToStaticMarkup(<SceneClockContext.Provider value={{ fps: 1000, frame: ms, frames: sceneMs + 1 }}>{element}</SceneClockContext.Provider>);
}

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

/** Inline styles of every element carrying `attr`, in document order. */
function stylesOf(html: string, attr: string): Array<Map<string, string>> {
  return [...html.matchAll(new RegExp(`<[a-z]+[^>]*?${attr}[^>]*?style="([^"]*)"`, "g"))].map((m) => parseStyle(m[1]!));
}

/** The markup of each item, split at `attr` (e.g. `data-card="`): item i is everything from its marker to the next. */
function items(html: string, attr: string): string[] {
  return html.split(attr).slice(1);
}

const transformOf = (style: Map<string, string>) => style.get("transform") ?? "";
const scaleOf = (style: Map<string, string>) => parseFloat(/scale\(([-\d.]+)\)/.exec(transformOf(style))?.[1] ?? "1");
const riseOf = (style: Map<string, string>) => parseFloat(/translateY\((-?[\d.]+)px\)/.exec(transformOf(style))?.[1] ?? "0");
const opacityOf = (style: Map<string, string>) => parseFloat(style.get("opacity") ?? "1");

/** The rise and scale an item has `elapsed` ms into its `enter` spring. */
const lifted = (elapsed: number) => {
  const move = tween(enter, elapsed);
  return { rise: (1 - move) * lift.risePx, scale: lift.fromScale + (1 - lift.fromScale) * move };
};

const STEPS: CardData[] = [
  { icon: "file", title: "Write", subtitle: "A prompt", step: 1 },
  { icon: "code", title: "Plan", subtitle: "The scenes", step: 2 },
  { icon: "check", title: "Check", subtitle: "Every frame", step: 3 },
  { icon: "chat", title: "Voice", subtitle: "Narration", step: 4 },
  { icon: "play", title: "Render", subtitle: "An MP4", step: 5 },
];
const ALONG: HighlightSpec = { from: 0, to: 4, stepMs: 600 };

describe("the lift token (life #8)", () => {
  it("rises items 80 px from below and from scale 0.94; their shadow grows from y 8, blur 24", () => {
    expect(lift).toEqual({ risePx: 80, fromScale: 0.94, shadowY: 8, shadowBlur: 24 });
  });
});

describe("highlightStops", () => {
  it("lands a single index once, at the start, and keeps it there", () => {
    expect(highlightStops(theme, 2, 5, 1000)).toEqual([{ index: 2, startMs: 1000, endMs: Infinity }]);
  });

  it("has no stops without a highlight, or with an index off the items", () => {
    expect(highlightStops(theme, undefined, 5, 1000)).toEqual([]);
    expect(highlightStops(theme, 5, 5, 1000)).toEqual([]);
    expect(highlightStops(theme, -1, 5, 1000)).toEqual([]);
  });

  it("moves a progression one item every stepMs, from `from` to `to`, and rests on `to`", () => {
    expect(highlightStops(theme, ALONG, 5, 1000)).toEqual([
      { index: 0, startMs: 1000, endMs: 1600 },
      { index: 1, startMs: 1600, endMs: 2200 },
      { index: 2, startMs: 2200, endMs: 2800 },
      { index: 3, startMs: 2800, endMs: 3400 },
      { index: 4, startMs: 3400, endMs: Infinity },
    ]);
  });

  it("runs a progression backwards when `to` comes before `from`", () => {
    expect(highlightStops(theme, { from: 3, to: 1, stepMs: 500 }, 5, 0).map((s) => [s.index, s.startMs])).toEqual([
      [3, 0],
      [2, 500],
      [1, 1000],
    ]);
  });

  it("rejects a progression off the items, or one that never moves", () => {
    expect(() => highlightStops(theme, { from: 0, to: 5, stepMs: 600 }, 5, 0)).toThrow(/highlight\.to must be a whole item index from 0 to 4, got 5/);
    expect(() => highlightStops(theme, { from: -1, to: 2, stepMs: 600 }, 5, 0)).toThrow(/highlight\.from/);
    expect(() => highlightStops(theme, { from: 0.5, to: 2, stepMs: 600 }, 5, 0)).toThrow(/highlight\.from/);
    expect(() => highlightStops(theme, { from: 0, to: 2, stepMs: 0 }, 5, 0)).toThrow(/highlight\.stepMs must be a number of ms above 0/);
  });

  it("keeps its pace in a long scene, and speeds up in a short one to rest and shine before the exit", () => {
    const long = highlightStops(theme, ALONG, 5, 1000, { ms: 0, endMs: 9000, leftMs: 9000 });
    expect(long.map((s) => s.startMs)).toEqual([1000, 1600, 2200, 2800, 3400]);
    const short = highlightStops(theme, ALONG, 5, 1000, { ms: 0, endMs: 3500, leftMs: 3500 });
    const starts = short.map((s) => s.startMs);
    expect(starts[0]).toBe(1000);
    for (let i = 2; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeCloseTo(starts[1]! - starts[0]!, 6);
    expect(starts[1]! - starts[0]!).toBeLessThan(600);
    const latest = 3500 - exitMs(theme, enter.ms) - theme.motion.beat.ms;
    expect(starts.at(-1)! + Math.max(pop.ms, shine.ms)).toBeCloseTo(latest, 6);
  });
});

describe("the highlight at a given ms", () => {
  const stops = highlightStops(theme, ALONG, 5, 1000);

  it("is on no item before it starts, then on each item in turn, and stays on the last", () => {
    expect(highlightAt(stops, 999)).toBeUndefined();
    expect(highlightAt(stops, 1000)).toBe(0);
    expect(highlightAt(stops, 1599)).toBe(0);
    expect(highlightAt(stops, 1600)).toBe(1);
    expect(highlightAt(stops, 2900)).toBe(3);
    expect(highlightAt(stops, 3400)).toBe(4);
    expect(highlightAt(stops, 60_000)).toBe(4);
    expect(highlightAt([], 2000)).toBeUndefined();
  });

  it("pops the item it lands on with `pop`, overshooting, and lets it go with `fx.fast`", () => {
    expect(highlightLevel(theme, stops, 1, 1599)).toBe(0);
    expect(highlightLevel(theme, stops, 1, 1700)).toBeCloseTo(tween(pop, 100), 6);
    const springing = Array.from({ length: pop.ms }, (_, ms) => highlightLevel(theme, stops, 1, 1600 + ms));
    expect(Math.max(...springing)).toBeGreaterThan(1.05);
    expect(highlightLevel(theme, stops, 1, 1600 + pop.ms)).toBe(1);
    expect(highlightLevel(theme, stops, 1, 2250)).toBeCloseTo(1 - fade(fast, 50), 6);
    expect(highlightLevel(theme, stops, 1, 2200 + fast.ms)).toBe(0);
    expect(highlightLevel(theme, stops, 3, 2000)).toBe(0);
    expect(highlightLevel(theme, stops, 4, 60_000)).toBe(1);
  });

  it("shines only the item it comes to rest on, from the moment it lands there", () => {
    expect(highlightShineMs(stops, 4, 3399)).toBeUndefined();
    expect(highlightShineMs(stops, 4, 3600)).toBe(200);
    for (const i of [0, 1, 2, 3]) expect(highlightShineMs(stops, i, 3600)).toBeUndefined();
    expect(highlightShineMs([], 0, 3600)).toBeUndefined();
  });
});

describe("CardRow: the cascade", () => {
  const timing = cardRowTiming(theme, STEPS.length);
  const draw = (ms: number) => at(<CardRow progress={0} theme={theme} aspect="16:9" cards={STEPS} />, ms);
  const cells = (ms: number) => stylesOf(draw(ms), "data-card=");

  it("starts the cards 90 ms apart from the scene's lead", () => {
    expect(timing[0]![0]).toBe(leadMs);
    for (let i = 1; i < timing.length; i++) expect(timing[i]![0] - timing[i - 1]![0]).toBe(enter.staggerMs);
  });

  it("rises each card 80 px from below and from scale 0.94 on the `enter` spring", () => {
    for (const [i, [start, end]] of timing.entries()) {
      const before = cells(start)[i]!;
      expect(opacityOf(before)).toBe(0);
      expect(riseOf(before)).toBe(lift.risePx);
      expect(scaleOf(before)).toBe(lift.fromScale);
      const moving = cells(start + 120)[i]!;
      expect(riseOf(moving)).toBeCloseTo(lifted(120).rise, 1);
      expect(scaleOf(moving)).toBeCloseTo(lifted(120).scale, 3);
      expect(transformOf(cells(end)[i]!)).toBe("translateY(0px) scale(1)");
      expect(opacityOf(cells(end)[i]!)).toBe(1);
    }
  });

  it("grows each card's shadow with the lift, from y 8 blur 24 to the card shadow", () => {
    const shadow = (ms: number) => stylesOf(draw(ms), "data-card-face")[0]!.get("box-shadow")!;
    const ink = withAlpha(theme.colors.shadow, theme.cardShadow.opacity);
    expect(shadow(leadMs)).toBe(`0 ${lift.shadowY}px ${lift.shadowBlur}px ${ink}`);
    expect(shadow(timing[0]![1])).toBe(`0 ${theme.cardShadow.y}px ${theme.cardShadow.blur}px ${ink}`);
    const mid = /^0 ([\d.]+)px ([\d.]+)px/.exec(shadow(leadMs + 100))!;
    expect(parseFloat(mid[1]!)).toBeGreaterThan(lift.shadowY);
    expect(parseFloat(mid[1]!)).toBeLessThan(theme.cardShadow.y);
    expect(parseFloat(mid[2]!)).toBeGreaterThan(lift.shadowBlur);
  });
});

describe("CardRow: the highlight moves along the cards", () => {
  const landed = cardRowTiming(theme, STEPS.length).at(-1)![1];
  const stops = highlightStops(theme, ALONG, STEPS.length, landed);
  const draw = (ms: number) => at(<CardRow progress={0} theme={theme} aspect="16:9" cards={STEPS} highlight={ALONG} />, ms);
  const lit = (ms: number) => [...draw(ms).matchAll(/data-highlighted="(\w+)"/g)].map((m) => m[1] === "true");

  it("starts once every card has landed, then lights each card in turn", () => {
    expect(stops[0]!.startMs).toBe(landed);
    expect(lit(landed - 1)).toEqual([false, false, false, false, false]);
    for (const [k, stop] of stops.entries()) {
      expect(lit(stop.startMs + pop.ms), `stop ${k}`).toEqual(STEPS.map((_, i) => i === k));
    }
  });

  it("pops the active card to 1.04 with its number chip in the accent; the others stay calm", () => {
    const html = draw(stops[2]!.startMs + pop.ms);
    const faces = stylesOf(html, "data-card-face");
    expect(faces.map(scaleOf)).toEqual([1, 1, pop.scale, 1, 1]);
    expect(faces[2]!.get("box-shadow")).toContain(theme.colors.accent);
    for (const i of [0, 1, 3, 4]) expect(faces[i]!.get("box-shadow")).not.toContain(theme.colors.accent);
    const chips = stylesOf(html, "data-card-step");
    expect(chips.map((c) => c.get("background-color"))).toEqual(STEPS.map((_, i) => (i === 2 ? theme.colors.accent : theme.colors.surfaceAlt)));
    expect(stylesOf(html, "data-card=").map(opacityOf)).toEqual([1, 1, 1, 1, 1]);
  });

  it("comes to rest on the last card and stays there", () => {
    expect(lit(9000)).toEqual([false, false, false, false, true]);
    expect(scaleOf(stylesOf(draw(9000), "data-card-face")[4]!)).toBe(pop.scale);
  });

  it("shines the card it rests on once, as it lands, and no other", () => {
    const last = stops.at(-1)!.startMs;
    const shining = (ms: number) => items(draw(ms), 'data-card="').map((card) => card.includes("data-shine"));
    expect(shining(last - 1)).toEqual([false, false, false, false, false]);
    expect(shining(last + shine.ms / 2)).toEqual([false, false, false, false, true]);
    expect(shining(last + shine.ms)).toEqual([false, false, false, false, false]);
    for (const stop of stops.slice(0, -1)) expect(shining(stop.startMs + 100)).toEqual([false, false, false, false, false]);
  });

  it("with a single index, pops and shines that card once the cascade has landed", () => {
    const html = at(<CardRow progress={0} theme={theme} aspect="16:9" cards={STEPS} highlight={1} />, landed + 200);
    expect(items(html, 'data-card="').map((card) => card.includes("data-shine"))).toEqual([false, true, false, false, false]);
  });
});

describe("step cards (the reference)", () => {
  it.each(["16:9", "9:16"] as const)("put the number chip first, top-left, the text after it and the icon last (%s)", (aspect) => {
    const html = at(<CardRow progress={0} theme={theme} aspect={aspect} cards={STEPS.slice(0, 3)} />, 5000);
    for (const card of items(html, 'data-card="')) {
      const chip = card.indexOf("data-card-step");
      const text = card.indexOf("data-card-text");
      const icon = card.indexOf("<svg");
      expect(chip).toBeGreaterThan(-1);
      expect(chip).toBeLessThan(text);
      expect(text).toBeLessThan(icon);
      expect(card).not.toMatch(/data-card-step=""[^>]*position:absolute/);
    }
  });

  it("stand in a column in a row of cards: the icon pinned to the bottom-left", () => {
    const html = at(<CardRow progress={0} theme={theme} aspect="16:9" cards={STEPS} />, 5000);
    expect(html).toMatch(/data-card-content="text"[^>]*style="[^"]*flex-direction:column;align-items:flex-start/);
    expect(stylesOf(html, "data-card-icon").every((s) => s.get("margin-top") === "auto")).toBe(true);
  });

  it("set the title bold and the subtitle muted, in the regular weight", () => {
    const html = at(<Card progress={0} theme={theme} aspect="16:9" icon="file" title="Write" subtitle="A prompt" step={1} />, 5000);
    const title = parseStyle(/data-card-title=""[^>]*style="([^"]*)"/.exec(html)![1]!);
    const subtitle = parseStyle(/data-card-subtitle=""[^>]*style="([^"]*)"/.exec(html)![1]!);
    expect(title.get("font-weight")).toBe(String(theme.weights.bold));
    expect(subtitle.get("font-weight")).toBe(String(theme.weights.regular));
    expect(subtitle.get("color")).toBe(theme.colors.textMuted);
  });
});

describe("Card", () => {
  const land = leadMs + enter.ms;
  const draw = (ms: number, highlighted = true) =>
    at(<Card progress={0} theme={theme} aspect="9:16" icon="chat" title="The prompt" subtitle="A launch intro" highlighted={highlighted} />, ms);

  it("lifts in from y +80 and scale 0.94", () => {
    const cell = stylesOf(draw(leadMs), "data-card=")[0]!;
    expect(riseOf(cell)).toBe(lift.risePx);
    expect(scaleOf(cell)).toBe(lift.fromScale);
  });

  it("highlighted, lands first, then pops in the accent and shines once", () => {
    expect(draw(land - 1)).toContain('data-highlighted="false"');
    expect(draw(land - 1)).not.toContain("data-shine");
    expect(draw(land + pop.ms)).toContain('data-highlighted="true"');
    expect(scaleOf(stylesOf(draw(land + pop.ms), "data-card-face")[0]!)).toBe(pop.scale);
    expect(draw(land + 100)).toContain("data-shine");
    expect(draw(land + shine.ms)).not.toContain("data-shine");
    expect(draw(land + 100, false)).not.toContain("data-shine");
  });
});

describe("StepList: rows lift in as cards and the highlight moves along them", () => {
  const ITEMS = ["Write the prompt", "Plan the scenes", "Check every frame", "Render the video"];
  const timing = stepListTiming(theme, ITEMS.length, true);
  const spec = { from: 0, to: 3, stepMs: 600 };
  const draw = (ms: number, highlight: HighlightSpec | undefined = spec) =>
    at(<StepList progress={0} theme={theme} aspect="9:16" title="How it works" items={ITEMS} highlight={highlight} />, ms);
  const rows = (ms: number) => [...draw(ms).matchAll(/<li[^>]*?style="([^"]*)"/g)].map((m) => parseStyle(m[1]!));
  const stops = highlightStops(theme, spec, ITEMS.length, timing.at(-1)![1]);

  it("rises each row 80 px from below and from scale 0.94, one by one", () => {
    for (let i = 1; i < timing.length; i++) expect(timing[i]![0] - timing[i - 1]![0]).toBe(enter.staggerMs);
    for (const [i, [start, end]] of timing.entries()) {
      expect(riseOf(rows(start)[i]!)).toBe(lift.risePx);
      expect(scaleOf(rows(start)[i]!)).toBe(lift.fromScale);
      expect(riseOf(rows(start + 120)[i]!)).toBeCloseTo(lifted(120).rise, 1);
      expect(transformOf(rows(end)[i]!)).toBe("translateY(0px) scale(1)");
    }
  });

  it("draws each row as a card whose shadow grows with the lift", () => {
    const faces = (ms: number) => stylesOf(draw(ms), "data-row-face");
    const landed = faces(timing.at(-1)![1])[0]!;
    expect(landed.get("background-color")).toBe(theme.colors.surface);
    expect(landed.get("border-radius")).toBe(`${theme.radius.md}px`);
    expect(landed.get("box-shadow")).toContain(`0 ${theme.cardShadow.y}px ${theme.cardShadow.blur}px`);
    expect(faces(timing[0]![0])[0]!.get("box-shadow")).toContain(`0 ${lift.shadowY}px ${lift.shadowBlur}px`);
  });

  it("pops the active row with its number chip in the accent; the others stay calm", () => {
    const html = draw(stops[1]!.startMs + pop.ms);
    expect(stylesOf(html, "data-row-face").map(scaleOf)).toEqual([1, pop.scale, 1, 1]);
    const chips = stylesOf(html, "data-step-chip").map((c) => c.get("background-color"));
    expect(chips).toEqual([theme.colors.surfaceAlt, theme.colors.accent, theme.colors.surfaceAlt, theme.colors.surfaceAlt]);
    const plain = stylesOf(draw(timing.at(-1)![1] - 1), "data-step-chip").map((c) => c.get("background-color"));
    expect(plain.every((c) => c === theme.colors.surfaceAlt)).toBe(true);
  });

  it("comes to rest on the last row and shines it once", () => {
    const last = stops.at(-1)!.startMs;
    const shining = (ms: number) => items(draw(ms), "<li").map((row) => row.includes("data-shine"));
    expect(shining(last + 200)).toEqual([false, false, false, true]);
    expect(shining(last + shine.ms)).toEqual([false, false, false, false]);
    expect(stylesOf(draw(9000), "data-row-face").map(scaleOf)).toEqual([1, 1, 1, pop.scale]);
  });
});

describe("FeatureList: rows lift in as cards and can carry a highlight", () => {
  const ITEMS = [
    { icon: "shield", text: "Runs locally" },
    { icon: "code", text: "Code-drawn frames" },
    { icon: "check", text: "Checked layouts" },
  ];
  const timing = featureListTiming(theme, ITEMS.length);
  const draw = (ms: number, highlight?: HighlightSpec) =>
    at(<FeatureList progress={0} theme={theme} aspect="16:9" items={ITEMS} highlight={highlight} />, ms);

  it("rises each row 80 px from below and from scale 0.94, 90 ms apart", () => {
    for (const [i, [start, end]] of timing.entries()) {
      const before = stylesOf(draw(start), "data-feature=")[i]!;
      expect(riseOf(before)).toBe(lift.risePx);
      expect(scaleOf(before)).toBe(lift.fromScale);
      expect(transformOf(stylesOf(draw(end), "data-feature=")[i]!)).toBe("translateY(0px) scale(1)");
    }
  });

  it("fills the active row's icon chip with the accent and pops it", () => {
    const landed = timing.at(-1)![1];
    const html = draw(landed + pop.ms, 2);
    const chips = stylesOf(html, "data-feature-icon").map((c) => c.get("background-color"));
    expect(chips[2]).toBe(theme.colors.accent);
    expect(chips[0]).toMatch(/^rgba\(/);
    expect(stylesOf(html, "data-row-face").map(scaleOf)).toEqual([1, 1, pop.scale]);
    expect(items(draw(landed + 200, 2), "data-feature=").map((row) => row.includes("data-shine"))).toEqual([false, false, true]);
  });
});

describe("windows shine once as they land", () => {
  const land = leadMs + enter.ms;
  const windows = {
    AppWindow: <AppWindow progress={0} theme={theme} aspect="16:9" title="Plan" />,
    BrowserWindow: <BrowserWindow progress={0} theme={theme} aspect="9:16" url="https://example.com" />,
  };

  it.each(Object.entries(windows))("%s", (_, element) => {
    expect(at(element, land - 1)).not.toContain("data-shine");
    const html = at(element, land + shine.ms / 2);
    expect(html).toMatch(/data-window="[a-z]+"[\s\S]*data-shine=""[^>]*border-radius:28px/);
    expect(at(element, land + shine.ms)).not.toContain("data-shine");
    expect(at(element, 9000)).not.toContain("data-shine");
  });
});
