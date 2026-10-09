// Design v3, sections A-C: one type ramp (the B table), named weights and the
// 8 px spacing scale as theme tokens, and a kit that reads every size, weight,
// tracking and line height from them.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { checkStoryboard, formatIssue, formatProblem, runChecks } from "../src/checks";
import * as api from "../src/index";
import {
  ASPECTS,
  BigNumber,
  Caption,
  Card,
  CardRow,
  FlowDiagram,
  Section,
  StepList,
  TitleCard,
  TYPE_ROLES,
  darkTheme,
  fontSize,
  lightTheme,
  neutralTheme,
  rampSizes,
  resolveTheme,
  typeCss,
  typeSpec,
  validateStoryboard,
  type Aspect,
  type Theme,
  type TypeRole,
} from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";

/** Design v3, table B: [9:16 px, 16:9 px, weight, tracking em, line height]. */
const B_TABLE: Record<TypeRole, [number, number, number, number, number]> = {
  numeral: [240, 220, 700, -0.04, 0.9],
  hero: [152, 140, 800, -0.035, 0.95],
  display: [120, 112, 800, -0.03, 1.0],
  headline: [96, 88, 700, -0.025, 1.05],
  title: [76, 72, 700, -0.02, 1.1],
  subtitle: [60, 56, 600, -0.01, 1.15],
  body: [48, 44, 500, 0, 1.3],
  label: [40, 36, 500, 0, 1.3],
  eyebrow: [32, 28, 600, 0.08, 1.2],
  mono: [40, 36, 450, 0, 1.45],
};

const THEMES: Array<[string, Theme]> = [
  ["light", lightTheme],
  ["dark", darkTheme],
  ["neutral", neutralTheme],
];

describe("the type ramp (design v3, table B)", () => {
  it("has exactly the B-table steps, largest first, then mono", () => {
    expect([...TYPE_ROLES]).toEqual(["numeral", "hero", "display", "headline", "title", "subtitle", "body", "label", "eyebrow", "mono"]);
  });

  it.each(THEMES)("%s: every step has the B-table size, weight, tracking and line height in each aspect", (_, theme) => {
    for (const role of TYPE_ROLES) {
      const [tall, wide, weight, tracking, lineHeight] = B_TABLE[role];
      expect(theme.type[role]["9:16"], role).toEqual({ size: tall, weight, tracking, lineHeight });
      expect(theme.type[role]["16:9"], role).toEqual({ size: wide, weight, tracking, lineHeight });
    }
  });

  it("sets 16:9 at about 0.92x of 9:16, never the old 0.8x", () => {
    for (const role of TYPE_ROLES) {
      const ratio = lightTheme.type[role]["16:9"].size / lightTheme.type[role]["9:16"].size;
      expect(ratio, role).toBeGreaterThan(0.85);
      expect(ratio, role).toBeLessThan(1);
    }
  });

  it("only uses weights that are bundled and in the system (400-800, mono 450)", () => {
    for (const role of TYPE_ROLES) {
      for (const aspect of ASPECTS) expect([400, 450, 500, 600, 700, 800]).toContain(lightTheme.type[role][aspect].weight);
    }
  });

  it("has no second type system: no typeScale, no fontScale", () => {
    for (const [, theme] of THEMES) expect(theme).not.toHaveProperty("typeScale");
    expect(api).not.toHaveProperty("fontScale");
  });

  it("reads specs and sizes from the ramp", () => {
    expect(typeSpec(lightTheme, "headline", "16:9")).toBe(lightTheme.type.headline["16:9"]);
    expect(fontSize(lightTheme, "title", "9:16")).toBe(76);
    expect(fontSize(lightTheme, "title", "16:9")).toBe(72);
    expect(rampSizes(lightTheme, "9:16")).toEqual([240, 152, 120, 96, 76, 60, 48, 40, 32]);
    expect(rampSizes(lightTheme, "16:9")).toEqual([220, 140, 112, 88, 72, 56, 44, 36, 28]);
  });

  it("turns a spec into CSS", () => {
    expect(typeCss(lightTheme.type.eyebrow["9:16"])).toEqual({ fontSize: 32, fontWeight: 600, letterSpacing: "0.08em", lineHeight: 1.2 });
    expect(typeCss(lightTheme.type.body["16:9"])).toEqual({ fontSize: 44, fontWeight: 500, letterSpacing: "0em", lineHeight: 1.3 });
  });
});

