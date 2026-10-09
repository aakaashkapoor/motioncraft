// Design v3, life #4: word-highlight captions. Narration is split into timed
// words (an even split weighted by word length until there is TTS), paged 3-6
// words at a time (1-3 in the punch style), and the word being spoken lights up
// in the accent. Each page enters with a small scale and rise.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  CAPTION_MAX_LINES,
  CAPTION_PAGE_WORDS,
  Caption,
  SceneClockContext,
  accentInk,
  activeWordAt,
  buildTimeline,
  captionBand,
  captionLimits,
  captionTrack,
  captionType,
  darkTheme,
  evenWordTimes,
  lightTheme,
  mixColors,
  neutralTheme,
  pageCaption,
  pageIndexAt,
  resolveTheme,
  timedPages,
  validateStoryboard,
  wordLight,
  type Aspect,
  type CaptionStyle,
  type Storyboard,
  type Theme,
} from "../src/index";
import { Frame } from "../src/render/page";

const words = (text: string) => text.split(/\s+/).filter(Boolean);

describe("evenWordTimes", () => {
  it("speaks the words one after another across the window, with no gaps", () => {
    const timed = evenWordTimes("We ship small changes every day.", 150, 2950);
    expect(timed.map((w) => w.text)).toEqual(["We", "ship", "small", "changes", "every", "day."]);
    expect(timed[0]!.startMs).toBe(150);
    expect(timed.at(-1)!.endMs).toBeCloseTo(2950, 6);
    for (let i = 1; i < timed.length; i++) expect(timed[i]!.startMs).toBeCloseTo(timed[i - 1]!.endMs, 6);
  });

  it("gives each word time in proportion to its length", () => {
    expect(evenWordTimes("ab cdef gh", 0, 800)).toEqual([
      { text: "ab", startMs: 0, endMs: 200 },
      { text: "cdef", startMs: 200, endMs: 600 },
      { text: "gh", startMs: 600, endMs: 800 },
    ]);
  });

  it("returns no words for empty text, and never runs backwards", () => {
    expect(evenWordTimes("  \n ", 0, 1000)).toEqual([]);
    for (const word of evenWordTimes("a b", 500, 400)) expect(word).toMatchObject({ startMs: 500, endMs: 500 });
  });
});

describe("caption pages by word count", () => {
  const standard = { maxCharsPerLine: 40, maxLines: 2, minWords: 3, maxWords: 6 };
  const punch = { maxCharsPerLine: 40, maxLines: 1, minWords: 1, maxWords: 3 };
  const counts = (text: string, limits: typeof standard) => pageCaption(text, limits).map((page) => words(page).length);
  const numbered = (n: number) => Array.from({ length: n }, (_, i) => `w${i + 1}`).join(" ");

  it("standard: balances the pages instead of leaving a stub", () => {
    expect(counts(numbered(7), standard)).toEqual([4, 3]);
    expect(counts(numbered(8), standard)).toEqual([4, 4]);
    expect(counts(numbered(13), standard)).toEqual([5, 4, 4]);
    expect(counts(numbered(30), standard)).toEqual([6, 6, 6, 6, 6]);
  });

  it.each(Array.from({ length: 38 }, (_, i) => i + 3))("standard: %i words page into 3-6 words a page, every word once", (n) => {
    const pages = pageCaption(numbered(n), standard);
    expect(pages.flatMap(words)).toEqual(words(numbered(n)));
    for (const page of pages) {
      expect(words(page).length).toBeGreaterThanOrEqual(3);
      expect(words(page).length).toBeLessThanOrEqual(6);
    }
  });

  it.each(Array.from({ length: 20 }, (_, i) => i + 1))("punch: %i words page into 1-3 words a page", (n) => {
    const pages = pageCaption(numbered(n), punch);
    expect(pages.flatMap(words)).toEqual(words(numbered(n)));
    for (const page of pages) expect(words(page).length).toBeLessThanOrEqual(3);
  });

  it("keeps short text on one page", () => {
    expect(pageCaption("Ship it.", standard)).toEqual(["Ship it."]);
  });

  it("ends a page at a sentence break when both sides keep enough words", () => {
    expect(pageCaption("We plan it. Then we render every frame.", standard)).toEqual(["We plan it.", "Then we render every frame."]);
  });

  it("balances the pages up to a sentence end rather than run a page across it", () => {
    expect(pageCaption("You write one prompt. The agent plans it.", punch)).toEqual(["You write", "one prompt.", "The agent", "plans it."]);
    expect(pageCaption("We write one short prompt. The agent plans it all.", standard)).toEqual(["We write one short prompt.", "The agent plans it all."]);
  });

  it("does not break at a sentence end that would leave a page under 3 words", () => {
    expect(pageCaption("Yes. We plan the whole video.", standard)[0]).not.toBe("Yes.");
  });

  it("still fits the line limits", () => {
    const narrow = { ...punch, maxCharsPerLine: 12 };
    for (const page of pageCaption("THE AGENT PLANS EVERY STORYBOARD FRAME FOR YOU", narrow)) {
      if (words(page).length > 1) expect(page.length).toBeLessThanOrEqual(12);
    }
  });
});

