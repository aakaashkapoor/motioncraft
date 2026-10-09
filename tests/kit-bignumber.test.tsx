import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, NOMINAL_SCENE_MS, contentArea, fontSize, neutralTheme, type Aspect } from "../src/index";
import { kit } from "../src/kit";
import { BigNumber, bigNumberStep, countedValue, formatBigNumber } from "../src/kit/BigNumber";

/** Reads the root element's inline style back out of server-rendered HTML. */
function rootBox(html: string) {
  const style = /^<[a-z]+[^>]*?style="([^"]*)"/.exec(html)?.[1];
  if (style === undefined) throw new Error(`no root style in ${html}`);
  const num = (key: string): number => {
    const m = new RegExp(`(?:^|;)${key}:([^;]+)`).exec(style);
    if (m?.[1] === undefined) throw new Error(`root style has no ${key}: ${style}`);
    return parseFloat(m[1]);
  };
  return { opacity: num("opacity"), x: num("left"), y: num("top"), width: num("width"), height: num("height") };
}

/** The number text as shown, prefix and suffix included. */
const shownNumber = (html: string) => /<h1[^>]*>(.*?)<\/h1>/.exec(html)?.[1]?.replace(/<[^>]+>|<!-- -->/g, "") ?? "";
const underlineWidth = (html: string) => {
  const m = /data-underline="true" style="[^"]*width:(-?[\d.]+)(?:px)?[;"]/.exec(html);
  if (m?.[1] === undefined) throw new Error(`no underline in ${html}`);
  return parseFloat(m[1]);
};

const PROGRESSES = [0, 0.5, 1] as const;
/** Progress a quarter of the way through the count, and once it has landed (drawn without a clock). */
const COUNT_QUARTER = (neutralTheme.motion.leadMs + neutralTheme.motion.count.ms / 4) / NOMINAL_SCENE_MS;
const COUNTED = (neutralTheme.motion.leadMs + neutralTheme.motion.count.ms) / NOMINAL_SCENE_MS;
const cases = ASPECTS.flatMap((aspect) => PROGRESSES.map((progress) => [aspect, progress] as const));

const render = (aspect: Aspect, progress: number, extra: { prefix?: string; suffix?: string; decimals?: number; value?: number } = {}) =>
  renderToStaticMarkup(
    <BigNumber progress={progress} theme={neutralTheme} aspect={aspect} value={12500} label="Monthly users" {...extra} />,
  );

describe("BigNumber", () => {
  it("is registered in the kit", () => {
    expect(kit.BigNumber).toBe(BigNumber);
  });

  it.each(cases)("renders number and label inside the content area (%s, progress %s)", (aspect, progress) => {
    const html = render(aspect, progress, { prefix: "$", suffix: "+" });
    expect(html).toContain("Monthly users");
    expect(shownNumber(html)).toMatch(/^\$[\d,]+\+$/);
    const box = rootBox(html);
    const area = contentArea(neutralTheme, aspect);
    expect(box.x).toBeGreaterThanOrEqual(area.x);
    expect(box.y).toBeGreaterThanOrEqual(area.y);
    expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
  });

  it.each(ASPECTS)("counts up from 0 over the count token, then holds (%s)", (aspect) => {
    expect(shownNumber(render(aspect, 0))).toBe("0");
    const quarter = Number(shownNumber(render(aspect, COUNT_QUARTER)).replace(/,/g, ""));
    expect(quarter).toBeGreaterThan(0);
    expect(quarter).toBeLessThan(12500);
    expect(shownNumber(render(aspect, COUNTED))).toBe("12,500");
    expect(shownNumber(render(aspect, 0.5))).toBe("12,500");
    expect(shownNumber(render(aspect, 1))).toBe("12,500");
  });

  it.each(ASPECTS)("fades in, holds and fades out (%s)", (aspect) => {
    expect(rootBox(render(aspect, 0)).opacity).toBeCloseTo(0, 3);
    expect(rootBox(render(aspect, 0.5)).opacity).toBeCloseTo(1, 3);
    expect(rootBox(render(aspect, 1)).opacity).toBeCloseTo(0, 3);
    expect(rootBox(render(aspect, 0.2)).opacity).toBeCloseTo(1, 3);
    expect(rootBox(render(aspect, 0.9)).opacity).toBeCloseTo(1, 3);
  });

  it.each(ASPECTS)("grows the accent underline as it counts (%s)", (aspect) => {
    const start = underlineWidth(render(aspect, 0));
    const quarter = underlineWidth(render(aspect, COUNT_QUARTER));
    const full = underlineWidth(render(aspect, COUNTED));
    expect(start).toBe(0);
    expect(quarter).toBeGreaterThan(0);
    expect(quarter).toBeLessThan(full);
    expect(full).toBeLessThanOrEqual(contentArea(neutralTheme, aspect).width);
    expect(underlineWidth(render(aspect, 1))).toBe(full);
    expect(render(aspect, 0.5)).toContain(`background-color:${neutralTheme.colors.accent}`);
  });

  it("counts with an ease-out: past halfway by a quarter of the count", () => {
    const { leadMs, count } = neutralTheme.motion;
    expect(countedValue(neutralTheme, leadMs + count.ms / 4, 100)).toBeGreaterThan(50);
    expect(countedValue(neutralTheme, 0, 100)).toBe(0);
    expect(countedValue(neutralTheme, leadMs, 100)).toBe(0);
    expect(countedValue(neutralTheme, leadMs + count.ms, 100)).toBe(100);
    expect(countedValue(neutralTheme, 4000, -40)).toBe(-40);
  });

  it("formats with thousands separators and fixed decimals", () => {
    expect(formatBigNumber(1234567, 0)).toBe("1,234,567");
    expect(formatBigNumber(3.14159, 2)).toBe("3.14");
    expect(formatBigNumber(2, 1)).toBe("2.0");
    expect(formatBigNumber(-0.2, 0)).toBe("0");
    expect(shownNumber(render("9:16", 0.5, { value: 98.6, decimals: 1, suffix: "%" }))).toBe("98.6%");
  });

  it.each(ASPECTS)("steps the number down for very long values (%s)", (aspect) => {
    expect(bigNumberStep(neutralTheme, aspect, "$1,250")).toBe("numeral");
    const long = bigNumberStep(neutralTheme, aspect, "$1,234,567,890,123,456,789,012.45");
    expect(fontSize(neutralTheme, long, aspect)).toBeLessThan(fontSize(neutralTheme, "numeral", aspect));
  });

  it("leaves out the label when not given and escapes text", () => {
    const html = renderToStaticMarkup(<BigNumber progress={0.5} theme={neutralTheme} aspect="16:9" value={3} prefix="<b>" />);
    expect(html).not.toContain("<p");
    expect(html).toContain("&lt;b&gt;");
  });
});
