import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, NOMINAL_SCENE_MS, SceneClockContext, contentArea, curveEasing, fade, fontSize, lightTheme, neutralTheme, pulse, type Aspect } from "../src/index";
import { kit } from "../src/kit";
import { BigNumber, bigNumberStep, bigNumberTiming, formatBigNumber, odometerColumns, odometerText } from "../src/kit/BigNumber";

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

/** The number's text as set in the markup, prefix and suffix included (rolling digits are drawn, not text). */
const shownNumber = (html: string) => /<h1[^>]*>(.*?)<\/h1>/.exec(html)?.[1]?.replace(/<style[^>]*>.*?<\/style>|<[^>]+>|<!-- -->/g, "") ?? "";
/** A number from the inline style of the element marked `attribute`, e.g. the `width` of the bar fill. */
function styleNumber(html: string, attribute: string, key: string): number {
  const style = new RegExp(`${attribute}="[^"]*" style="([^"]*)"`).exec(html)?.[1];
  if (style === undefined) throw new Error(`no ${attribute} in ${html}`);
  const m = new RegExp(`(?:^|;)${key}:([^;]+)`).exec(style);
  if (m?.[1] === undefined) throw new Error(`${attribute} has no ${key}: ${style}`);
  return parseFloat(m[1]);
}

const theme = lightTheme;
const { leadMs, count, pop, shine } = theme.motion;
const expo = curveEasing(count.curve);

const PROGRESSES = [0, 0.5, 1] as const;
const cases = ASPECTS.flatMap((aspect) => PROGRESSES.map((progress) => [aspect, progress] as const));

const render = (aspect: Aspect, progress: number, extra: { prefix?: string; suffix?: string; decimals?: number; value?: number } = {}) =>
  renderToStaticMarkup(
    <BigNumber progress={progress} theme={neutralTheme} aspect={aspect} value={12500} label="Monthly users" {...extra} />,
  );

/** Renders `element` `ms` into a 20 s scene, on a clock that counts whole ms. */
const at = (ms: number, element: ReactElement) =>
  renderToStaticMarkup(<SceneClockContext.Provider value={{ fps: 1000, frame: ms, frames: 20001 }}>{element}</SceneClockContext.Provider>);
const stat = (ms: number, aspect: Aspect = "9:16") =>
  at(ms, <BigNumber progress={0} theme={theme} aspect={aspect} value={12500} suffix="+" label="Monthly users" />);

/** "12,500": five digit columns; the rightmost starts first and the leftmost lands last. */
const timing = bigNumberTiming(theme, 5);