describe("named weights and the spacing scale", () => {
  it.each(THEMES)("%s: names the five weights the system uses", (_, theme) => {
    expect(theme.weights).toEqual({ regular: 400, medium: 500, semibold: 600, bold: 700, heavy: 800 });
  });

  it.each(THEMES)("%s: spaces on the 8 px scale 8, 16, 24, 32, 48, 64, 96, 128", (_, theme) => {
    expect(theme.spacing).toEqual({ xxs: 8, xs: 16, sm: 24, md: 32, lg: 48, xl: 64, xxl: 96, xxxl: 128 });
  });
});

function storyboard(themeOverrides: Record<string, unknown>) {
  return validateStoryboard({
    title: "T",
    aspect: "9:16",
    themeOverrides,
    scenes: [{ id: "a", component: "TitleCard", props: { title: "A" }, durationMs: 1000 }],
  });
}

describe("theme overrides on the ramp", () => {
  it("deep-merges a step, a weight and a spacing token over the theme", () => {
    const result = storyboard({ type: { numeral: { "16:9": { size: 200 } }, eyebrow: { "9:16": { tracking: 0 } } }, weights: { bold: 800 }, spacing: { lg: 56 } });
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const theme = resolveTheme(result.storyboard);
    expect(theme.type.numeral["16:9"]).toEqual({ ...lightTheme.type.numeral["16:9"], size: 200 });
    expect(theme.type.numeral["9:16"]).toEqual(lightTheme.type.numeral["9:16"]);
    expect(theme.type.eyebrow["9:16"].tracking).toBe(0);
    expect(theme.weights.bold).toBe(800);
    expect(theme.spacing.lg).toBe(56);
  });

  it("rejects the old ramp roles and the deleted typeScale", () => {
    const result = storyboard({ type: { caption: { "9:16": { size: 40 } } }, typeScale: { body: 52 } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toMatch(/themeOverrides\.type: unknown field "caption"/);
      expect(result.errors.join("\n")).toMatch(/themeOverrides: unknown field "typeScale"/);
    }
  });

  it("a component follows an overridden step", () => {
    const result = storyboard({ type: { display: { "9:16": { size: 100, weight: 600 } } } });
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const theme = resolveTheme(result.storyboard);
    const html = renderToStaticMarkup(<TitleCard progress={0.5} theme={theme} aspect="9:16" title="Ship it" />);
    expect(html).toMatch(/<h1 [^>]*font-size:100px;font-weight:600/);
  });
});

const KIT = join(import.meta.dirname, "..", "src", "kit");

describe("the kit reads type from the ramp", () => {
  it("has no hard-coded font sizes, weights, tracking or line heights", async () => {
    const files = (await readdir(KIT)).filter((f) => /\.tsx?$/.test(f));
    const offenders: string[] = [];
    for (const file of files) {
      const lines = (await readFile(join(KIT, file), "utf8")).split(/\r?\n/);
      lines.forEach((line, i) => {
        // A number anywhere in the value: a literal, or a multiple of another size.
        if (/\b(fontSize|fontWeight|letterSpacing|lineHeight)\s*:[^,}]*\d/.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        // The `font` shorthand and CSS-string styles carry sizes too.
        if (/\bfont\s*:\s*["'`]|font-(size|weight)\s*:/.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  /** Font sizes in rendered markup, in px. */
  const sizes = (html: string) => [...html.matchAll(/font-size:([\d.]+)px/g)].map((m) => parseFloat(m[1]!));

  const scenes = (aspect: Aspect, theme: Theme) => [
    <TitleCard progress={0.5} theme={theme} aspect={aspect} kicker="New" title="Videos from a prompt" subtitle="Rendered locally" />,
    <Caption progress={0.5} theme={theme} aspect={aspect} text="Every frame is drawn in code" />,
    <BigNumber progress={0.6} theme={theme} aspect={aspect} value={42} suffix="%" label="faster builds" />,
    <StepList progress={0.8} theme={theme} aspect={aspect} title="How" items={["Write", "Check", "Render"]} highlight={1} />,
    <Card progress={0.6} theme={theme} aspect={aspect} icon="zap" title="Fast" subtitle="Cached fonts" step={2} />,
    <CardRow progress={0.8} theme={theme} aspect={aspect} cards={[{ icon: "zap", title: "One" }, { icon: "box", title: "Two", subtitle: "More" }]} />,
    <FlowDiagram progress={0.6} theme={theme} aspect={aspect} nodes={["Prompt", "Plan", "Video"]} caption="Three steps" />,
    <Section progress={0.6} theme={theme} aspect={aspect} eyebrow="Why" headline="Made for agents" note="Checked first" content={{ component: "Card", props: { title: "Local" } }} />,
    <api.ChatWindow progress={0.9} theme={theme} aspect={aspect} channel="launch" sidebar={{ workspace: "Acme", channels: ["launch", "ops"] }} messages={[{ author: "Maya", time: "9:41", text: "Intro video?", badge: "BOT", reactions: [{ emoji: "+", count: 2 }] }]} />,
    <api.AppWindow progress={0.6} theme={theme} aspect={aspect} title="storyboard.json" />,
    <api.BrowserWindow progress={0.6} theme={theme} aspect={aspect} url="https://example.com" />,
  ];

  it.each(ASPECTS)("sets every text size from a ramp step (%s)", (aspect) => {
    const ramp = new Set(rampSizes(lightTheme, aspect));
    for (const element of scenes(aspect, lightTheme)) {
      for (const size of sizes(renderToStaticMarkup(element))) expect(ramp.has(size), `${size}px in ${element.type.name}`).toBe(true);
    }
  });

  it("balances headlines, captions and card titles, and sets numbers in tabular figures", () => {
    const render = (element: ReactElement) => renderToStaticMarkup(element);
    expect(render(<TitleCard progress={0.5} theme={lightTheme} aspect="9:16" title="Videos from a prompt" />)).toMatch(/<h1 [^>]*text-wrap:balance/);
    expect(render(<Section progress={0.5} theme={lightTheme} aspect="9:16" headline="Made for agents" />)).toMatch(/<h1 [^>]*text-wrap:balance/);
    expect(render(<Caption progress={0.5} theme={lightTheme} aspect="9:16" text="Every frame is code" />)).toMatch(/text-wrap:balance/);
    expect(render(<Card progress={0.5} theme={lightTheme} aspect="9:16" title="Fast" step={3} />)).toMatch(/text-wrap:balance[^"]*">Fast</);
    expect(render(<Card progress={0.5} theme={lightTheme} aspect="9:16" title="Fast" step={3} />)).toMatch(/tabular-nums[^"]*">3</);
    expect(render(<BigNumber progress={0.5} theme={lightTheme} aspect="9:16" value={42} />)).toMatch(/<h1 [^>]*tabular-nums/);
    expect(render(<StepList progress={0.9} theme={lightTheme} aspect="9:16" items={["a", "b"]} />)).toMatch(/tabular-nums[^"]*">1</);
  });
});

const FIXTURES: Record<Aspect, string> = { "9:16": "type-ramp.json", "16:9": "type-ramp-wide.json" };

describe("tests/fixtures/type-ramp (integration)", () => {
  for (const aspect of ASPECTS) {
    it(`passes every layer-1 check with no warning: all its text is on the ramp (${aspect})`, { timeout: 180_000 }, async (ctx) => {
      const result = validateStoryboard(JSON.parse(await readFile(join(import.meta.dirname, "fixtures", FIXTURES[aspect]), "utf8")));
      if (!result.ok) throw new Error(result.errors.join("\n"));
      const sb = result.storyboard;
      expect(sb.aspect).toBe(aspect);
      const theme = resolveTheme(sb);
      expect((await checkStoryboard(sb, { theme })).map(formatIssue)).toEqual([]);
      const checked = await runChecks({ storyboard: sb, theme, durations: estimateDurations(sb) }).catch((error: unknown) => {
        if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
        throw error;
      });
      expect(checked.problems.map(formatProblem)).toEqual([]);
      expect(checked.warnings.map(formatProblem)).toEqual([]);
    });
  }
});
