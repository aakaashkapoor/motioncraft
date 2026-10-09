import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  CodeWindow,
  TerminalWindow,
  contentArea,
  contrastRatio,
  darkTheme,
  highlightBand,
  highlightCode,
  kit,
  lightTheme,
  neutralTheme,
  syntaxColors,
  terminalTiming,
  type Aspect,
  type TerminalLine,
} from "../src/index";

/** Parses an inline `style="..."` attribute into a map. */
function parseStyle(style: string): Map<string, string> {
  return new Map(
    style.split(";").map((d) => {
      const i = d.indexOf(":");
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as const;
    }),
  );
}

/** Root element's position and size, from server-rendered HTML. */
function rootBox(html: string) {
  const style = /^<[a-z]+[^>]*?style="([^"]*)"/.exec(html)?.[1];
  if (style === undefined) throw new Error(`no root style in ${html}`);
  const decls = parseStyle(style);
  const num = (key: string) => parseFloat(decls.get(key) ?? "NaN");
  return { opacity: num("opacity"), x: num("left"), y: num("top"), width: num("width"), height: num("height") };
}

/** Elements carrying `attr`, with the attribute value, inline style and inner HTML up to the next tag close. */
function marked(html: string, attr: string): Array<{ value: string; style: Map<string, string>; inner: string }> {
  const re = new RegExp(`<([a-z]+)[^>]*?${attr}="([^"]*)"[^>]*?style="([^"]*)"[^>]*>(.*?)</\\1>`, "g");
  return [...html.matchAll(re)].map((m) => ({ value: m[2]!, style: parseStyle(m[3]!), inner: m[4]! }));
}

const stripTags = (html: string) =>
  html.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function expectInsideContentArea(html: string, aspect: Aspect) {
  const box = rootBox(html);
  const area = contentArea(neutralTheme, aspect);
  expect(box.x).toBeGreaterThanOrEqual(area.x);
  expect(box.y).toBeGreaterThanOrEqual(area.y);
  expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
  expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
}

const LINES: TerminalLine[] = [
  { prompt: true, text: "npm install motioncraft" },
  { text: "added 93 packages in 3s" },
  { prompt: true, text: "npx motioncraft render video.json" },
  { text: "rendered 240 frames" },
  { text: "wrote out/video.mp4" },
];

const terminal = (progress: number, aspect: Aspect = "9:16", extra: { lines?: TerminalLine[]; shareId?: string; title?: string } = {}) =>
  renderToStaticMarkup(<TerminalWindow progress={progress} theme={lightTheme} aspect={aspect} lines={LINES} title="zsh" {...extra} />);

/** The text each terminal line shows, by line index; lines not shown yet are absent. */
function terminalTexts(html: string): Map<number, string> {
  return new Map(marked(html, "data-terminal-text").map((m) => [Number(m.value), stripTags(m.inner)]));
}

function caret(html: string) {
  const carets = marked(html, "data-terminal-caret");
  expect(carets).toHaveLength(1);
  return { line: Number(carets[0]!.value), opacity: parseFloat(carets[0]!.style.get("opacity") ?? "NaN") };
}

