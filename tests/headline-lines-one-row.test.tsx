// Line-by-line headlines (`lines` on Headline and TitleCard) keep each line on
// one row: the step is the largest at which every line is sure to fit the
// column in one row (`ONE_ROW_CHAR_EM`, a generous glyph width), not one at
// which the lines only fit the height wrapped. tests/fixtures/headline-lines.json
// scene 2 drew "Tap who / had what." and "Everyone / pays $46." on two rows.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Headline, TitleCard, contentArea, lightTheme, type Aspect } from "../src/index";
import { headlineBox } from "../src/kit/Headline";
import { ONE_ROW_CHAR_EM } from "../src/kit/headlineLines";
import { titleCardBox } from "../src/kit/TitleCard";
import { estimateLines } from "../src/layout/textFit";

const theme = lightTheme;
const ASPECTS: Aspect[] = ["9:16", "16:9"];
const CARD = {
  kicker: "Split it",
  lines: ["Snap the receipt.", "Tap who had what.", "Everyone pays $46."],
  subtitle: "No spreadsheet, no awkward maths",
};
const HOOK = ["Dinner was $184.", "Four friends.", "Who owes what?"];

const oneRow = (texts: readonly string[], width: number, size: number) => texts.every((text) => estimateLines(text, width, size, ONE_ROW_CHAR_EM) === 1);
const fontSize = (html: string) => Number(/<h1 [^>]*font-size:(\d+(?:\.\d+)?)px/.exec(html)![1]);

describe("lines: each line stays on one row", () => {
  it("the one-row glyph width is more generous than real bold text (0.40-0.50 em measured in Source Sans 3)", () => {
    expect(ONE_ROW_CHAR_EM).toBeGreaterThanOrEqual(0.5);
    expect(ONE_ROW_CHAR_EM).toBeLessThan(0.6);
  });

  it.each(ASPECTS)("TitleCard picks a step where every line fits the column in one row (%s)", (aspect) => {
    const { box, step } = titleCardBox(theme, aspect, CARD);
    const spec = theme.type[step][aspect];
    expect(oneRow(CARD.lines, box.width, spec.size), `step ${step}`).toBe(true);
    const area = contentArea(theme, aspect);
    expect(box.y).toBeGreaterThanOrEqual(area.y);
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height + 0.5);
    const html = renderToStaticMarkup(<TitleCard progress={0.7} theme={theme} aspect={aspect} {...CARD} lines={CARD.lines.map((text) => ({ text }))} />);
    expect(fontSize(html)).toBe(spec.size);
  });

  it("TitleCard in 9:16 does not drop below the largest one-row step", () => {
    const { step } = titleCardBox(theme, "9:16", CARD);
    // One step up, a line would wrap.
    const steps = ["display", "headline", "title", "subtitle"] as const;
    const up = steps[steps.indexOf(step as (typeof steps)[number]) - 1];
    if (up !== undefined) expect(oneRow(CARD.lines, titleCardBox(theme, "9:16", CARD).box.width, theme.type[up]["9:16"].size)).toBe(false);
  });

  it.each(ASPECTS)("Headline picks a step where every line fits the column in one row (%s)", (aspect) => {
    const { box, step } = headlineBox(theme, aspect, HOOK);
    expect(oneRow(HOOK, box.width, theme.type[step][aspect].size), `step ${step}`).toBe(true);
    const html = renderToStaticMarkup(<Headline progress={0.7} theme={theme} aspect={aspect} lines={HOOK.map((text) => ({ text }))} />);
    expect(fontSize(html)).toBe(theme.type[step][aspect].size);
  });

  it("the box is sized for one row per line, not for wrapped lines", () => {
    const { box, step } = titleCardBox(theme, "9:16", { lines: CARD.lines });
    const spec = theme.type[step]["9:16"];
    expect(box.height).toBeCloseTo(3 * spec.size * spec.lineHeight, 5);
  });

  it("lines too long for one row at any step still get the largest step whose wrapped lines fit", () => {
    const long = ["A line far too long to ever sit on one row of the column", "And another line that is just as long as the first one is"];
    for (const aspect of ASPECTS) {
      const card = titleCardBox(theme, aspect, { lines: long });
      const head = headlineBox(theme, aspect, long);
      const area = contentArea(theme, aspect);
      expect(card.box.height).toBeLessThanOrEqual(area.height);
      expect(head.box.height).toBeLessThanOrEqual(area.height);
    }
  });

  it("a single title or text is laid out as before (the one-row rule is for lines)", () => {
    const title = "Snap the receipt and tap who had what";
    expect(titleCardBox(theme, "9:16", { title }).step).toBe("display");
  });
});