describe("BigNumber", () => {
  it("is registered in the kit", () => {
    expect(kit.BigNumber).toBe(BigNumber);
  });

  it.each(cases)("renders number and label inside the content area (%s, progress %s)", (aspect, progress) => {
    const html = render(aspect, progress, { prefix: "$", suffix: "+" });
    expect(html).toContain("Monthly users");
    expect(html).toContain('aria-label="$12,500+"');
    const box = rootBox(html);
    const area = contentArea(neutralTheme, aspect);
    expect(box.x).toBeGreaterThanOrEqual(area.x);
    expect(box.y).toBeGreaterThanOrEqual(area.y);
    expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
  });

  it.each(ASPECTS)("holds the landed value as text (%s)", (aspect) => {
    expect(shownNumber(render(aspect, 0.5, { prefix: "$", suffix: "+" }))).toBe("$12,500+");
    expect(shownNumber(render(aspect, 1, { prefix: "$", suffix: "+" }))).toBe("$12,500+");
  });

  it.each(ASPECTS)("fades in, holds and fades out (%s)", (aspect) => {
    expect(rootBox(render(aspect, 0)).opacity).toBeCloseTo(0, 3);
    expect(rootBox(render(aspect, 0.5)).opacity).toBeCloseTo(1, 3);
    expect(rootBox(render(aspect, 1)).opacity).toBeCloseTo(0, 3);
    expect(rootBox(render(aspect, 0.2)).opacity).toBeCloseTo(1, 3);
    expect(rootBox(render(aspect, 0.9)).opacity).toBeCloseTo(1, 3);
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

describe("BigNumber timing", () => {
  it("rolls from the lead, 40 ms per digit right to left, and lands after the count token", () => {
    expect(timing.startMs).toBe(leadMs);
    expect(timing.landMs).toBe(leadMs + 4 * count.staggerMs + count.ms);
    expect(timing.unitMs).toBe(timing.landMs + count.unitDelayMs);
    expect(bigNumberTiming(theme, 1).landMs).toBe(leadMs + count.ms);
  });
});

describe("odometer: per-digit columns", () => {
  it("has a column per digit, left to right, around the separators", () => {
    expect(odometerColumns(theme, 0, "12,500").map((c) => c.digit)).toEqual([1, 2, 5, 0, 0]);
    expect(odometerColumns(theme, 0, "-37.5").map((c) => c.digit)).toEqual([3, 7, 5]);
  });

  it("rolls each column a full turn and on to its digit, on the count token, the rightmost first", () => {
    for (const ms of [leadMs + 1, leadMs + 60, leadMs + 200, leadMs + 500, leadMs + 900, timing.landMs - 1]) {
      const columns = odometerColumns(theme, ms, "12,500");
      columns.forEach((column, i) => {
        const place = columns.length - 1 - i;
        const elapsed = ms - leadMs - place * count.staggerMs;
        const expected = elapsed <= 0 ? 0 : elapsed >= count.ms ? 10 + column.digit : (10 + column.digit) * expo(elapsed / count.ms);
        expect(column.roll, `column ${i} at ${ms} ms`).toBeCloseTo(expected, 9);
      });
    }
  });

  it("starts each column 40 ms after the one to its right", () => {
    const columns = odometerColumns(theme, leadMs + 2 * count.staggerMs, "12,500").map((c) => c.roll);
    expect(columns.slice(0, 3)).toEqual([0, 0, 0]);
    expect(columns[3]).toBeGreaterThan(0);
    expect(columns[4]).toBeGreaterThan(columns[3]!);
  });

  it("reads the digits each column shows at a given ms", () => {
    expect(odometerText(theme, 0, "12,500")).toBe("00,000");
    expect(odometerText(theme, leadMs, "12,500")).toBe("00,000");
    // A tenth of the way in, the ones column (moving first, 10 digits to go) is past 4 and the others trail it.
    const tenth = leadMs + 100;
    const expected = [1, 2, 5, 0, 0].map((digit, i) => {
      const elapsed = tenth - leadMs - (4 - i) * count.staggerMs;
      return Math.round((10 + digit) * expo(Math.max(0, elapsed) / count.ms)) % 10;
    });
    expect(odometerText(theme, tenth, "12,500")).toBe(`${expected[0]}${expected[1]},${expected.slice(2).join("")}`);
    expect(expected[4]).toBeGreaterThanOrEqual(4);
  });

  it("lands exactly on the final value and stays there", () => {
    for (const ms of [timing.landMs, timing.landMs + 1, timing.landMs + 4000]) {
      expect(odometerText(theme, ms, "12,500")).toBe("12,500");
      expect(odometerColumns(theme, ms, "12,500").map((c) => c.roll)).toEqual([11, 12, 15, 10, 10]);
    }
    expect(odometerText(theme, bigNumberTiming(theme, 6).landMs, "-1,234.56")).toBe("-1,234.56");
    expect(odometerColumns(theme, timing.landMs - 1, "12,500")[0]!.roll).toBeLessThan(11);
  });

  it("blurs a digit 2-6 px while it moves, most as it sets off, and not at all at rest", () => {
    const blurAt = (ms: number) => odometerColumns(theme, ms, "12,500").at(-1)!.blur;
    expect(blurAt(0)).toBe(0);
    expect(blurAt(leadMs)).toBe(0);
    expect(blurAt(leadMs + 1)).toBeCloseTo(count.blurMaxPx, 1);
    for (const ms of [leadMs + 50, leadMs + 300, leadMs + 700, leadMs + count.ms - 1]) {
      expect(blurAt(ms)).toBeGreaterThanOrEqual(count.blurMinPx);
      expect(blurAt(ms)).toBeLessThanOrEqual(count.blurMaxPx);
    }
    expect(blurAt(leadMs + 50)).toBeGreaterThan(blurAt(leadMs + 300));
    expect(blurAt(leadMs + count.ms)).toBe(0);
    expect(odometerColumns(theme, timing.landMs, "12,500").every((c) => c.blur === 0)).toBe(true);
  });
});

describe("odometer: drawn", () => {
  // "12,500+" is a touch wide for the numeral step at 9:16, so it is set a step down.
  const spec = theme.type[bigNumberStep(theme, "9:16", "12,500+")]["9:16"];
  const pitch = spec.size * spec.lineHeight;

  /** Each rolling column's cells: the digit and its offset and opacity. */
  function cells(html: string) {
    return [...html.matchAll(/<span data-odometer-column="(\d+)"([^>]*)>(.*?)<\/span><\/span>(?:<\/span>)?/g)].map((m) => ({
      place: Number(m[1]),
      filter: /filter:url\(#([^)]+)\)/.exec(m[2]!)?.[1],
      cells: [...m[3]!.matchAll(/data-odometer-glyph="(\d)" style="[^"]*transform:translateY\((-?[\d.]+)px\);opacity:([\d.]+)/g)].map((c) => ({
        digit: Number(c[1]),
        y: parseFloat(c[2]!),
        opacity: parseFloat(c[3]!),
      })),
    }));
  }

  it("draws each moving column as its two nearest digits, cross-fading as they roll up", () => {
    const ms = leadMs + 300;
    const html = stat(ms);
    const drawn = cells(html);
    const columns = odometerColumns(theme, ms, "12,500");
    expect(drawn).toHaveLength(5);
    drawn.forEach((column, i) => {
      const roll = columns[i]!.roll;
      const f = roll - Math.floor(roll);
      expect(column.place).toBe(4 - i);
      expect(column.cells.map((c) => c.digit)).toEqual([Math.floor(roll) % 10, (Math.floor(roll) + 1) % 10]);
      expect(column.cells[0]!.y).toBeCloseTo(-f * pitch, 1);
      expect(column.cells[1]!.y).toBeCloseTo((1 - f) * pitch, 1);
      expect(column.cells[0]!.opacity).toBeCloseTo(1 - f, 2);
      expect(column.cells[1]!.opacity).toBeCloseTo(f, 2);
    });
  });

  it("blurs moving columns vertically only, by the column's blur, and leaves resting ones sharp", () => {
    // The three rightmost columns are rolling; the two on the left have not set off.
    const ms = leadMs + 100;
    const html = stat(ms);
    const columns = odometerColumns(theme, ms, "12,500");
    expect(columns.map((c) => c.blur > 0)).toEqual([false, false, true, true, true]);
    cells(html).forEach((column, i) => {
      const blur = Math.round(columns[i]!.blur * 100) / 100;
      if (blur === 0) return expect(column.filter).toBeUndefined();
      expect(html).toMatch(new RegExp(`<filter id="${column.filter}"[^>]*><feGaussianBlur stdDeviation="0 ${blur}"`));
    });
  });

  it("does not set rolling digits or separators as text: they are drawn, and the number is its label", () => {
    const html = stat(leadMs + 300);
    expect(shownNumber(html)).toBe("+");
    expect(html).toContain('data-odometer-glyph=","');
    expect(html).toContain('aria-label="12,500+"');
    expect(html).toContain("<style>[data-odometer-glyph]::before{content:attr(data-odometer-glyph)}</style>");
  });

  it("sets the landed number as plain text in tabular figures", () => {
    const html = stat(timing.landMs);
    expect(shownNumber(html)).toBe("12,500+");
    expect(html).not.toContain("data-odometer-column");
    expect(html).not.toContain("<style>");
    expect(html).toMatch(/<h1 [^>]*tabular-nums/);
  });
});

describe("BigNumber: the bar fills in the same window", () => {
  const fill = (ms: number) => styleNumber(stat(ms), "data-bar-fill", "width");
  const track = (ms: number) => styleNumber(stat(ms), "data-bar-track", "width");

  it("is empty until the roll starts and full as the number lands", () => {
    const full = track(0);
    expect(full).toBeGreaterThan(0);
    expect(full).toBeLessThanOrEqual(contentArea(theme, "9:16").width);
    expect(fill(0)).toBe(0);
    expect(fill(leadMs)).toBe(0);
    const window = timing.landMs - timing.startMs;
    for (const ms of [leadMs + 100, leadMs + 500, timing.landMs - 50]) {
      expect(fill(ms)).toBeCloseTo(full * expo((ms - leadMs) / window), 1);
    }
    expect(fill(timing.landMs)).toBe(full);
    expect(fill(timing.landMs + 3000)).toBe(full);
  });

  it("fills in the accent over a quiet track", () => {
    const html = stat(leadMs + 500);
    expect(html).toMatch(new RegExp(`data-bar-track="" style="[^"]*background-color:${theme.colors.border}`));
    expect(html).toMatch(new RegExp(`data-bar-fill="" style="[^"]*background-color:${theme.colors.accent}`));
  });
});

describe("BigNumber: landing", () => {
  const scale = (ms: number) => {
    const m = /<h1 [^>]*transform:scale\(([\d.]+)\)/.exec(stat(ms));
    return m === null ? 1 : parseFloat(m[1]!);
  };
  const unit = (ms: number) => styleNumber(stat(ms), "data-unit", "opacity");

  it("pops 1.0 -> 1.04 -> 1.0 as it lands, on the pop token", () => {
    expect(scale(timing.landMs - 1)).toBe(1);
    expect(scale(timing.landMs)).toBe(1);
    for (const ms of [40, 100, 200, 300]) expect(scale(timing.landMs + ms)).toBeCloseTo(1 + (pop.scale - 1) * pulse(pop, ms), 4);
    expect(scale(timing.landMs + pop.ms / 2)).toBeCloseTo(1.04, 6);
    expect(scale(timing.landMs + pop.ms)).toBe(1);
    expect(scale(timing.landMs + 3000)).toBe(1);
  });

  it("fades the unit in 150 ms after the landing", () => {
    expect(unit(0)).toBe(0);
    expect(unit(timing.landMs)).toBe(0);
    expect(unit(timing.unitMs)).toBe(0);
    const fast = theme.motion["fx.fast"];
    expect(unit(timing.unitMs + fast.ms / 2)).toBeCloseTo(fade(fast, fast.ms / 2), 3);
    expect(unit(timing.unitMs + fast.ms)).toBe(1);
  });

  it("keeps the rolling digits centered, then opens the unit's room as it fades in", () => {
    const room = (ms: number) => {
      const m = /data-unit="" style="[^"]*width:calc-size\(max-content, size \* ([\d.]+)\)/.exec(stat(ms));
      if (m === null) throw new Error(`no unit width at ${ms} ms`);
      return parseFloat(m[1]!);
    };
    const { enter } = theme.motion;
    expect(room(0)).toBe(0);
    expect(room(timing.unitMs)).toBe(0);
    expect(room(timing.unitMs + enter.ms / 3)).toBeGreaterThan(0.5);
    expect(room(timing.unitMs + enter.ms)).toBe(1);
    expect(room(timing.unitMs + 4000)).toBe(1);
  });

  it("shines across the number once, as it lands", () => {
    const middle = (ms: number) => {
      const html = stat(ms);
      const number = /data-number="" style="([^"]*)"/.exec(html)?.[1] ?? "";
      if (!number.includes("background-clip:text")) return undefined;
      return parseFloat(/rgba\(255, 255, 255, 0.35\) calc\(50% \+ (-?[\d.]+)px\)/.exec(number)![1]!);
    };
    expect(middle(timing.landMs - 1)).toBeUndefined();
    const crossing = [0, 200, 400, 600, shine.ms - 1].map((ms) => middle(timing.landMs + ms)!);
    for (let i = 1; i < crossing.length; i++) expect(crossing[i]!).toBeGreaterThan(crossing[i - 1]!);
    expect(crossing[0]).toBeLessThan(0);
    expect(crossing.at(-1)).toBeGreaterThan(0);
    for (const ms of [shine.ms, shine.ms + 1, 2 * shine.ms, 6000]) expect(middle(timing.landMs + ms), `${ms} ms after landing`).toBeUndefined();
    // The digits read as the final value all the while.
    expect(shownNumber(stat(timing.landMs + 400))).toBe("12,500+");
  });

  it("settles: nothing changes once the shine has crossed", () => {
    const settled = stat(timing.landMs + shine.ms);
    expect(stat(timing.landMs + shine.ms + 1000)).toBe(settled);
    expect(stat(NOMINAL_SCENE_MS)).toBe(settled);
  });
});