describe("TerminalWindow", () => {
  it("is registered in the kit", () => {
    expect(kit.TerminalWindow).toBe(TerminalWindow);
  });

  it("draws window chrome with traffic lights and the title", () => {
    const html = terminal(0.5);
    expect(html).toContain("zsh");
    expect(html.match(/data-light=/g)).toHaveLength(3);
  });

  it("schedules prompt lines in order, with outputs appearing the instant the command before them ends", () => {
    const timing = terminalTiming(LINES);
    expect(timing).toHaveLength(LINES.length);
    for (let i = 1; i < timing.length; i++) expect(timing[i]!.start).toBeGreaterThanOrEqual(timing[i - 1]!.end);
    expect(timing[0]!.end).toBeGreaterThan(timing[0]!.start);
    expect(timing[1]!.start).toBe(timing[1]!.end);
    expect(timing[3]!.start).toBe(timing[4]!.start);
    expect(timing.at(-1)!.end).toBeLessThanOrEqual(0.75);
    // Longer commands take longer to type.
    expect(timing[2]!.end - timing[2]!.start).toBeGreaterThan(timing[0]!.end - timing[0]!.start);
  });

  it("types prompt lines character by character", () => {
    const [first] = terminalTiming(LINES);
    const seen: string[] = [];
    for (let i = 1; i < 10; i++) {
      const progress = first!.start + ((first!.end - first!.start) * i) / 10;
      const text = terminalTexts(terminal(progress)).get(0) ?? "";
      expect(LINES[0]!.text.startsWith(text)).toBe(true);
      seen.push(text);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]!.length).toBeGreaterThanOrEqual(seen[i - 1]!.length);
    expect(seen[0]!.length).toBeLessThan(seen.at(-1)!.length);
    expect(seen.at(-1)!.length).toBeLessThan(LINES[0]!.text.length);
    expect(terminalTexts(terminal(first!.end + 0.001)).get(0)).toBe(LINES[0]!.text);
  });

  it("shows output lines only after the command before them has been typed", () => {
    const timing = terminalTiming(LINES);
    const before = terminalTexts(terminal(timing[0]!.end - 0.01));
    expect(before.has(1)).toBe(false);
    const after = terminalTexts(terminal(timing[1]!.start + 0.001));
    expect(after.get(1)).toBe(LINES[1]!.text);
    expect(after.has(2)).toBe(true); // the next prompt line has started (perhaps empty)
    expect(after.has(3)).toBe(false);
    const end = terminalTexts(terminal(0.8));
    LINES.forEach((line, i) => expect(end.get(i)).toBe(line.text));
  });

  it("keeps a solid caret at the end of the line being typed", () => {
    const timing = terminalTiming(LINES);
    const typing = timing[2]!.start + (timing[2]!.end - timing[2]!.start) / 2;
    const c = caret(terminal(typing));
    expect(c.line).toBe(2);
    expect(c.opacity).toBe(1);
    const html = terminal(typing);
    expect(html.indexOf("data-terminal-caret")).toBeGreaterThan(html.indexOf('data-terminal-text="2"'));
  });

  it("blinks the caret smoothly on a fresh prompt once everything has run", () => {
    const opacities = [0.8, 0.81, 0.82, 0.83, 0.84, 0.85, 0.86, 0.87].map((p) => caret(terminal(p)));
    for (const c of opacities) expect(c.line).toBe(LINES.length);
    const values = opacities.map((c) => c.opacity);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.3);
    for (const v of values) expect(v).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < values.length; i++) expect(Math.abs(values[i]! - values[i - 1]!)).toBeLessThan(0.5);
  });

  it("prefixes prompt lines with a prompt marker and leaves output lines bare", () => {
    const html = terminal(0.8);
    expect(html.match(/data-terminal-prompt=/g)).toHaveLength(LINES.filter((l) => l.prompt).length + 1);
  });

  it.each(ASPECTS.flatMap((aspect) => [0, 0.5, 1].map((p) => [aspect, p] as const)))(
    "lays out inside the content area (%s, progress %s)",
    (aspect, progress) => expectInsideContentArea(terminal(progress, aspect), aspect),
  );

  it.each(ASPECTS)("fades in, holds and fades out (%s)", (aspect) => {
    expect(rootBox(terminal(0, aspect)).opacity).toBeCloseTo(0, 3);
    expect(rootBox(terminal(0.5, aspect)).opacity).toBeCloseTo(1, 3);
    expect(rootBox(terminal(1, aspect)).opacity).toBeCloseTo(0, 3);
  });

  it("keeps the window the same size while lines appear", () => {
    expect(rootBox(terminal(0.1)).height).toBe(rootBox(terminal(0.9)).height);
  });

  it("uses the theme's mono font", () => {
    expect(terminal(0.5)).toContain(lightTheme.fonts.mono.replace(/"/g, "&quot;"));
  });

  it("supports shareId", () => {
    expect(terminal(0.5, "9:16", { shareId: "term" })).toContain('data-share-id="term"');
    expect(terminal(0.5)).not.toContain("data-share-id");
  });

  it("escapes text", () => {
    expect(terminal(0.9, "9:16", { lines: [{ text: "<b>" }] })).toContain("&lt;b&gt;");
  });
});