describe("the page and the word at a given ms", () => {
  const text = "You write a prompt. The agent plans a storyboard, renders it, and checks every frame.";
  const timed = evenWordTimes(text, 150, 4700);
  const pages = timedPages(timed, { maxCharsPerLine: 18, maxLines: 2, minWords: 3, maxWords: 6 });

  it("brings each page up when its first word is spoken", () => {
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]!.start).toBe(0);
    for (const page of pages) expect(page.startMs).toBe(timed[page.start]!.startMs);
    for (let i = 1; i < pages.length; i++) expect(pages[i]!.start).toBe(pages[i - 1]!.end);
    expect(pages.at(-1)!.end).toBe(timed.length);
  });

  it("shows the first page before anything is spoken and the last one after", () => {
    expect(pageIndexAt(pages, 0)).toBe(0);
    expect(pageIndexAt(pages, 60_000)).toBe(pages.length - 1);
  });

  it("at the middle of every word, shows the page holding it with that word active", () => {
    timed.forEach((word, i) => {
      const ms = (word.startMs + word.endMs) / 2;
      expect(activeWordAt(timed, ms)).toBe(i);
      const page = pages[pageIndexAt(pages, ms)]!;
      expect(i).toBeGreaterThanOrEqual(page.start);
      expect(i).toBeLessThan(page.end);
    });
  });

  it("knows exact times: three words of 2, 4 and 2 letters over 800 ms", () => {
    const three = evenWordTimes("ab cdef gh", 0, 800);
    expect([0, 199, 200, 599, 600, 799].map((ms) => activeWordAt(three, ms))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(activeWordAt(three, -1)).toBeUndefined();
    expect(activeWordAt(three, 800)).toBeUndefined();
  });
});

describe("wordLight", () => {
  const ramp = { ms: 133, curve: "linear" as const };
  const word = { text: "storyboard", startMs: 1000, endMs: 1600 };

  it("lights the word over the ramp from its start and dims it over the ramp from its end", () => {
    expect(wordLight(word, 999, ramp)).toBe(0);
    expect(wordLight(word, 1000 + 133 / 2, ramp)).toBeCloseTo(0.5, 6);
    expect(wordLight(word, 1133, ramp)).toBe(1);
    expect(wordLight(word, 1599, ramp)).toBe(1);
    expect(wordLight(word, 1600 + 133 / 2, ramp)).toBeCloseTo(0.5, 6);
    expect(wordLight(word, 1733, ramp)).toBe(0);
  });

  it("ramps over half the word when the word is shorter than two ramps", () => {
    const short = { text: "a", startMs: 0, endMs: 100 };
    expect(wordLight(short, 25, ramp)).toBeCloseTo(0.5, 6);
    expect(wordLight(short, 50, ramp)).toBe(1);
    expect(wordLight(short, 125, ramp)).toBeCloseTo(0.5, 6);
  });

  it("hands over to the next word: as one dims the next lights", () => {
    const next = { text: "renders", startMs: 1600, endMs: 2000 };
    for (const ms of [1610, 1650, 1700]) expect(wordLight(word, ms, ramp) + wordLight(next, ms, ramp)).toBeCloseTo(1, 6);
  });
});

