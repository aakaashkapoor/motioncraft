import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, captionBand, fontSize, neutralTheme, safeArea, safeZones, type Aspect } from "../src/index";
import { Caption, TitleCard, captionLimits, kit, pageCaption, titleCardStep } from "../src/kit";

interface Box {
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Reads the root element's inline style back out of server-rendered HTML. */
function rootBox(html: string): Box {
  const style = /^<[a-z]+[^>]*?style="([^"]*)"/.exec(html)?.[1];
  if (style === undefined) throw new Error(`no root style in ${html}`);
  const decls = new Map(
    style.split(";").map((d) => {
      const i = d.indexOf(":");
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as const;
    }),
  );
  const num = (key: string): number => {
    const value = decls.get(key);
    if (value === undefined) throw new Error(`root style has no ${key}: ${style}`);
    return parseFloat(value);
  };
  return { opacity: num("opacity"), x: num("left"), y: num("top"), width: num("width"), height: num("height") };
}

function expectInsideSafeArea(box: Box, aspect: Aspect): void {
  const safe = safeArea(aspect);
  expect(box.x).toBeGreaterThanOrEqual(safe.x);
  expect(box.y).toBeGreaterThanOrEqual(safe.y);
  expect(box.x + box.width).toBeLessThanOrEqual(safe.x + safe.width);
  expect(box.y + box.height).toBeLessThanOrEqual(safe.y + safe.height);
}

const PROGRESSES = [0, 0.5, 1] as const;
const cases = ASPECTS.flatMap((aspect) => PROGRESSES.map((progress) => [aspect, progress] as const));

describe("kit registry", () => {
  it("maps storyboard component names to components", () => {
    expect(kit.TitleCard).toBe(TitleCard);
    expect(kit.Caption).toBe(Caption);
  });
});

describe("TitleCard", () => {
  const render = (aspect: Aspect, progress: number, extra: { subtitle?: string; kicker?: string } = {}) =>
    renderToStaticMarkup(
      <TitleCard progress={progress} theme={neutralTheme} aspect={aspect} title="Ship it" {...extra} />,
    );

  it.each(cases)("renders title, subtitle and kicker inside the safe area (%s, progress %s)", (aspect, progress) => {
    const html = render(aspect, progress, { subtitle: "A short subtitle", kicker: "Launch" });
    expect(html).toContain("Ship it");
    expect(html).toContain("A short subtitle");
    expect(html).toContain("Launch");
    expectInsideSafeArea(rootBox(html), aspect);
  });

  it.each(ASPECTS)("fades in, holds and fades out (%s)", (aspect) => {
    expect(rootBox(render(aspect, 0)).opacity).toBeCloseTo(0, 3);
    expect(rootBox(render(aspect, 0.5)).opacity).toBeCloseTo(1, 3);
    expect(rootBox(render(aspect, 1)).opacity).toBeCloseTo(0, 3);
  });

  it("is fully in by 20% and still in at 90%", () => {
    expect(rootBox(render("9:16", 0.2)).opacity).toBeCloseTo(1, 3);
    expect(rootBox(render("9:16", 0.9)).opacity).toBeCloseTo(1, 3);
    expect(rootBox(render("9:16", 0.1)).opacity).toBeGreaterThan(0);
    expect(rootBox(render("9:16", 0.1)).opacity).toBeLessThan(1);
  });

  it("rises into place", () => {
    const offset = (progress: number) => {
      const m = /translateY\((-?[\d.]+)px\)/.exec(render("9:16", progress));
      return m?.[1] === undefined ? 0 : parseFloat(m[1]);
    };
    expect(offset(0)).toBeGreaterThan(0);
    expect(offset(0.5)).toBe(0);
  });

  it("leaves out subtitle and kicker when not given", () => {
    const html = render("16:9", 0.5);
    expect(html.match(/<(h1|p)\b/g)).toEqual(["<h1"]);
  });

  it("escapes text", () => {
    const html = render("9:16", 0.5, { kicker: "<b>" });
    expect(html).toContain("&lt;b&gt;");
  });

  const longTitle =
    "My owner taught his coding robot to accept a reviewer before building my video engine, and then to check every frame twice";
  const titleSize = (html: string): number => {
    const m = /<h1 style="[^"]*font-size:(\d+(?:\.\d+)?)px/.exec(html);
    if (m?.[1] === undefined) throw new Error(`no h1 font-size in ${html}`);
    return parseFloat(m[1]);
  };
  const renderTitle = (aspect: Aspect, title: string) =>
    renderToStaticMarkup(
      <TitleCard progress={0.5} theme={neutralTheme} aspect={aspect} title={title} subtitle="A short subtitle" kicker="Launch" />,
    );

  it.each(ASPECTS)("keeps short titles at the display size (%s)", (aspect) => {
    expect(titleSize(renderTitle(aspect, "Ship it"))).toBe(fontSize(neutralTheme, "display", aspect));
    expect(titleSize(render(aspect, 0.5))).toBe(fontSize(neutralTheme, "display", aspect));
  });

  it("shrinks a long title to a smaller step at 9:16 and still renders the subtitle", () => {
    const html = renderTitle("9:16", longTitle);
    expect(titleSize(html)).toBeLessThan(titleSize(renderTitle("9:16", "Ship it")));
    expect(titleCardStep(neutralTheme, "9:16", { title: longTitle, subtitle: "A short subtitle", kicker: "Launch" })).not.toBe(
      "display",
    );
    expect(html).toContain("A short subtitle");
    expect(html).toContain("Launch");
  });

  it("keeps the smallest step when nothing fits, without clipping", () => {
    const huge = Array.from({ length: 40 }, () => longTitle).join(" ");
    expect(titleCardStep(neutralTheme, "9:16", { title: huge })).toBe("subtitle");
    const html = renderTitle("9:16", huge);
    expect(titleSize(html)).toBe(fontSize(neutralTheme, "subtitle", "9:16"));
    expect(html).toContain("A short subtitle");
    expect(html).not.toContain("overflow:hidden");
  });

  it.each(ASPECTS)("ends above the caption band (%s)", (aspect) => {
    const band = captionBand(neutralTheme, aspect);
    for (const title of ["Ship it", longTitle]) {
      const box = rootBox(renderTitle(aspect, title));
      expect(box.y + box.height).toBeLessThanOrEqual(band.y);
      expectInsideSafeArea(box, aspect);
    }
  });
});