const CODE = [
  'import { render } from "motioncraft";',
  "",
  "// Render every frame.",
  "export async function main(): Promise<number> {",
  '  const frames = await render("video.json");',
  "  return frames.length * 2;",
  "}",
].join("\n");

const code = (
  progress: number,
  aspect: Aspect = "9:16",
  extra: { highlightLines?: number[]; reveal?: boolean; shareId?: string; language?: string; code?: string } = {},
) =>
  renderToStaticMarkup(
    <CodeWindow progress={progress} theme={lightTheme} aspect={aspect} code={CODE} language="typescript" title="main.ts" {...extra} />,
  );

function codeLines(html: string) {
  return marked(html, "data-code-line").map((m) => ({
    line: Number(m.value),
    opacity: parseFloat(m.style.get("opacity") ?? "1"),
    text: stripTags(m.inner.replace(/<span[^>]*data-line-number[^>]*>.*?<\/span>/, "")),
  }));
}

/** Text and color of each token span. */
function tokens(html: string): Array<{ text: string; color: string | undefined }> {
  return marked(html, "data-token").map((m) => ({ text: stripTags(m.inner), color: m.style.get("color") }));
}

describe("highlightCode", () => {
  it("splits code into lines of role-tagged tokens", () => {
    const lines = highlightCode(CODE, "typescript");
    expect(lines).toHaveLength(CODE.split("\n").length);
    lines.forEach((line, i) => expect(line.map((t) => t.text).join("")).toBe(CODE.split("\n")[i]));
    const roleOf = (text: string) => lines.flat().find((t) => t.text === text)?.role;
    expect(roleOf("import")).toBe("keyword");
    expect(roleOf('"motioncraft"')).toBe("string");
    expect(roleOf("// Render every frame.")).toBe("comment");
    expect(roleOf("2")).toBe("number");
    expect(roleOf("main")).toBe("function");
  });

  it("keeps multi-line tokens split per line", () => {
    const lines = highlightCode("/* a\nb */ x", "javascript");
    expect(lines).toHaveLength(2);
    expect(lines[0]![0]).toEqual({ text: "/* a", role: "comment" });
    expect(lines[1]![0]).toEqual({ text: "b */", role: "comment" });
  });

  it.each(["javascript", "typescript", "tsx", "jsx", "json", "bash", "python", "css", "html", "yaml", "rust", "go", "sql", "diff"])(
    "knows %s",
    (language) => {
      expect(highlightCode("x", language)).toHaveLength(1);
    },
  );

  it("falls back to plain text for an unknown language", () => {
    expect(highlightCode("if x", "klingon")).toEqual([[{ text: "if x", role: "plain" }]]);
  });
});

describe("syntaxColors", () => {
  it.each([lightTheme, darkTheme, neutralTheme])("gives readable, distinct colors on the $name theme", (theme) => {
    const colors = syntaxColors(theme);
    for (const color of Object.values(colors)) expect(contrastRatio(color, theme.colors.surface)).toBeGreaterThanOrEqual(4.5);
    // The keyword is the accent, deepened only when the accent does not read on the window (the light orange).
    const reads = contrastRatio(theme.colors.accent, theme.colors.surface) >= 4.5 && contrastRatio(theme.colors.accent, highlightBand(theme)) >= 4.5;
    expect(colors.keyword === theme.colors.accent).toBe(reads);
    expect(new Set([colors.keyword, colors.string, colors.number, colors.plain, colors.comment]).size).toBe(5);
  });
});