describe("caption styles", () => {
  it.each(ASPECTS)("standard is the subtitle step at weight 700 (%s)", (aspect) => {
    const spec = captionType(lightTheme, aspect, "standard");
    expect(spec).toEqual({ ...lightTheme.type.subtitle[aspect], weight: lightTheme.weights.bold });
  });

  it.each(ASPECTS)("punch is the headline step at weight 800 (%s)", (aspect) => {
    const spec = captionType(lightTheme, aspect, "punch");
    expect(spec).toEqual({ ...lightTheme.type.headline[aspect], weight: lightTheme.weights.heavy });
    expect(spec.size).toBeGreaterThanOrEqual(88);
    expect(spec.size).toBeLessThanOrEqual(96);
  });

  it("pages 3-6 words in standard and 1-3 in punch", () => {
    expect(CAPTION_PAGE_WORDS).toEqual({ standard: { min: 3, max: 6 }, punch: { min: 1, max: 3 } });
    expect(captionLimits(lightTheme, "9:16", "standard")).toMatchObject({ minWords: 3, maxWords: 6, maxLines: 2 });
    expect(captionLimits(lightTheme, "9:16", "punch")).toMatchObject({ minWords: 1, maxWords: 3 });
  });

  it.each(ASPECTS)("fits a line of punch text, outline and rise included, in the caption band (%s)", (aspect) => {
    const spec = captionType(lightTheme, aspect, "punch");
    const { maxLines } = captionLimits(lightTheme, aspect, "punch");
    expect(maxLines).toBe(1);
    const room = captionBand(lightTheme, aspect).height - lightTheme.motion.caption.risePx;
    expect(maxLines * spec.size * spec.lineHeight + lightTheme.caption.strokePx).toBeLessThanOrEqual(room);
  });

  it.each(ASPECTS)("fits two lines of standard text in the band above the rise (%s)", (aspect) => {
    expect(captionLimits(lightTheme, aspect, "standard").maxLines).toBe(CAPTION_MAX_LINES);
  });
});

/** Caption drawn on the scene clock at `ms`, in a scene of `frames` frames at 30 fps. */
function drawAt(ms: number, text: string, opts: { theme?: Theme; aspect?: Aspect; captionStyle?: CaptionStyle; frames?: number } = {}) {
  const { theme = lightTheme, aspect = "9:16", captionStyle, frames = 301 } = opts;
  const frame = Math.round((ms * 30) / 1000);
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: 30, frame, frames }}>
      <Caption progress={frame / (frames - 1)} theme={theme} aspect={aspect} text={text} captionStyle={captionStyle} />
    </SceneClockContext.Provider>,
  );
}

interface WordSpan {
  index: number;
  text: string;
  style: string;
}

/** The caption's word spans, in order. */
function wordSpans(html: string): WordSpan[] {
  return [...html.matchAll(/<span data-caption-word="(\d+)" style="([^"]*)">([^<]*)<\/span>/g)].map(([, index, style, text]) => ({
    index: Number(index),
    style: style!,
    text: text!,
  }));
}

/** The page plate's inline style. */
const plateStyle = (html: string) => /<p data-block="Caption"[^>]*?style="([^"]*)"/.exec(html)?.[1] ?? "";

/** `translateY(...)` and `scale(...)` out of a transform. */
function transformOf(style: string): { y: number; scale: number } {
  const y = /translateY\((-?[\d.]+)px\)/.exec(style)?.[1];
  const scale = /scale\((-?[\d.]+)\)/.exec(style)?.[1];
  return { y: Number(y ?? 0), scale: Number(scale ?? 1) };
}

