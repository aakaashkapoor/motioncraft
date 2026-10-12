// The pill karaoke caption style (ported from HyperFrames `caption-pill-karaoke`):
// a page of bold words in the lightest neutral, and a rounded accent pill that
// slides from word to word behind the spoken one. Word and page timing are the
// punch style's; only the look differs.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  CAPTION_LEAD_MS,
  CAPTION_PAGE_WORDS,
  Caption,
  SceneClockContext,
  captionLimits,
  captionTrack,
  captionType,
  contrastRatio,
  darkTheme,
  lightTheme,
  neutralTheme,
  pageIndexAt,
  validateStoryboard,
  type Aspect,
  type Theme,
} from "../src/index";
import { captionColors } from "../src/kit/Caption";
import { PILL_PAD_EM, PILL_SLIDE, estimateWordBoxes, pillAt, pillBox, pillLayout } from "../src/kit/captionPill";
import { AA_CONTRAST } from "../src/theme/contrast";

const text = "You write a prompt. The agent plans a storyboard, renders every frame, and checks the layout.";
const FRAMES = 301;
const endMs = ((FRAMES - 1) * 1000) / 30;
const THEMES = [
  ["light", lightTheme],
  ["dark", darkTheme],
  ["neutral", neutralTheme],
] as const;

function drawAt(ms: number, opts: { theme?: Theme; aspect?: Aspect; captionStyle?: "pill" | "punch" } = {}) {
  const { theme = lightTheme, aspect = "9:16", captionStyle = "pill" } = opts;
  const frame = Math.round((ms * 30) / 1000);
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: 30, frame, frames: FRAMES }}>
      <Caption progress={frame / (FRAMES - 1)} theme={theme} aspect={aspect} text={text} captionStyle={captionStyle} />
    </SceneClockContext.Provider>,
  );
}

/** The word spans' indices, in order. */
const wordIndices = (html: string) => [...html.matchAll(/data-caption-word="(\d+)"/g)].map((m) => Number(m[1]));

/** The word span holding the pill, and the pill's inline style. */
function pillOf(html: string): { word: number; style: string } | undefined {
  const match = /data-caption-word="(\d+)"[^>]*><span data-caption-pill="" style="([^"]*)"/.exec(html);
  return match === null ? undefined : { word: Number(match[1]), style: match[2]! };
}

const px = (style: string, prop: string) => Number(new RegExp(`(?:^|;)${prop}:(-?[\\d.e-]+)px`).exec(style)?.[1]);
const plateStyle = (html: string) => /<p data-block="Caption"[^>]*?style="([^"]*)"/.exec(html)?.[1] ?? "";

describe("pill caption style: timing", () => {
  it("pages exactly like punch", () => {
    expect(CAPTION_PAGE_WORDS.pill).toEqual(CAPTION_PAGE_WORDS.punch);
    for (const aspect of ASPECTS) {
      expect(captionLimits(lightTheme, aspect, "pill")).toEqual(captionLimits(lightTheme, aspect, "punch"));
      expect(captionTrack(lightTheme, aspect, text, "pill", endMs)).toEqual(captionTrack(lightTheme, aspect, text, "punch", endMs));
    }
  });

  it("shows the same words as punch on every frame", () => {
    for (let frame = 0; frame < FRAMES; frame++) {
      const ms = (frame * 1000) / 30;
      expect(wordIndices(drawAt(ms)), `frame ${frame}`).toEqual(wordIndices(drawAt(ms, { captionStyle: "punch" })));
    }
  });

  it("puts the pill under the word being spoken, from the frame it lights", () => {
    const { words, pages } = captionTrack(lightTheme, "9:16", text, "pill", endMs);
    for (let frame = 0; frame < FRAMES; frame++) {
      const ms = (frame * 1000) / 30;
      const spoken = ms + CAPTION_LEAD_MS;
      const page = pages[pageIndexAt(pages, spoken)]!;
      let held: number | undefined;
      for (let i = page.start; i < page.end; i++) if (words[i]!.startMs <= spoken) held = i;
      expect(pillOf(drawAt(ms))?.word, `frame ${frame}`).toBe(held);
    }
  });
});