describe("pageCaption", () => {
  const limits = { maxCharsPerLine: 20, maxLines: 2 };
  const words = (text: string) => text.split(/\s+/).filter(Boolean);
  const wrap = (page: string, max: number) => {
    const lines: string[] = [];
    for (const word of words(page)) {
      const last = lines.at(-1);
      if (last !== undefined && last.length + 1 + word.length <= max) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    }
    return lines;
  };
  const texts = [
    "",
    "Short.",
    "The quick brown fox jumps over the lazy dog while the cat watches from the window sill.",
    "First, we load the data. Then we clean it; finally, we chart it and ship the result to everyone.",
    "Supercalifragilisticexpialidocious is a word that does not fit on one line at all.",
    "  extra   spaces\nand\tnewlines   everywhere  ",
  ];

  it.each(texts)("keeps every word exactly once, in order, unsplit (%j)", (text) => {
    const pages = pageCaption(text, limits);
    expect(pages.flatMap(words)).toEqual(words(text));
  });

  it.each(texts)("fits each page in the limits (%j)", (text) => {
    for (const page of pageCaption(text, limits)) {
      const lines = wrap(page, limits.maxCharsPerLine);
      expect(lines.length).toBeLessThanOrEqual(limits.maxLines);
      // A single word longer than a line can only be given a line of its own.
      for (const line of lines) {
        if (words(line).length > 1) expect(line.length).toBeLessThanOrEqual(limits.maxCharsPerLine);
      }
    }
  });

  it("returns no pages for empty text and one page for text that fits", () => {
    expect(pageCaption("   ", limits)).toEqual([]);
    expect(pageCaption("Hello there world", limits)).toEqual(["Hello there world"]);
  });

  it("prefers ending a page at a sentence break", () => {
    const pages = pageCaption("We load the data first. Then we clean it and chart it.", limits);
    expect(pages[0]).toBe("We load the data first.");
  });

  it("prefers ending a page at a clause break over the middle of a clause", () => {
    const pages = pageCaption("After loading the data, we clean it and chart it for you.", limits);
    expect(pages[0]).toBe("After loading the data,");
  });

  it("does not make a tiny page just to reach a break", () => {
    const pages = pageCaption("Yes, we load all of the data and then clean it up nicely.", limits);
    expect(pages[0]).not.toBe("Yes,");
  });

  it("rejects limits below one", () => {
    expect(() => pageCaption("a b", { maxCharsPerLine: 0, maxLines: 2 })).toThrow();
    expect(() => pageCaption("a b", { maxCharsPerLine: 10, maxLines: 0 })).toThrow();
  });
});