describe("Caption on the scene clock", () => {
  const text = "You write a prompt. The agent plans a storyboard, renders every frame, and checks the layout.";
  const endMs = (301 - 1) * (1000 / 30);
  /** The frame time in the middle of a word's fully lit stretch. */
  const litMs = (word: { startMs: number; endMs: number }) => Math.round(((word.startMs + word.endMs) / 2) * 0.03) / 0.03;

  describe.each(["standard", "punch"] as const)("%s", (style) => {
    const track = captionTrack(lightTheme, "9:16", text, style, endMs);
    const { min, max } = CAPTION_PAGE_WORDS[style];
    const { wordMs, wordScale } = lightTheme.motion.caption;
    const ramp = { ms: wordMs, curve: lightTheme.motion["fx.fast"].curve };
    // Standard sets the page in the text colour on its plate; punch in white-ish letters on a dark outline.
    const [base, accent] = style === "standard" ? [lightTheme.colors.text, accentInk(lightTheme)] : [lightTheme.colors.surface, lightTheme.colors.accent];

    it("shows the page holding the spoken word, lit in the accent and scaled up 1.04", () => {
      track.words.forEach((word, i) => {
        const ms = litMs(word);
        const spans = wordSpans(drawAt(ms, text, { captionStyle: style }));
        const page = track.pages[pageIndexAt(track.pages, ms)]!;
        expect(spans.map((s) => s.index)).toEqual(Array.from({ length: page.end - page.start }, (_, k) => page.start + k));
        expect(spans.length).toBeGreaterThanOrEqual(min);
        expect(spans.length).toBeLessThanOrEqual(max);
        expect(spans.map((s) => s.text)).toEqual(track.words.slice(page.start, page.end).map((w) => w.text));
        const light = (index: number) => wordLight(track.words[index]!, ms, ramp);
        // The spoken word is the one most lit; a word that just finished may still be dimming.
        expect(light(i)).toBeGreaterThanOrEqual(0.5);
        for (const span of spans) expect(light(span.index)).toBeLessThanOrEqual(light(i));
        for (const span of spans) {
          const l = light(span.index);
          expect(transformOf(span.style).scale, `word ${span.index} at word ${i}`).toBeCloseTo(1 + (wordScale - 1) * l, 4);
          expect(span.style).toContain(`color:${l === 1 ? accent : l === 0 ? base : mixColors(base, accent, l)}`);
        }
      });
    });

    it("lights a long word fully, alone", () => {
      const i = track.words.findIndex((w) => w.text === "storyboard,");
      const spans = wordSpans(drawAt(litMs(track.words[i]!), text, { captionStyle: style }));
      for (const span of spans) {
        expect(transformOf(span.style).scale).toBeCloseTo(span.index === i ? 1.04 : 1, 6);
        expect(span.style).toContain(`color:${span.index === i ? accent : base}`);
      }
    });

    it("enters each page from scale 0.9 and 24 px below, landing within ~170 ms", () => {
      const { fromScale, risePx, ms } = lightTheme.motion.caption;
      expect({ fromScale, risePx }).toEqual({ fromScale: 0.9, risePx: 24 });
      for (const page of track.pages.slice(1)) {
        const first = Math.ceil(page.startMs * 0.03) / 0.03;
        const entering = transformOf(plateStyle(drawAt(first, text, { captionStyle: style })));
        if (first - page.startMs < ms / 2) {
          expect(entering.scale).toBeLessThan(0.96);
          expect(entering.y).toBeGreaterThan(8);
        }
        const landed = transformOf(plateStyle(drawAt(page.startMs + ms + 34, text, { captionStyle: style })));
        expect(landed).toEqual({ y: 0, scale: 1 });
      }
    });
  });

  it("standard: sets the subtitle step at 700 on the ground plate", () => {
    const html = drawAt(2000, text);
    expect(plateStyle(html)).toContain("font-size:60px");
    expect(plateStyle(html)).toContain("font-weight:700");
    expect(plateStyle(html)).toContain(`background-color:${lightTheme.colors.ground}`);
    expect(plateStyle(html)).not.toContain("text-transform");
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
    ["neutral", neutralTheme],
  ] as const)("punch: uppercase headline at 800 with a dark outline painted under the letters (%s)", (_, theme) => {
    const html = drawAt(2000, text, { theme, captionStyle: "punch" });
    const style = plateStyle(html);
    expect(style).toContain(`font-size:${theme.type.headline["9:16"].size}px`);
    expect(style).toContain("font-weight:800");
    expect(style).toContain("text-transform:uppercase");
    expect(style).toContain("paint-order:stroke fill");
    const stroke = new RegExp(`-webkit-text-stroke:${theme.caption.strokePx}px (#[0-9a-f]{6})`).exec(style)?.[1];
    expect(stroke).toBeDefined();
    // Dark: the darkest of the theme's text and ground colors.
    expect([theme.colors.text, theme.colors.ground]).toContain(stroke);
    expect(style).not.toContain("background-color");
  });

  it("puts a rounded accent plate behind the spoken word when the theme asks, without moving any word", () => {
    const theme: Theme = { ...lightTheme, caption: { ...lightTheme.caption, highlight: "plate" } };
    const track = captionTrack(theme, "9:16", text, "standard", endMs);
    const word = track.words[4]!;
    const spans = wordSpans(drawAt(litMs(word), text, { theme }));
    const { platePadY: y, platePadX: x } = theme.caption;
    for (const span of spans) {
      // Every word carries the padding, offset by a negative margin, so lines never reflow.
      expect(span.style).toContain(`padding:${y}px ${x}px`);
      expect(span.style).toContain(`margin:-${y}px -${x}px`);
      expect(span.style).toContain(`border-radius:${theme.radius.sm}px`);
      expect(span.style.includes(`background-color:${theme.colors.accent}`)).toBe(span.index === 4);
    }
    expect(spans.find((s) => s.index === 4)!.style).toContain(`color:${theme.colors.accentText}`);
    // The plate reaches past the word; the spaces widen so it never touches the next word.
    const spacing = Number(/word-spacing:([\d.]+)px/.exec(plateStyle(drawAt(litMs(word), text, { theme })))?.[1]);
    const plain = Number(/word-spacing:([\d.]+)px/.exec(plateStyle(drawAt(litMs(word), text)))?.[1]);
    expect(spacing).toBeCloseTo(plain + x, 6);
  });

  it("draws nothing when captions are off", () => {
    expect(drawAt(2000, text, { captionStyle: "off" })).toBe("");
  });

  it.each(ASPECTS)("keeps the page in the caption band (%s)", (aspect) => {
    for (const style of ["standard", "punch"] as const) {
      const html = drawAt(2000, text, { aspect, captionStyle: style });
      const band = captionBand(lightTheme, aspect);
      expect(html).toContain(`left:${band.x}px;top:${band.y}px;width:${band.width}px;height:${band.height}px`);
    }
  });

  it.each(ASPECTS)("rests a page a rise above the band's bottom, so it enters inside the band (%s)", (aspect) => {
    const band = captionBand(lightTheme, aspect);
    const { risePx } = lightTheme.motion.caption;
    const spec = lightTheme.type.subtitle[aspect];
    expect(band.height).toBeGreaterThanOrEqual(CAPTION_MAX_LINES * spec.size * spec.lineHeight + 2 * lightTheme.spacing.xs + risePx);
    for (const style of ["standard", "punch"] as const) {
      expect(drawAt(2000, text, { aspect, captionStyle: style })).toMatch(new RegExp(`^<div style="[^"]*padding-bottom:${risePx}px`));
    }
  });

  it("shrinks a punch word too long for a line, marked as fitted, its outline with it", () => {
    const html = drawAt(300, "Internationalization everywhere", { captionStyle: "punch" });
    const full = lightTheme.type.headline["9:16"].size;
    const size = Number(/font-size:([\d.]+)px/.exec(plateStyle(html))?.[1]);
    expect(size).toBeLessThan(full);
    expect(html).toContain("data-type-fit");
    const stroke = Number(/-webkit-text-stroke:([\d.]+)px/.exec(plateStyle(html))?.[1]);
    expect(stroke).toBeCloseTo((lightTheme.caption.strokePx * size) / full, 6);
  });

  it("widens the spaces between words by what a lit word grows into them, and by the punch outline", () => {
    const { wordScale } = lightTheme.motion.caption;
    const spacing = (html: string) => Number(/word-spacing:([\d.]+)px/.exec(plateStyle(html))?.[1]);
    const track = (style: "standard" | "punch") => captionTrack(lightTheme, "9:16", text, style, endMs);
    for (const style of ["standard", "punch"] as const) {
      const { words: timed, pages } = track(style);
      const i = timed.findIndex((w) => w.text === "storyboard,");
      const html = drawAt(litMs(timed[i]!), text, { captionStyle: style });
      const page = pages[pageIndexAt(pages, litMs(timed[i]!))]!;
      const longest = Math.max(...timed.slice(page.start, page.end).map((w) => w.text.length));
      const size = Number(/font-size:([\d.]+)px/.exec(plateStyle(html))?.[1]);
      // A lit word grows (wordScale - 1) / 2 of its width into each space; real glyphs average under 0.5 em.
      const growth = ((wordScale - 1) / 2) * longest * 0.5 * size;
      expect(spacing(html)).toBeGreaterThanOrEqual(growth + (style === "punch" ? lightTheme.caption.strokePx : 0));
    }
  });

  it.each(ASPECTS)("fits two or three short punch words on a line (%s)", (aspect) => {
    expect(words(pageCaption("Videos from a prompt", captionLimits(lightTheme, aspect, "punch"))[0]!).length).toBeGreaterThanOrEqual(2);
  });
});

