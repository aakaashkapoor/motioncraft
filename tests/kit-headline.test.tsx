// Design v3, life #3 (kinetic headline) and #6 (marker sweep): `Headline` and
// the `HeadlineText` it shares with Section, SceneFrame and TitleCard. Lands
// as a whole by default; `words` rise one by one through a clipped line,
// `chars` one character at a time; words leave upward. One or two words may
// be set in the accent, and one word may be marked by a bar that sweeps in
// after the text has landed.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  Headline,
  SceneClockContext,
  Section,
  TitleCard,
  accentInk,
  contrastRatio,
  curveEasing,
  darkTheme,
  headlineBox,
  headlineTiming,
  kit,
  lightTheme,
  mixColors,
  neutralTheme,
  safeZones,
  sectionLayout,
  sectionTiming,
  type Aspect,
  type Rect,
  type Theme,
} from "../src/index";

const theme = lightTheme;
const textIn = theme.motion["text.in"];
const textOut = theme.motion["text.out"];
const { leadMs, mark } = theme.motion;

/** A scene clock at 1000 fps, so a frame is a millisecond: draws `element` exactly `ms` into a scene `sceneMs` long. */
function at(ms: number, element: ReactElement, sceneMs = 5000): string {
  return renderToStaticMarkup(<SceneClockContext.Provider value={{ fps: 1000, frame: ms, frames: sceneMs }}>{element}</SceneClockContext.Provider>);
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

const boxOf = (style: Map<string, string>): Rect => {
  const num = (key: string) => parseFloat(style.get(key) ?? "NaN");
  return { x: num("left"), y: num("top"), width: num("width"), height: num("height") };
};

interface Pose {
  y: number;
  opacity: number;
  blur: number;
  scaleY: number;
  color?: string;
  text: string;
}

function pose(style: Map<string, string>, text: string): Pose {
  const transform = style.get("transform") ?? "";
  const filter = style.get("filter") ?? "";
  return {
    y: parseFloat(/translateY\((-?[\d.]+)px\)/.exec(transform)?.[1] ?? "0"),
    scaleY: parseFloat(/scaleY\(([\d.]+)\)/.exec(transform)?.[1] ?? "1"),
    opacity: parseFloat(style.get("opacity") ?? "1"),
    blur: parseFloat(/blur\(([\d.]+)px\)/.exec(filter)?.[1] ?? "0"),
    color: style.get("color"),
    text: text.replace(/<[^>]+>/g, ""),
  };
}

/** Each element carrying `attr`, in document order, with its style and text. */
function marked(html: string, attr: string): Pose[] {
  return [...html.matchAll(new RegExp(`<(\\w+)[^>]*? ${attr}(?:="[^"]*")?[^>]*?style="([^"]*)"[^>]*>`, "g"))].map((m) => {
    const from = m.index + m[0].length;
    return pose(parseStyle(m[2]!), html.slice(from, html.indexOf(`</${m[1]}>`, from)));
  });
}

const words = (html: string) => marked(html, "data-headline-word");
const chars = (html: string) => marked(html, "data-headline-char");

function markStyle(html: string): Map<string, string> {
  const m = /data-headline-mark="[^"]*"[^>]*?style="([^"]*)"/.exec(html);
  if (m?.[1] === undefined) throw new Error(`no mark in ${html}`);
  return parseStyle(m[1]);
}

const sweepOf = (html: string) => parseFloat(/scaleX\(([\d.]+)\)/.exec(markStyle(html).get("transform") ?? "")![1]!);

const TEXT = "Ship videos without an editor";
const WORDS = TEXT.split(" ");
/** A Headline set in the `headline` step, which this text fits at in both aspects. */
const headline = (props: Record<string, unknown> = {}, aspect: Aspect = "9:16") => (
  <Headline progress={0} theme={theme} aspect={aspect} text={TEXT} role="headline" {...props} />
);
const lineHeight = (aspect: Aspect = "9:16") => {
  const spec = theme.type.headline[aspect];
  return Math.round(spec.size * spec.lineHeight * 100) / 100;
};

describe("headlineTiming", () => {
  it("words: each word starts text.in's stagger after the one before", () => {
    const timing = headlineTiming(theme, WORDS, 200, "words");
    expect(timing.words).toEqual(WORDS.map((_, i) => 200 + i * textIn.staggerMs));
    expect(textIn).toMatchObject({ ms: 550, curve: "expoOut", staggerMs: 55 });
    // Landed once the last word's rise is over.
    expect(timing.landed).toBe(200 + (WORDS.length - 1) * textIn.staggerMs + textIn.ms);
  });

  it("whole (the default): every word starts with the line", () => {
    const timing = headlineTiming(theme, WORDS, 200);
    expect(timing.words).toEqual(WORDS.map(() => 200));
    expect(timing.landed).toBe(200 + textIn.ms);
  });

  it("chars: characters rise text.char's 24 ms apart, straight across the words", () => {
    expect(theme.motion["text.char"]).toEqual({ ms: 550, curve: "expoOut", staggerMs: 24 });
    const timing = headlineTiming(theme, ["Go", "now"], 100, "chars");
    expect(timing.chars).toEqual([
      [100, 124],
      [148, 172, 196],
    ]);
    expect(timing.words).toEqual([100, 148]);
    expect(timing.landed).toBe(196 + theme.motion["text.char"].ms);
  });

  it("squeezes the stagger of a long headline so it lands in about the first 1.2 s", () => {
    const long = Array.from({ length: 30 }, (_, i) => `word${i}`);
    expect(headlineTiming(theme, long, leadMs, "words").landed).toBeLessThanOrEqual(theme.motion.cascadeMs);
    expect(headlineTiming(theme, long, leadMs, "chars").landed).toBeLessThanOrEqual(theme.motion.cascadeMs);
  });

  it("starts the marker mark.delayMs (400-600 ms) after the headline lands", () => {
    expect(mark.delayMs).toBeGreaterThanOrEqual(400);
    expect(mark.delayMs).toBeLessThanOrEqual(600);
    for (const motion of ["whole", "words", "chars"] as const) {
      const timing = headlineTiming(theme, WORDS, 220, motion);
      expect(timing.mark - timing.landed).toBe(mark.delayMs);
    }
  });
});

describe("Headline: words", () => {
  const L = lineHeight();

  it("each word rises a line (y 100% -> 0) through a clipped line, its blur clearing and opacity 0 -> 1, on text.in", () => {
    const start = words(at(leadMs, headline({ motion: "words" })));
    expect(start.map((w) => w.text)).toEqual(WORDS);
    for (const w of start) expect(w).toMatchObject({ y: L, blur: 8, opacity: 0 });

    const mid = words(at(leadMs + 60, headline({ motion: "words" })))[0]!;
    const ease = curveEasing(textIn.curve)(60 / textIn.ms);
    expect(mid.y).toBeCloseTo((1 - ease) * L, 1);
    expect(mid.blur).toBeCloseTo((1 - ease) * 8, 1);
    expect(mid.opacity).toBeCloseTo(ease, 2);

    const landed = words(at(headlineTiming(theme, WORDS, leadMs, "words").landed, headline({ motion: "words" })));
    for (const w of landed) expect(w).toMatchObject({ y: 0, blur: 0, opacity: 1 });

    // The line clips the rising words: one clip per word, hiding what is below the line.
    const html = at(leadMs, headline({ motion: "words" }));
    const clips = [...html.matchAll(/data-headline-clip=""[^>]*?style="([^"]*)"/g)].map((m) => parseStyle(m[1]!));
    expect(clips).toHaveLength(WORDS.length);
    for (const clip of clips) expect(clip.get("overflow")).toBe("hidden");
  });

  it("starts each word 55 ms after the one before", () => {
    const timing = headlineTiming(theme, WORDS, leadMs, "words");
    for (let i = 1; i < WORDS.length; i++) {
      const shown = words(at(timing.words[i]!, headline({ motion: "words" })));
      expect(shown[i]!.opacity, `word ${i} at its start`).toBe(0);
      expect(shown[i - 1]!.opacity, `word ${i - 1} ${textIn.staggerMs} ms in`).toBeGreaterThan(0);
      expect(words(at(timing.words[i]! + 1, headline({ motion: "words" })))[i]!.opacity).toBeGreaterThan(0);
    }
  });

  it("leaves upward: words go up 40% and fade on text.out, 20 ms apart, gone on the last frame", () => {
    const sceneMs = 5000;
    const last = sceneMs - 1;
    const exitTotal = textOut.ms + (WORDS.length - 1) * textOut.staggerMs;
    const before = words(at(last - exitTotal, headline({ motion: "words" }), sceneMs));
    for (const w of before) expect(w).toMatchObject({ y: 0, opacity: 1 });

    const leaving = words(at(last - exitTotal + 2 * textOut.staggerMs + 50, headline({ motion: "words" }), sceneMs));
    // In reading order: the first word is further along than the last.
    expect(leaving[0]!.opacity).toBeLessThan(leaving.at(-1)!.opacity);
    expect(leaving[0]!.y).toBeLessThan(0);

    const gone = words(at(last, headline({ motion: "words" }), sceneMs));
    for (const w of gone) {
      expect(w.opacity).toBe(0);
      expect(w.y).toBeCloseTo(-0.4 * L, 1);
    }
  });
});

describe("Headline: chars and whole", () => {
  const L = lineHeight();

  it("chars: each character rises 60% of the line with scaleY 1.45 -> 1, one after another", () => {
    const start = chars(at(leadMs, headline({ motion: "chars" })));
    expect(start.map((c) => c.text).join("")).toBe(WORDS.join(""));
    expect(start[0]).toMatchObject({ y: Math.round(0.6 * L * 100) / 100, scaleY: 1.45, opacity: 0 });
    // 25 characters at 24 ms would land late, so they step a little tighter.
    const timing = headlineTiming(theme, WORDS, leadMs, "chars");
    const second = timing.chars[0]![1]!;
    expect(second - leadMs).toBeLessThanOrEqual(theme.motion["text.char"].staggerMs);
    const later = chars(at(second, headline({ motion: "chars" })));
    expect(later[0]!.opacity).toBeGreaterThan(0);
    expect(later[1]!.opacity).toBe(0);
    const landed = chars(at(timing.landed, headline({ motion: "chars" })));
    for (const c of landed) expect(c).toMatchObject({ y: 0, scaleY: 1, opacity: 1 });
  });

  it("whole: the line lands as one, with a short rise and a fade on text.in", () => {
    const html = at(leadMs, headline());
    const lines = marked(html, "data-headline-line");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.opacity).toBe(0);
    expect(lines[0]!.y).toBeGreaterThan(0);
    expect(lines[0]!.y).toBeLessThan(L);
    // Words do not move on their own.
    for (const w of words(html)) expect(w).toMatchObject({ y: 0, opacity: 1 });
    const landed = marked(at(leadMs + textIn.ms, headline()), "data-headline-line")[0]!;
    expect(landed).toMatchObject({ y: 0, opacity: 1 });
    // And leaves the same way, upward.
    const gone = marked(at(4999, headline()), "data-headline-line")[0]!;
    expect(gone.opacity).toBe(0);
    expect(gone.y).toBeLessThan(0);
  });
});

describe("emphasis", () => {
  it("sets one or two words in the accent, matched without case or punctuation", () => {
    const accented = (html: string) => words(html).filter((w) => w.color === accentInk(theme)).map((w) => w.text);
    const html = at(2000, <Headline progress={0} theme={theme} aspect="9:16" text="Videos from a prompt." emphasis={["videos", "PROMPT"]} />);
    expect(accented(html)).toEqual(["Videos", "prompt."]);
    // The rest of a whole line stays plain text.
    expect(html).toContain(" from a ");
    // A phrase is its words; in words motion every word has its own element.
    const phrase = at(2000, <Headline progress={0} theme={theme} aspect="9:16" text="Videos from a prompt" emphasis="a prompt" motion="words" />);
    expect(words(phrase).map((w) => w.color)).toEqual([undefined, undefined, accentInk(theme), accentInk(theme)]);
  });

  it("rejects more than two words, or a word that is not in the headline", () => {
    expect(() => at(0, <Headline progress={0} theme={theme} aspect="9:16" text="One two three" emphasis="One two three" />)).toThrow(/one or two words/);
    expect(() => at(0, <Headline progress={0} theme={theme} aspect="9:16" text="One two three" emphasis="four" />)).toThrow(/"four" is not a word of/);
  });
});

describe("mark", () => {
  const marking = (props: Record<string, unknown> = {}) => headline({ motion: "words", mark: "editor", ...props });
  const timing = headlineTiming(theme, WORDS, leadMs, "words");

  it("sweeps a bar in from the left on the mark token, starting mark.delayMs after the text lands", () => {
    expect(sweepOf(at(timing.landed, marking()))).toBe(0);
    expect(sweepOf(at(timing.mark, marking()))).toBe(0);
    const half = sweepOf(at(timing.mark + mark.ms / 2, marking()));
    expect(half).toBeCloseTo(curveEasing(mark.curve)(0.5), 2);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    expect(sweepOf(at(timing.mark + mark.ms, marking()))).toBe(1);
  });

  it("is an accent bar behind the word, tilted -1.5 deg at 55% opacity", () => {
    expect(mark).toMatchObject({ ms: 450, curve: [0.33, 1, 0.68, 1], tiltDeg: 1.5, opacity: 0.55 });
    const html = at(timing.mark + mark.ms, marking());
    const style = markStyle(html);
    expect(style.get("transform-origin")).toBe("left center");
    expect(style.get("transform")).toContain("rotate(-1.5deg)");
    expect(style.get("background-color")).toBe("rgba(251, 90, 31, 0.55)");
    expect(style.get("position")).toBe("absolute");
    // Drawn under its word: the bar comes before the word in the same slot.
    expect(html.indexOf("data-headline-mark")).toBeLessThan(html.indexOf(">editor<"));
    expect(html.indexOf("data-headline-mark")).toBeGreaterThan(html.indexOf(">an<"));
  });

  it("or an underline of the accent, 6-8 px, at full strength", () => {
    expect(mark.underlinePx).toBeGreaterThanOrEqual(6);
    expect(mark.underlinePx).toBeLessThanOrEqual(8);
    const style = markStyle(at(timing.mark + mark.ms, marking({ markStyle: "underline" })));
    expect(style.get("height")).toBe(`${mark.underlinePx}px`);
    expect(style.get("background-color")).toBe(theme.colors.accent);
  });

  it("marks one word that is in the headline and not emphasized", () => {
    expect(() => at(0, marking({ mark: "an editor" }))).toThrow(/one word/);
    expect(() => at(0, marking({ mark: "camera" }))).toThrow(/"camera" is not a word of/);
    expect(() => at(0, marking({ emphasis: "editor" }))).toThrow(/emphasi/);
  });

  it("keeps the marked word readable on its bar in every built-in theme", () => {
    for (const t of [lightTheme, darkTheme, neutralTheme] as Theme[]) {
      const bar = mixColors(t.colors.ground, t.colors.accent, t.motion.mark.opacity);
      expect(contrastRatio(t.colors.text, bar), t.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("marks in whole mode too, once the line has landed", () => {
    const whole = headlineTiming(theme, WORDS, leadMs);
    const draw = (ms: number) => at(ms, headline({ mark: "editor" }));
    expect(sweepOf(draw(whole.mark))).toBe(0);
    expect(sweepOf(draw(whole.mark + mark.ms))).toBe(1);
  });
});

describe("Headline as a kit component", () => {
  it("is registered in the kit", () => {
    expect(kit.Headline).toBe(Headline);
  });

  it.each(ASPECTS)("centers on the frame and its optical center, no wider than the text column (%s)", (aspect) => {
    const html = at(2000, <Headline progress={0} theme={theme} aspect={aspect} text="Videos from a prompt" />);
    const root = boxOf(parseStyle(/^<div[^>]*?style="([^"]*)"/.exec(html)![1]!));
    const mid = aspect === "9:16" ? 540 : 960;
    expect(Math.abs(root.x + root.width / 2 - mid)).toBeLessThanOrEqual(1);
    expect(Math.abs(root.y + root.height / 2 - safeZones(aspect).opticalCenter)).toBeLessThanOrEqual(1);
    expect(html).toContain('data-block="Headline"');
    expect(html).toMatch(/<h1 [^>]*text-align:center/);
    expect(html).toMatch(/<h1 [^>]*text-wrap:balance/);
  });

  it("starts at the hero step and steps down the ramp until it fits", () => {
    expect(headlineBox(theme, "9:16", "Hook").step).toBe("hero");
    const long = Array.from({ length: 8 }, () => "Ship videos without an editor").join(" ");
    expect(headlineBox(theme, "9:16", long).step).not.toBe("hero");
    const html = at(2000, <Headline progress={0} theme={theme} aspect="9:16" text="Hook" />);
    expect(html).toMatch(new RegExp(`<h1 [^>]*font-size:${theme.type.hero["9:16"].size}px`));
  });

  it.each(ASPECTS)("works inside a Section slot (%s)", (aspect) => {
    const props = { eyebrow: "The hook", headline: "Say it big", content: { component: "Headline", props: { text: "Videos from a prompt", motion: "words", mark: "prompt" } } };
    const layout = sectionLayout(theme, aspect, props);
    const section = (ms: number) => at(ms, <Section progress={0} theme={theme} aspect={aspect} {...props} />);
    const html = section(3000);
    const nested = /data-section-part="content"[^>]*><div[^>]*?style="([^"]*)"/.exec(html)!;
    const root = boxOf(parseStyle(nested[1]!));
    const slot = layout.content;
    expect(root.x).toBeGreaterThanOrEqual(slot.x - 0.5);
    expect(root.y).toBeGreaterThanOrEqual(slot.y - 0.5);
    expect(root.x + root.width).toBeLessThanOrEqual(slot.x + slot.width + 0.5);
    expect(root.y + root.height).toBeLessThanOrEqual(slot.y + slot.height + 0.5);
    expect(Math.abs(root.x + root.width / 2 - (slot.x + slot.width / 2))).toBeLessThanOrEqual(1);
    expect(html).toContain('data-block="Headline"');

    // Its words start once the Section's headline has landed, on the Section's content delay.
    const delay = sectionTiming(theme, props.headline.split(" "), { eyebrow: true, content: true }).content;
    const nestedWords = (ms: number) => words(section(ms)).slice(-4);
    expect(nestedWords(delay + leadMs).every((w) => w.opacity === 0)).toBe(true);
    expect(nestedWords(delay + leadMs + 10)[0]!.opacity).toBeGreaterThan(0);
    // And its mark sweeps in after they land.
    const nestedTiming = headlineTiming(theme, ["Videos", "from", "a", "prompt"], delay + leadMs, "words");
    expect(sweepOf(section(nestedTiming.mark))).toBe(0);
    expect(sweepOf(section(nestedTiming.mark + mark.ms))).toBe(1);
  });
});

describe("Section and TitleCard set their headline with it", () => {
  it("Section: emphasis, a mark, and the motion of its headline", () => {
    const props = { headline: "Ship without an editor", emphasis: "Ship", mark: "editor", content: { component: "Card", props: { title: "Local" } } };
    const html = at(4000, <Section progress={0} theme={theme} aspect="9:16" {...props} />);
    expect(html).toContain('data-headline-mark="bar"');
    const shown = words(html);
    expect(shown[0]!.color).toBe(accentInk(theme));
    // Section's headline rises word by word unless told to land whole.
    expect(marked(at(leadMs, <Section progress={0} theme={theme} aspect="9:16" {...props} />), "data-headline-line")).toHaveLength(0);
    expect(marked(at(leadMs, <Section progress={0} theme={theme} aspect="9:16" {...props} headlineMotion="whole" />), "data-headline-line")).toHaveLength(1);
  });

  it("TitleCard: the title lands whole by default, word by word with titleMotion", () => {
    const card = (extra: Record<string, unknown>) => <TitleCard progress={0} theme={theme} aspect="9:16" title="Videos from a prompt" {...extra} />;
    expect(marked(at(leadMs, card({})), "data-headline-line")).toHaveLength(1);
    const timing = headlineTiming(theme, ["Videos", "from", "a", "prompt"], leadMs, "words");
    const early = words(at(timing.words[2]!, card({ titleMotion: "words" })));
    expect(early[1]!.opacity).toBeGreaterThan(0);
    expect(early[2]!.opacity).toBe(0);
    const html = at(3000, card({ titleMotion: "words", emphasis: "prompt", mark: "Videos" }));
    expect(words(html)[3]!.color).toBe(accentInk(theme));
    expect(sweepOf(html)).toBe(1);
  });

  it("TitleCard: kicker, title and subtitle land one line after another", () => {
    const card = (ms: number) => at(ms, <TitleCard progress={0} theme={theme} aspect="9:16" kicker="Launch" title="Ship it" subtitle="Without the fear" />);
    const opacityOf = (html: string, text: string) => parseFloat(parseStyle(new RegExp(`<p [^>]*?style="([^"]*)"[^>]*>${text}`).exec(html)![1]!).get("opacity") ?? "1");
    const titleStart = leadMs + textIn.lineStaggerMs;
    const subtitleStart = titleStart + textIn.lineStaggerMs;
    expect(opacityOf(card(leadMs), "Launch")).toBe(0);
    expect(opacityOf(card(leadMs + 10), "Launch")).toBeGreaterThan(0);
    expect(marked(card(titleStart), "data-headline-line")[0]!.opacity).toBe(0);
    expect(marked(card(titleStart + 10), "data-headline-line")[0]!.opacity).toBeGreaterThan(0);
    expect(opacityOf(card(subtitleStart), "Without the fear")).toBe(0);
    expect(opacityOf(card(subtitleStart + 10), "Without the fear")).toBeGreaterThan(0);
  });
});