describe("pill caption style: the pill", () => {
  const theme = lightTheme;
  const aspect = "9:16";
  const { words, pages } = captionTrack(theme, aspect, text, "pill", endMs);
  const layout = pillLayout(theme, aspect);
  const pad = { x: PILL_PAD_EM.x * layout.size, y: PILL_PAD_EM.y * layout.size };
  const multi = pages.find((p) => p.end - p.start >= 2)!;
  const pageWords = words.slice(multi.start, multi.end).map((w) => w.text);
  const boxes = estimateWordBoxes(pageWords, layout);

  /** The pill drawn at `ms`, in page coordinates: its insets from its word's estimated box. */
  function drawnPill(ms: number) {
    const pill = pillOf(drawAt(ms))!;
    const box = boxes[pill.word - multi.start]!;
    const [left, right, top, bottom] = ["left", "right", "top", "bottom"].map((p) => px(pill.style, p)) as [number, number, number, number];
    return { x: box.x + left, y: box.y + top, width: box.width - left - right, height: box.height - top - bottom, style: pill.style };
  }

  it("surrounds the spoken word's box, padded 0.18 em x 0.4 em, once it has arrived", () => {
    expect(PILL_PAD_EM).toEqual({ x: 0.4, y: 0.18 });
    const k = multi.start + 1;
    const ms = Math.ceil((words[k]!.startMs - CAPTION_LEAD_MS + PILL_SLIDE.ms) * 0.03) / 0.03;
    expect(ms + CAPTION_LEAD_MS).toBeLessThan(words[k]!.endMs);
    const pill = drawnPill(ms);
    const box = boxes[1]!;
    expect(px(pill.style, "left")).toBe(-pad.x);
    expect(px(pill.style, "right")).toBe(-pad.x);
    expect(px(pill.style, "top")).toBe(-pad.y);
    expect(px(pill.style, "bottom")).toBe(-pad.y);
    expect(pill.x).toBeLessThan(box.x);
    expect(pill.x + pill.width).toBeGreaterThan(box.x + box.width);
    expect(pill.y).toBeLessThan(box.y);
    expect(pill.y + pill.height).toBeGreaterThan(box.y + box.height);
    // Fully round ends: the radius is half the pill's height.
    expect(px(pill.style, "border-radius")).toBeCloseTo(pill.height / 2, 6);
    expect(pill.style).toContain(`background-color:${theme.colors.accent}`);
  });

  it("slides and resizes from the last word to the next, never jumping", () => {
    expect(PILL_SLIDE.ms).toBe(120);
    const k = multi.start + 1;
    const from = pillBox(boxes, { word: 0, from: 0, move: 1, opacity: 1 }, pad);
    const to = pillBox(boxes, { word: 1, from: 1, move: 1, opacity: 1 }, pad);
    // The first frame at least a frame into the move, and still short of its end.
    const ms = Math.ceil((words[k]!.startMs - CAPTION_LEAD_MS + 1) * 0.03) / 0.03;
    expect(ms + CAPTION_LEAD_MS - words[k]!.startMs).toBeLessThan(PILL_SLIDE.ms);
    const mid = drawnPill(ms);
    expect(mid.x).toBeGreaterThan(from.x);
    expect(mid.x).toBeLessThan(to.x);
    expect(mid.x + mid.width).toBeGreaterThan(from.x + from.width);
    expect(mid.x + mid.width).toBeLessThan(to.x + to.width);
    expect(mid.width).not.toBeCloseTo(from.width, 0);
    expect(mid.height).toBeCloseTo(to.height, 6);
  });

  it("paints the pill under the letters of both words while it slides", () => {
    const k = multi.start + 1;
    const ms = Math.ceil((words[k]!.startMs - CAPTION_LEAD_MS + 1) * 0.03) / 0.03;
    const html = drawAt(ms);
    const zIndex = (index: number) => Number(new RegExp(`data-caption-word="${index}" style="[^"]*z-index:(-?\\d+)`).exec(html)?.[1]);
    // The pill sits at z-index -1 in its own word's stacking context; the word it leaves is lifted over that word.
    expect(pillOf(html)!.style).toContain("z-index:-1");
    expect(zIndex(k)).toBe(0);
    expect(zIndex(k - 1)).toBeGreaterThan(zIndex(k));
  });

  it("eases the slide out (cubic): past halfway at half its time", () => {
    const state = pillAt(words, multi, words[multi.start + 1]!.startMs + PILL_SLIDE.ms / 2)!;
    expect(state).toMatchObject({ word: 1, from: 0, opacity: 1 });
    expect(state.move).toBeCloseTo(1 - 0.5 ** 3, 1);
  });

  it("fades in under the first word of a new page, without sliding", () => {
    const page = pages[1]!;
    const at = (ms: number) => pillAt(words, page, ms)!;
    expect(at(page.startMs)).toEqual({ word: 0, from: 0, move: 1, opacity: 0 });
    expect(at(page.startMs + PILL_SLIDE.ms / 2).opacity).toBeGreaterThan(0);
    expect(at(page.startMs + PILL_SLIDE.ms / 2).opacity).toBeLessThan(1);
    expect(at(page.startMs + PILL_SLIDE.ms).opacity).toBe(1);
    const html = drawAt(Math.ceil((page.startMs - CAPTION_LEAD_MS + 1) * 0.03) / 0.03);
    const pill = pillOf(html)!;
    expect(pill.word).toBe(page.start);
    expect(px(pill.style, "left")).toBe(-pad.x);
    expect(Number(/opacity:([\d.]+)/.exec(pill.style)?.[1])).toBeLessThan(1);
  });

  it("estimates word boxes left to right on a line, centered in the line", () => {
    expect(boxes.length).toBe(pageWords.length);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.x).toBeGreaterThan(boxes[i - 1]!.x + boxes[i - 1]!.width);
    const right = boxes.at(-1)!.x + boxes.at(-1)!.width;
    expect(boxes[0]!.x).toBeCloseTo(layout.lineWidth - right, 6);
  });

  it("estimates a page too long for a line on more lines", () => {
    const wrapped = estimateWordBoxes(["Internationalization", "everywhere", "today"], layout);
    expect(wrapped[1]!.y).toBeGreaterThan(wrapped[0]!.y);
    expect(wrapped[0]!.height).toBeCloseTo(layout.size * layout.lineHeight, 6);
  });
});

