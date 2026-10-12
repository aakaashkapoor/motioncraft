// Annotate: a held sentence where one phrase gets a hand-drawn marker
// (underline, circle or highlight) while a thin connector draws to a small
// mono callout note (HyperFrames vox-annotate).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ANNOTATE_MARK_STYLES,
  Annotate,
  NOMINAL_SCENE_MS,
  annotateErrors,
  annotateLayout,
  annotateTiming,
  charsPerLine,
  connectorStroke,
  contentArea,
  kit,
  lightTheme,
  sectionLayout,
  type AnnotateProps,
  type Aspect,
  type Rect,
  ASPECTS,
} from "../src/index";

const theme = lightTheme;

const BASE = { text: "Ship the story, not the spec", mark: "story", note: "what people remember" };

const props = (aspect: Aspect, extra: Partial<AnnotateProps> = {}): AnnotateProps => ({ progress: 0, theme, aspect, ...BASE, ...extra });
const renderAt = (aspect: Aspect, ms: number, extra: Partial<AnnotateProps> = {}) =>
  renderToStaticMarkup(<Annotate {...props(aspect, { progress: ms / NOMINAL_SCENE_MS, ...extra })} />);

/** How much of the mark's stroke is drawn, 0..1, and its opacity, read from its dash. */
function stroke(html: string, part: "mark" | "connector"): { drawn: number; opacity: number } {
  const m = new RegExp(`data-annotate-${part}=""[^>]*?stroke-dasharray="([\\d.]+) [\\d.]+"[^>]*?stroke-dashoffset="([\\d.]+)"[^>]*?opacity="([\\d.]+)"`).exec(html);
  if (m === null) throw new Error(`no ${part} stroke in ${html}`);
  return { drawn: 1 - Number(m[2]) / Number(m[1]), opacity: Number(m[3]) };
}

function noteOpacity(html: string): number {
  const m = /data-annotate-note=""[^>]*?style="[^"]*?opacity:([\d.]+)/.exec(html);
  if (m === null) throw new Error("no note");
  return Number(m[1]);
}

const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