describe("caption tokens", () => {
  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
    ["neutral", neutralTheme],
  ] as const)("%s: page enter, word highlight, outline and plate come from the theme", (_, theme) => {
    // Life #4: a page enters scale 0.9 -> 1, y +24 -> 0 in ~170 ms; the spoken word scales 1.04 over 4 frames (30 fps).
    expect(theme.motion.caption).toMatchObject({ ms: 170, fromScale: 0.9, risePx: 24, wordMs: 133, wordScale: 1.04 });
    expect(theme.caption.strokePx).toBeGreaterThanOrEqual(14);
    expect(theme.caption.strokePx).toBeLessThanOrEqual(20);
    expect(theme.caption).toMatchObject({ highlight: "color", platePadY: 6, platePadX: 12 });
    expect(theme.radius.sm).toBe(12);
  });
});

describe("captionStyle and caption tokens in the storyboard", () => {
  const input = (extra: Record<string, unknown>) => ({
    title: "T",
    aspect: "9:16",
    scenes: [{ id: "a", component: "TitleCard", props: { title: "Hello" }, durationMs: 1000 }],
    ...extra,
  });

  it("accepts standard, punch and off, and leaves it unset by default", () => {
    const plain = validateStoryboard(input({}));
    expect(plain.ok && plain.storyboard.captionStyle).toBeUndefined();
    for (const captionStyle of ["standard", "punch", "off"]) {
      const result = validateStoryboard(input({ captionStyle }));
      expect(result.ok && result.storyboard.captionStyle).toBe(captionStyle);
    }
  });

  it("rejects any other caption style", () => {
    const result = validateStoryboard(input({ captionStyle: "karaoke" }));
    expect(!result.ok && result.errors).toEqual(['captionStyle must be "standard", "punch" or "off" (got "karaoke")']);
  });

  it("lets themeOverrides pick the plate highlight and the outline width", () => {
    const ok = validateStoryboard(input({ themeOverrides: { caption: { highlight: "plate", strokePx: 18 } } }));
    expect(ok.ok).toBe(true);
    expect(ok.ok && resolveTheme(ok.storyboard).caption).toMatchObject({ highlight: "plate", strokePx: 18 });
    const bad = validateStoryboard(input({ themeOverrides: { caption: { highlight: "glow" } } }));
    expect(!bad.ok && bad.errors).toEqual(['themeOverrides.caption.highlight must be "color" or "plate" (got "glow")']);
  });
});

describe("captionStyle in the frame", () => {
  function board(captionStyle?: unknown): Storyboard {
    const result = validateStoryboard({
      title: "T",
      aspect: "9:16",
      ...(captionStyle === undefined ? {} : { captionStyle }),
      scenes: [{ id: "a", component: "TitleCard", props: { title: "Hello" }, narration: "We render every frame for you.", durationMs: 3000 }],
    });
    if (!result.ok) throw new Error(result.errors.join("\n"));
    return result.storyboard;
  }
  const frame = (sb: Storyboard) =>
    renderToStaticMarkup(createElement(Frame, { storyboard: sb, theme: resolveTheme(sb), timeline: buildTimeline(sb, {}), frame: 45 }));

  it("captions narration in the standard style by default", () => {
    const html = frame(board());
    expect(html).toContain("data-caption");
    expect(html).toContain(">render</span>");
    expect(html).not.toContain("text-transform:uppercase");
  });

  it("captions in the punch style when asked", () => {
    const html = frame(board("punch"));
    expect(html).toContain("text-transform:uppercase");
  });

  it("leaves the narration uncaptioned when off", () => {
    const html = frame(board("off"));
    expect(html).not.toContain("data-caption");
    expect(html).not.toContain(">render</span>");
  });
});