describe("pill caption style: the look", () => {
  it.each(ASPECTS)("sets the punch headline size at bold, in sentence case, without an outline (%s)", (aspect) => {
    expect(captionType(lightTheme, aspect, "pill")).toEqual({ ...lightTheme.type.headline[aspect], weight: lightTheme.weights.bold });
    const style = plateStyle(drawAt(2000, { aspect }));
    expect(style).toContain(`font-size:${lightTheme.type.headline[aspect].size}px`);
    expect(style).toContain(`font-weight:${lightTheme.weights.bold}`);
    expect(style).not.toContain("text-transform");
    expect(style).not.toContain("-webkit-text-stroke");
  });

  it.each(THEMES)("%s: the spoken word reads on the pill, and the page on what is behind it", (_, theme) => {
    const colors = captionColors(theme, "pill");
    expect(colors.active).toBe(theme.colors.accentText);
    expect(contrastRatio(colors.active, theme.colors.accent)).toBeGreaterThanOrEqual(AA_CONTRAST);
    const behind = colors.plate ?? theme.colors.ground;
    expect(contrastRatio(colors.text, behind)).toBeGreaterThanOrEqual(AA_CONTRAST);
    // The lightest neutral, on a dark band only where the ground is too light for it.
    const lightest = [theme.colors.text, theme.colors.ground, theme.colors.surface].sort((a, b) => contrastRatio(b, "#000000") - contrastRatio(a, "#000000"))[0];
    expect(colors.text).toBe(lightest);
    expect(colors.plate !== undefined).toBe(contrastRatio(colors.text, theme.colors.ground) < AA_CONTRAST);
  });

  it.each(THEMES)("%s: a plate band only when the ground needs one", (_, theme) => {
    const colors = captionColors(theme, "pill");
    const style = plateStyle(drawAt(2000, { theme }));
    if (colors.plate === undefined) expect(style).not.toContain("background-color");
    else expect(style).toContain(`background-color:${colors.plate}`);
  });

  it("colors the word under the pill accentText, and the rest the page color", () => {
    const { words } = captionTrack(lightTheme, "9:16", text, "pill", endMs);
    const colors = captionColors(lightTheme, "pill");
    const k = 6;
    const ms = Math.ceil((words[k]!.startMs - CAPTION_LEAD_MS + PILL_SLIDE.ms) * 0.03) / 0.03;
    const html = drawAt(ms);
    for (const [, index, style] of html.matchAll(/data-caption-word="(\d+)" style="([^"]*)"/g)) {
      expect(style).toContain(`color:${Number(index) === k ? colors.active : colors.text}`);
    }
  });

  it("widens the spaces so a pill never touches the next word", () => {
    const size = lightTheme.type.headline["9:16"].size;
    const spacing = Number(/word-spacing:([\d.]+)px/.exec(plateStyle(drawAt(2000)))?.[1]);
    expect(spacing).toBeGreaterThanOrEqual(PILL_PAD_EM.x * size);
  });
});

describe("pill in the storyboard", () => {
  it("is a caption style the storyboard accepts", () => {
    const result = validateStoryboard({
      title: "T",
      aspect: "9:16",
      captionStyle: "pill",
      scenes: [{ id: "a", component: "TitleCard", props: { title: "Hello" }, durationMs: 1000 }],
    });
    expect(result.ok && result.storyboard.captionStyle).toBe("pill");
  });
});