describe("Caption", () => {
  const text = "Captions come from the narration text and are burned in.";
  const render = (aspect: Aspect, progress: number, caption = text) =>
    renderToStaticMarkup(<Caption progress={progress} theme={neutralTheme} aspect={aspect} text={caption} />);
  /** The visible caption text, read back out of server-rendered HTML. */
  const shown = (html: string) => /<p[^>]*>([^<]*)<\/p>/.exec(html)?.[1] ?? "";

  it.each(cases)("renders caption text inside the safe area (%s, progress %s)", (aspect, progress) => {
    const html = render(aspect, progress);
    expect(shown(html).length).toBeGreaterThan(0);
    expect(text).toContain(shown(html));
    expectInsideSafeArea(rootBox(html), aspect);
  });

  it.each(ASPECTS)("sits low in the safe area, on the profile's caption bottom (%s)", (aspect) => {
    const box = rootBox(render(aspect, 0.5));
    const safe = safeArea(aspect);
    expect(box.y + box.height).toBeCloseTo(safeZones(aspect).captionBottom, 0);
    expect(box.y + box.height).toBeLessThanOrEqual(safe.y + safe.height);
    expect(box.y).toBeGreaterThan(safe.y + safe.height / 2);
  });

  it.each(ASPECTS)("fills the shared caption band (%s)", (aspect) => {
    const box = rootBox(render(aspect, 0.5));
    const band = captionBand(neutralTheme, aspect);
    expect({ x: box.x, y: box.y, width: box.width, height: box.height }).toEqual(band);
  });

  it.each(ASPECTS)("is hidden at the start and visible mid-scene (%s)", (aspect) => {
    expect(rootBox(render(aspect, 0)).opacity).toBeCloseTo(0, 3);
    expect(rootBox(render(aspect, 0.5)).opacity).toBeCloseTo(1, 3);
  });

  it("draws on a solid plate and never truncates with an ellipsis", () => {
    const html = render("9:16", 0.5);
    expect(html).not.toContain("line-clamp");
    expect(html).not.toContain("ellipsis");
    expect(html).toContain(`background-color:${neutralTheme.colors.ground}`);
    expect(html).toContain(`color:${neutralTheme.colors.text}`);
  });

  describe("long narration", () => {
    const sentence =
      "Every week our team ships small changes, measures how people use them, and keeps what works " +
      "while quietly removing the parts that nobody seems to need or use any more.";

    it("is a 30-word sentence", () => {
      expect(sentence.split(" ")).toHaveLength(30);
    });

    it("pages into 2+ pages at 9:16", () => {
      expect(pageCaption(sentence, captionLimits(neutralTheme, "9:16")).length).toBeGreaterThanOrEqual(2);
    });

    it.each(ASPECTS)("shows different pages early and late in the scene (%s)", (aspect) => {
      const early = shown(render(aspect, 0.1, sentence));
      const late = shown(render(aspect, 0.9, sentence));
      expect(early).not.toBe(late);
      expect(sentence.startsWith(early)).toBe(true);
      expect(sentence.endsWith(late)).toBe(true);
    });

    it.each(ASPECTS)("shows every word over the scene (%s)", (aspect) => {
      const pages = pageCaption(sentence, captionLimits(neutralTheme, aspect));
      const seen = new Set<string>();
      for (let i = 0; i <= 100; i++) seen.add(shown(render(aspect, i / 100, sentence)));
      expect([...seen]).toEqual(pages);
    });
  });
});