describe("Annotate", () => {
  it("is a kit component", () => {
    expect(kit.Annotate).toBeDefined();
  });

  describe("validation", () => {
    it("throws when the mark is not in the text", () => {
      expect(annotateErrors({ ...BASE, mark: "plan" }).join()).toMatch(/mark/);
      expect(() => renderAt("9:16", 1000, { mark: "plan" })).toThrow(/Annotate: .*mark/);
    });

    it("matches the mark exactly, case and all", () => {
      expect(() => renderAt("9:16", 1000, { mark: "Story" })).toThrow(/mark/);
    });

    it("rejects a note over 40 characters, an unknown style or position", () => {
      expect(annotateErrors({ ...BASE, note: "x".repeat(41) }).join()).toMatch(/note/);
      expect(annotateErrors({ ...BASE, note: "x".repeat(40) })).toEqual([]);
      expect(annotateErrors({ ...BASE, markStyle: "scribble" }).join()).toMatch(/markStyle/);
      expect(annotateErrors({ ...BASE, notePosition: "left" }).join()).toMatch(/notePosition/);
    });
  });

  describe.each(ASPECTS)("layout (%s)", (aspect) => {
    it.each(ANNOTATE_MARK_STYLES)("the %s lies under or around the mark's characters in the estimated layout", (markStyle) => {
      const layout = annotateLayout(theme, aspect, { ...BASE, markStyle });
      const { chars, mark, spec } = layout;
      // The characters' box is where the estimate sets "story" on its line.
      const line = layout.lines[layout.markLine]!;
      expect(line).toContain("story");
      expect(line.length).toBeLessThanOrEqual(charsPerLine(layout.textBox.width, spec.size));
      expect(chars.width).toBeCloseTo("story".length * spec.size * 0.6, 0);
      const lineWidth = line.length * spec.size * 0.6;
      const lineLeft = layout.textBox.x + (layout.textBox.width - lineWidth) / 2;
      expect(chars.x).toBeCloseTo(lineLeft + line.indexOf("story") * spec.size * 0.6, 0);
      // Horizontally the mark spans the characters.
      expect(mark.x).toBeLessThanOrEqual(chars.x);
      expect(mark.x + mark.width).toBeGreaterThanOrEqual(chars.x + chars.width);
      if (markStyle === "underline") {
        expect(mark.y).toBeGreaterThan(chars.y + chars.height / 2);
        expect(mark.y + mark.height).toBeLessThanOrEqual(chars.y + chars.height + spec.size * 0.5);
      } else if (markStyle === "circle") {
        expect(contains(mark, chars)).toBe(true);
      } else {
        expect(mark.y).toBeGreaterThanOrEqual(chars.y - 0.5);
        expect(mark.y + mark.height).toBeLessThanOrEqual(chars.y + chars.height + 0.5);
        expect(mark.height).toBeGreaterThan(chars.height / 2);
      }
    });

    it("sets the sentence in at most two lines, the mark never broken", () => {
      const text = "Ship the story, not the spec, every time";
      const layout = annotateLayout(theme, aspect, { ...BASE, text });
      expect(layout.lines.length).toBeLessThanOrEqual(2);
      expect(layout.lines.join(" ")).toBe(text);
      expect(layout.lines[layout.markLine]).toContain("story");
      // A phrase of several words stays on one line.
      const phrase = annotateLayout(theme, aspect, { ...BASE, text, mark: "not the spec," });
      expect(phrase.lines[phrase.markLine]).toContain("not the spec,");
    });

    it.each(["below", "above"] as const)("breaks with the mark on the line next to a note %s where it can", (notePosition) => {
      // "Ship" can only open the sentence and "spec" only close it.
      for (const mark of notePosition === "below" ? ["story", "spec"] : ["Ship", "story"]) {
        const layout = annotateLayout(theme, aspect, { ...BASE, mark, notePosition });
        expect(layout.markLine, mark).toBe(notePosition === "below" ? layout.lines.length - 1 : 0);
        expect(layout.connector.via).toEqual([]);
      }
    });

    it.each(["below", "above"] as const)("routes the connector round a line between the mark and a note %s", (notePosition) => {
      const text = notePosition === "below" ? "Ship the story,\nnot the spec" : "Not the spec,\nship the story";
      const layout = annotateLayout(theme, aspect, { ...BASE, text, notePosition });
      expect(layout.lines.length).toBe(2);
      const other = 1 - layout.markLine;
      expect(layout.markLine).toBe(notePosition === "below" ? 0 : 1);
      const { spec, textBox, lineHeight } = layout;
      const lineWidth = layout.lines[other]!.length * spec.size * 0.6;
      const span = { left: textBox.x + (textBox.width - lineWidth) / 2, right: textBox.x + (textBox.width + lineWidth) / 2 };
      const top = layout.chars.y + (other - layout.markLine) * lineHeight;
      const { from, via, to } = layout.connector;
      const route = [from, ...via, to];
      const stroke = connectorStroke(theme, route, 0);
      const points = stroke.d.split(/[ML]/).filter(Boolean).map((p) => p.trim().split(" ").map(Number) as [number, number]);
      for (const [x, y] of points) {
        if (y > top && y < top + lineHeight) expect(x < span.left || x > span.right, `(${x}, ${y}) crosses line ${other}`).toBe(true);
      }
      expect(to.y).toBeCloseTo(notePosition === "below" ? layout.note.y - theme.spacing.xxs : layout.note.y + layout.note.height + theme.spacing.xxs, 1);
    });

    it("puts the note below the sentence by default and above when asked, inside the area", () => {
      const area = contentArea(theme, aspect);
      const below = annotateLayout(theme, aspect, BASE);
      expect(below.note.y).toBeGreaterThan(below.textBox.y + below.textBox.height);
      const above = annotateLayout(theme, aspect, { ...BASE, notePosition: "above" });
      expect(above.note.y + above.note.height).toBeLessThan(above.textBox.y);
      for (const layout of [below, above]) {
        expect(contains(area, layout.box)).toBe(true);
        expect(contains(layout.box, layout.note)).toBe(true);
      }
    });

    it("stays inside a Section's slot", () => {
      const slot = sectionLayout(theme, aspect, { headline: "Every part in its slot" }).content;
      const layout = annotateLayout(theme, aspect, BASE, slot);
      expect(contains(slot, layout.box)).toBe(true);
    });
  });

  describe("timing", () => {
    it("draws the mark from about 700 ms, fully drawn by 1.2 s", () => {
      const timing = annotateTiming(theme);
      expect(timing.mark).toBeGreaterThanOrEqual(650);
      expect(timing.mark + timing.markMs).toBeLessThanOrEqual(1200);
      for (const markStyle of ANNOTATE_MARK_STYLES) {
        for (const ms of [0, 300, 640]) {
          const early = stroke(renderAt("9:16", ms, { markStyle }), "mark");
          expect(early.drawn, `${markStyle} at ${ms} ms`).toBe(0);
          expect(early.opacity).toBe(0);
        }
        const mid = stroke(renderAt("9:16", 900, { markStyle }), "mark");
        expect(mid.drawn).toBeGreaterThan(0);
        expect(mid.drawn).toBeLessThan(1);
        expect(stroke(renderAt("9:16", 1200, { markStyle }), "mark").drawn).toBe(1);
      }
    });

    it("shows the note only after the connector has drawn", () => {
      const timing = annotateTiming(theme);
      expect(timing.connector).toBeGreaterThan(timing.mark);
      expect(timing.note).toBeGreaterThan(timing.connector);
      for (let ms = 0; ms <= 2000; ms += 20) {
        const html = renderAt("16:9", ms);
        const connector = stroke(html, "connector").drawn;
        const note = noteOpacity(html);
        if (note > 0) expect(connector, `connector at ${ms} ms`).toBeGreaterThan(0.5);
        if (connector === 0) expect(note).toBe(0);
      }
      expect(noteOpacity(renderAt("16:9", 2000))).toBe(1);
    });

    it("the sentence arrives first, starting on the lead", () => {
      const first = renderAt("9:16", 0);
      expect(renderAt("9:16", theme.motion.leadMs - 20)).toBe(first);
      expect(renderAt("9:16", theme.motion.leadMs + 50)).not.toBe(first);
    });
  });

  it("draws the same frame identically twice", () => {
    for (const aspect of ASPECTS) {
      for (const markStyle of ANNOTATE_MARK_STYLES) {
        for (const ms of [800, 1100, 3000]) {
          expect(renderAt(aspect, ms, { markStyle })).toBe(renderAt(aspect, ms, { markStyle }));
        }
      }
    }
  });

  it("draws a hand-drawn stroke, not a straight line, varied by the seed", () => {
    const path = (seed: number) => /data-annotate-mark=""[^>]*?d="([^"]*)"/.exec(renderAt("9:16", 3000, { seed }))![1]!;
    const ys = path(0)
      .split(/[ML]\s*/)
      .filter(Boolean)
      .map((p) => Number(p.trim().split(/[ ,]+/)[1]));
    expect(new Set(ys.map((y) => y.toFixed(1))).size).toBeGreaterThan(3);
    expect(path(1)).not.toBe(path(0));
  });
});