describe("CodeWindow", () => {
  it("is registered in the kit", () => {
    expect(kit.CodeWindow).toBe(CodeWindow);
  });

  it("draws window chrome, every line and the title", () => {
    const html = code(0.5);
    expect(html).toContain("main.ts");
    expect(html.match(/data-light=/g)).toHaveLength(3);
    const lines = codeLines(html);
    expect(lines.map((l) => l.text)).toEqual(CODE.split("\n"));
  });

  it("colors tokens by syntax role", () => {
    const colors = syntaxColors(lightTheme);
    const all = tokens(code(0.5));
    const colorOf = (text: string) => all.find((t) => t.text === text)?.color;
    expect(colorOf("import")).toBe(colors.keyword);
    expect(colorOf('"motioncraft"')).toBe(colors.string);
    expect(colorOf("// Render every frame.")).toBe(colors.comment);
    expect(colorOf("2")).toBe(colors.number);
    expect(colorOf("import")).not.toBe(colorOf('"motioncraft"'));
  });

  it("dims every line but the highlighted ones", () => {
    const lines = codeLines(code(0.8, "9:16", { highlightLines: [4, 5] }));
    for (const line of lines) {
      if (line.line === 4 || line.line === 5) expect(line.opacity).toBe(1);
      else expect(line.opacity).toBeLessThan(0.5);
    }
    expect(code(0.8, "9:16", { highlightLines: [4, 5] })).toMatch(/data-code-highlight="4"/);
    for (const line of codeLines(code(0.8))) expect(line.opacity).toBe(1);
  });

  it("dims gradually, after the code has arrived", () => {
    const early = codeLines(code(0.05, "9:16", { highlightLines: [4] }));
    for (const line of early) expect(line.opacity).toBe(1);
  });

  it("reveals lines one by one when asked", () => {
    const shown = (p: number) => codeLines(code(p, "9:16", { reveal: true })).filter((l) => l.text !== "" && l.opacity > 0).length;
    expect(shown(0.05)).toBeLessThan(3);
    expect(shown(0.3)).toBeGreaterThan(shown(0.1));
    expect(shown(0.7)).toBe(CODE.split("\n").filter(Boolean).length);
    // Without reveal, every line is there from the start.
    expect(codeLines(code(0.05)).filter((l) => l.text !== "")).toHaveLength(CODE.split("\n").filter(Boolean).length);
  });

  it("numbers lines", () => {
    const numbers = marked(code(0.5), "data-line-number").map((m) => stripTags(m.inner));
    expect(numbers).toEqual(CODE.split("\n").map((_, i) => String(i + 1)));
  });

  it.each(ASPECTS.flatMap((aspect) => [0, 0.5, 1].map((p) => [aspect, p] as const)))(
    "lays out inside the content area (%s, progress %s)",
    (aspect, progress) => expectInsideContentArea(code(progress, aspect), aspect),
  );

  it.each(ASPECTS)("shrinks the type so long lines fit the window (%s)", (aspect) => {
    const size = (html: string) => parseFloat(/font-size:([\d.]+)px/.exec(html.slice(html.indexOf("data-code-line")))?.[1] ?? "NaN");
    const long = "const x = " + "a".repeat(80) + ";";
    expect(size(code(0.5, aspect, { code: long }))).toBeLessThan(size(code(0.5, aspect, { code: "x" })));
  });

  it("uses the theme's mono font", () => {
    expect(code(0.5)).toContain(lightTheme.fonts.mono.replace(/"/g, "&quot;"));
  });

  it("supports shareId", () => {
    expect(code(0.5, "16:9", { shareId: "editor" })).toContain('data-share-id="editor"');
  });

  it("escapes code", () => {
    expect(code(0.5, "9:16", { code: "<div>", language: "html" })).toContain("&lt;");
    expect(code(0.5, "9:16", { code: "<b>x</b>", language: "klingon" })).not.toContain("<b>");
  });
});
