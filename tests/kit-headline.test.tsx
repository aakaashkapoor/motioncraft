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
  frameSize,
  Headline,
  SceneClockContext,
  Section,
  TitleCard,
  accentInk,
  contentArea,
  contrastRatio,
  curveEasing,
  darkTheme,
  evenWordTimes,
  headlineBox,
  headlineTiming,
  kit,
  lightTheme,
  mixColors,
  neutralTheme,
  resolveCue,
  safeZones,
  SceneWordsContext,
  sectionLayout,
  sectionTiming,
  validateStoryboard,
  type Aspect,
  type Rect,
  type Theme,
} from "../src/index";
import { headlineLineWarnings } from "../src/checks/headlineLines";
import { headlineLinesErrors, lineStarts } from "../src/kit/headlineLines";

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
    const mid = frameSize(aspect).width / 2;
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

describe("lines: each line enters on its own cue", () => {
  const NARRATION = "Dinner was one eighty four. Four friends. Who owes what?";
  const SPOKEN = evenWordTimes(NARRATION, 300, 4200);
  const LINES = [
    { text: "Dinner was $184.", at: { word: "Dinner" } },
    { text: "Four friends.", at: { word: "Four friends" } },
    { text: "Who owes what?", at: { word: "Who" } },
  ];
  const cues = LINES.map((line) => resolveCue(line.at, SPOKEN));
  /** Drawn in a scene that speaks NARRATION. */
  const heard = (ms: number, element: ReactElement) => at(ms, <SceneWordsContext.Provider value={SPOKEN}>{element}</SceneWordsContext.Provider>);
  const lined = (props: Record<string, unknown> = {}, aspect: Aspect = "9:16") => <Headline progress={0} theme={theme} aspect={aspect} lines={LINES} {...props} />;
  const card = (props: Record<string, unknown> = {}, aspect: Aspect = "9:16") => <TitleCard progress={0} theme={theme} aspect={aspect} lines={LINES} {...props} />;
  const lineOpacities = (html: string) => marked(html, "data-headline-line").map((l) => l.opacity);
  const rows = (html: string) => html.split("data-headline-row=").slice(1);
  /** The markup without what moves: what is left is the layout. */
  const still = (html: string) => html.replace(/(opacity|transform|filter):[^;"]*;?/g, "");

  it("the cues are in order and apart", () => {
    expect(cues[0]).toBeLessThan(cues[1]!);
    expect(cues[1]).toBeLessThan(cues[2]!);
  });

  it.each(["whole", "words", "chars"] as const)("Headline (%s): each line is invisible before its cue and visible after", (motion) => {
    const shown = (row: string) => {
      const poses = motion === "whole" ? marked(row, "data-headline-line") : motion === "words" ? words(row) : chars(row);
      return Math.max(...poses.map((p) => p.opacity));
    };
    for (let i = 0; i < LINES.length; i++) {
      const before = rows(heard(cues[i]!, lined({ motion })));
      const after = rows(heard(cues[i]! + 150, lined({ motion })));
      // Every line is there from the start, so the block never reflows.
      expect(before).toHaveLength(LINES.length);
      expect(shown(before[i]!), `line ${i} at its cue`).toBe(0);
      expect(shown(after[i]!), `line ${i} after its cue`).toBeGreaterThan(0);
      for (let later = i + 1; later < LINES.length; later++) expect(shown(after[later]!), `line ${later} while ${i} enters`).toBe(0);
      // Lines already shown stay put.
      for (let earlier = 0; earlier < i; earlier++) expect(shown(before[earlier]!), `line ${earlier} when ${i} enters`).toBe(1);
    }
  });

  it.each(ASPECTS)("Headline: the block's layout is identical on every frame (%s)", (aspect) => {
    const frames = [0, cues[0]!, cues[1]! - 1, cues[1]! + 100, cues[2]! + 100, 3000].map((ms) => still(heard(ms, lined({ motion: "words" }, aspect))));
    for (const frame of frames) expect(frame).toBe(frames[0]);
  });

  it.each(ASPECTS)("Headline: centers the stacked lines, one block per line (%s)", (aspect) => {
    const html = heard(4000, lined({}, aspect));
    const root = boxOf(parseStyle(/^<div[^>]*?style="([^"]*)"/.exec(html)![1]!));
    const mid = frameSize(aspect).width / 2;
    expect(Math.abs(root.x + root.width / 2 - mid)).toBeLessThanOrEqual(1);
    // Placed as a single headline is: on the optical center, kept inside the content area.
    const { box, step } = headlineBox(theme, aspect, LINES.map((l) => l.text));
    expect(root).toEqual(box);
    const area = contentArea(theme, aspect);
    expect(root.y).toBeGreaterThanOrEqual(area.y);
    expect(root.y + root.height).toBeLessThanOrEqual(area.y + area.height);
    expect(html).toContain('data-block="Headline"');
    expect(html).toMatch(/<h1 [^>]*text-align:center/);
    expect([...html.matchAll(/data-headline-row="\d"[^>]*style="display:block/g)]).toHaveLength(3);
    expect(lineOpacities(html)).toEqual([1, 1, 1]);
    // The box is tall enough for each line on its own.
    const spec = theme.type[step][aspect];
    expect(box.height).toBeGreaterThanOrEqual(3 * spec.size * spec.lineHeight);
  });

  it("a line without `at` follows the line before by the theme's line stagger", () => {
    const { lineStaggerMs } = textIn;
    const texts = LINES.map((l) => l.text);
    expect(lineStarts(theme, texts, [undefined, 1200, undefined], leadMs, "whole")).toEqual([leadMs, 1200, 1200 + lineStaggerMs]);
    // In words motion it follows the last word of the line before.
    const lastWord = headlineTiming(theme, ["Four", "friends."], 1200, "words").words.at(-1)!;
    expect(lineStarts(theme, texts, [undefined, 1200, undefined], leadMs, "words")[2]).toBe(lastWord + lineStaggerMs);
    // Drawn alone (no scene words), word cues fall back to that and the lines still build.
    const alone = at(leadMs + lineStaggerMs - 1, lined());
    expect(lineOpacities(alone)[0]).toBeGreaterThan(0);
    expect(lineOpacities(alone)[1]).toBe(0);
  });

  it("in a settled opening the first line is landed at frame 0 and the cued lines still build on their words", () => {
    const settled = (ms: number, element: ReactElement) =>
      renderToStaticMarkup(
        <SceneClockContext.Provider value={{ fps: 1000, frame: ms, frames: 5000, settled: true }}>
          <SceneWordsContext.Provider value={SPOKEN}>{element}</SceneWordsContext.Provider>
        </SceneClockContext.Provider>,
      );
    expect(lineOpacities(settled(0, lined()))).toEqual([1, 0, 0]);
    expect(lineOpacities(settled(cues[1]! + 150, lined()))[1]).toBeGreaterThan(0);
    expect(lineOpacities(settled(cues[1]! + 150, lined()))[2]).toBe(0);
    // The subtitle waits for the last line, too.
    const subtitled = (ms: number) => settled(ms, card({ subtitle: "Split it fairly" }));
    const subtitleOpacity = (html: string) => parseFloat(parseStyle(/<p [^>]*?style="([^"]*)"[^>]*>Split it fairly/.exec(html)![1]!).get("opacity") ?? "1");
    expect(lineOpacities(subtitled(0))).toEqual([1, 0, 0]);
    expect(subtitleOpacity(subtitled(0))).toBe(0);
    expect(subtitleOpacity(subtitled(4000))).toBe(1);
    // Lines with no cue after the first are entrances like any other: all landed.
    expect(lineOpacities(settled(0, lined({ lines: LINES.map(({ text }) => ({ text })) })))).toEqual([1, 1, 1]);
  });

  it("rejects cues that resolve out of order when drawn", () => {
    const swapped = [LINES[1]!, LINES[0]!, LINES[2]!];
    expect(() => heard(1000, <Headline progress={0} theme={theme} aspect="9:16" lines={swapped} />)).toThrow(/order/);
  });

  it("emphasis sets one line in the accent; mark sweeps under a word of its line", () => {
    const html = heard(4000, lined({ emphasis: 2, mark: "friends" }));
    const colors = [...html.matchAll(/data-headline-row="(\d)"[^>]*?style="([^"]*)"/g)].map((m) => parseStyle(m[2]!).get("color"));
    expect(colors).toEqual([undefined, undefined, accentInk(theme)]);
    expect(rows(html)[1]).toContain("data-headline-mark");
    expect(html.split("data-headline-mark")).toHaveLength(2);
    expect(() => heard(4000, lined({ mark: "pizza" }))).toThrow(/"pizza" is not a word of/);
  });

  it("TitleCard: each line is invisible before its cue and visible after, the subtitle after the last", () => {
    for (let i = 0; i < LINES.length; i++) {
      expect(lineOpacities(heard(cues[i]!, card()))[i]).toBe(0);
      expect(lineOpacities(heard(cues[i]! + 150, card()))[i]).toBeGreaterThan(0);
    }
    const opacityOf = (html: string) => parseFloat(parseStyle(/<p [^>]*?style="([^"]*)"[^>]*>Split it fairly/.exec(html)![1]!).get("opacity") ?? "1");
    const subtitleStart = cues[2]! + textIn.lineStaggerMs;
    expect(opacityOf(heard(subtitleStart, card({ subtitle: "Split it fairly" })))).toBe(0);
    expect(opacityOf(heard(subtitleStart + 10, card({ subtitle: "Split it fairly" })))).toBeGreaterThan(0);
  });

  it.each(ASPECTS)("TitleCard: the layout is identical on every frame (%s)", (aspect) => {
    const frames = [0, cues[0]!, cues[1]! + 100, cues[2]! + 100, 3000].map((ms) => still(heard(ms, card({ kicker: "Group dinner", titleMotion: "words" }, aspect))));
    for (const frame of frames) expect(frame).toBe(frames[0]);
  });

  describe("validation", () => {
    const board = (component: string, props: Record<string, unknown>, narration: string | undefined) => ({
      title: "Lines",
      aspect: "9:16",
      scenes: [{ id: "hook", component, props, ...(narration === undefined ? { durationMs: 4000 } : { narration }) }],
    });
    const errorsOf = (component: string, props: Record<string, unknown>) => {
      const result = validateStoryboard(board(component, props, NARRATION));
      return result.ok ? "" : result.errors.join("\n");
    };

    it("accepts good lines on Headline and TitleCard, nested too", () => {
      expect(errorsOf("Headline", { lines: LINES, emphasis: 0, motion: "words" })).toBe("");
      expect(errorsOf("TitleCard", { lines: LINES, subtitle: "Split it fairly" })).toBe("");
      expect(errorsOf("Headline", { lines: [{ text: "One" }, { text: "Two", at: 900 }] })).toBe("");
      expect(errorsOf("Section", { headline: "Hook", content: { component: "Headline", props: { lines: LINES } } })).toBe("");
    });

    it.each([
      ["Headline", { lines: LINES, text: "Dinner" }, /lines and text: give one/],
      ["TitleCard", { lines: LINES, title: "Dinner" }, /lines and title: give one/],
      ["Headline", { lines: [LINES[2], LINES[0], LINES[1]] }, /lines\[1\]\.at .* is before lines\[0\]\.at/],
      ["Headline", { lines: [{ text: "One", at: 1500 }, { text: "Two", at: 900 }] }, /lines\[1\]\.at .* is before lines\[0\]\.at/],
      ["Headline", { lines: [{ text: "One", at: { word: "Who" } }, { text: "Two", at: { word: "Who", offsetMs: -50 } }] }, /order/],
      ["Headline", { lines: [LINES[0]] }, /2 to 4 lines/],
      ["Headline", { lines: [...LINES, ...LINES] }, /2 to 4 lines/],
      ["Headline", { lines: "Dinner" }, /2 to 4 lines/],
      ["Headline", { lines: [{ text: " " }, { text: "Two" }] }, /lines\[0\]\.text must be/],
      ["Headline", { lines: [{ text: "One", size: 3 }, { text: "Two" }] }, /lines\[0\]: unknown field "size"/],
      ["Headline", { lines: [{ text: "One", at: { word: "sushi" } }, { text: "Two" }] }, /lines\[0\]\.at: word "sushi" is not in this scene's narration/],
      ["Headline", { lines: LINES, emphasis: 3 }, /emphasis .* line index from 0 to 2/],
      ["Headline", { lines: LINES, emphasis: "Dinner" }, /emphasis .* line index/],
      ["Headline", { text: "Dinner", emphasis: 1 }, /emphasis as a line index needs lines/],
      ["TitleCard", { lines: [LINES[1], LINES[0]] }, /before/],
      ["Section", { headline: "Hook", content: { component: "Headline", props: { lines: [LINES[1], LINES[0]] } } }, /Headline: lines\[1\]\.at .* is before/],
    ] as const)("%s %j fails", (component, props, message) => {
      expect(errorsOf(component, props as Record<string, unknown>)).toMatch(message);
    });

    it("needs narration for a word cue", () => {
      expect(validateStoryboard(board("Headline", { lines: LINES }, undefined)).ok).toBe(false);
    });

    it("headlineLinesErrors is the components' own prop check", () => {
      expect(headlineLinesErrors({ lines: LINES }, "text", NARRATION)).toEqual([]);
      expect(headlineLinesErrors({ text: "Plain" }, "text", undefined)).toEqual([]);
      expect(headlineLinesErrors({ title: "Plain", lines: LINES }, "title", NARRATION)).toEqual(["lines and title: give one, not both"]);
    });
  });

  describe("layer-1: a line cued too late to land", () => {
    const storyboard = (lines: unknown, durationMs: number) => {
      const result = validateStoryboard({ title: "Lines", aspect: "9:16", scenes: [{ id: "hook", component: "Headline", props: { lines }, narration: NARRATION, durationMs }] });
      if (!result.ok) throw new Error(result.errors.join("\n"));
      return result.storyboard;
    };

    it("warns when a line would not land before the scene starts to leave", () => {
      const late = [{ text: "Dinner was $184." }, { text: "Four friends.", at: 3900 }];
      expect(headlineLineWarnings(storyboard(late, 4000), theme, { hook: 4000 }, {})).toEqual([expect.stringMatching(/^warn \[headline-lines\] scene "hook": Headline lines\[1\] starts at 3900 ms/)]);
      expect(headlineLineWarnings(storyboard(late, 6000), theme, { hook: 6000 }, {})).toEqual([]);
      // Word cues land on the scene's words: the narration's even estimate here.
      expect(headlineLineWarnings(storyboard(LINES, 4500), theme, { hook: 4500 }, {})).toEqual([]);
    });
  });
});
