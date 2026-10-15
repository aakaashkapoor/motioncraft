// The layer-1 checks see 3D: a ThreeDemo scene (an internal component) runs
// through the real checks. Placed by default it is in the safe area, centered,
// and its 3D text counts as text (no blank-opening warning); shifted right,
// the safe-area check names its 3D keys and overflow sees the text cut off.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, type TestContext } from "vitest";
import { formatProblem, runChecks } from "../src/checks";
import { contains } from "../src/checks/geometry";
import type { FrameMeasurement } from "../src/checks/types";
import { buildTimeline, safeArea, validateStoryboard, type Storyboard } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { sceneMiddleFrame } from "../src/render/frames";
import { checkComponents, showFrame, withRenderPage } from "../src/render/session";
import { resolveTheme } from "../src/render/themes";

async function fixture(name: string): Promise<Storyboard> {
  const result = validateStoryboard(JSON.parse(await readFile(join(import.meta.dirname, "fixtures", name), "utf8")));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

function skipWithoutBrowser(ctx: TestContext) {
  return (error: unknown) => {
    if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed, skipping browser checks: ${error.message}`);
    throw error;
  };
}

const check = (storyboard: Storyboard, ctx: TestContext) =>
  runChecks({ storyboard, theme: resolveTheme(storyboard), durations: estimateDurations(storyboard) }).catch(skipWithoutBrowser(ctx));

describe("internal components", () => {
  it("can be named by a storyboard; an unknown name is still refused", async () => {
    const storyboard = await fixture("three-stage.json");
    const input = { storyboard, theme: resolveTheme(storyboard), durations: {} };
    expect(() => checkComponents(input)).not.toThrow();
    const unknown = { ...storyboard, scenes: [{ ...storyboard.scenes[0]!, component: "NoSuchThing" }] };
    expect(() => checkComponents({ ...input, storyboard: unknown })).toThrow(/scene "three-demo": unknown component "NoSuchThing" \(kit has: /);
  });
});

describe.each(["three-stage.json", "three-stage-wide.json", "three-stage-45.json"])("ThreeDemo in the layer-1 checks (%s)", (name) => {
  it("is measured as key elements inside the safe area and one centered block, and passes", { timeout: 120_000 }, async (ctx) => {
    const storyboard = await fixture(name);
    const theme = resolveTheme(storyboard);
    const durations = estimateDurations(storyboard);
    const scene = buildTimeline(storyboard, durations, theme).scenes[0]!;
    const measurement = await withRenderPage({ storyboard, theme, durations }, async (page): Promise<FrameMeasurement> => {
      await showFrame(page, sceneMiddleFrame(scene));
      return page.evaluate(() => window.motioncraft!.measureFrame());
    }).catch(skipWithoutBrowser(ctx));

    expect(measurement.keys.map((key) => [key.label, key.opacity])).toEqual([
      ["box", 1],
      ["label", 1],
    ]);
    const safe = safeArea(storyboard.aspect, theme.safe);
    for (const key of measurement.keys) expect(contains(safe, key.rect), key.label).toBe(true);
    expect(measurement.blocks.map((block) => block.label)).toEqual(["ThreeDemo"]);

    const result = await check(storyboard, ctx);
    expect(result.problems.map(formatProblem)).toEqual([]);
    expect(result.warnings.map(formatProblem)).toEqual([]);
    // The 3D label is measured as text, where it is drawn.
    const label = measurement.keys.find((key) => key.label === "label")!;
    expect(measurement.texts.map((text) => [text.text, text.fitted])).toEqual([["motioncraft", true]]);
    for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(measurement.texts[0]!.rect[k] - label.rect[k])).toBeLessThanOrEqual(1);
  });
});

describe("ThreeDemo shifted out of the safe area", () => {
  it("is flagged by the safe-area check, naming the 3D keys", { timeout: 120_000 }, async (ctx) => {
    const result = await check(await fixture("three-stage-unsafe.json"), ctx);
    expect(result.passed).toBe(false);
    const messages = result.problems.filter((p) => p.check === "safe-area").map((p) => p.message);
    expect(messages.some((m) => /^box is outside the 9:16 "shorts" safe area/.test(m))).toBe(true);
    expect(messages.some((m) => /^label is outside the 9:16 "shorts" safe area/.test(m))).toBe(true);
    expect(messages.some((m) => /^text "motioncraft" is outside the 9:16 "shorts" safe area/.test(m))).toBe(true);
    // The stage's canvas cuts the label off at its edge (the content area's, x = 960): overflow sees it.
    const overflow = result.problems.filter((p) => p.check === "overflow").map((p) => p.message);
    expect(overflow.length).toBeGreaterThan(0);
    expect(overflow.every((m) => /^text "motioncraft" overflows its box and is clipped \(right by \d+px\)$/.test(m))).toBe(true);
    expect(result.problems.every((p) => p.check === "safe-area" || p.check === "overflow")).toBe(true);
    // Off the center line too: centering warns.
    expect(result.warnings.some((w) => w.check === "centering" && w.message.includes("ThreeDemo"))).toBe(true);
  });
});

describe("ThreeDemo 3D text under the 9:16 button rail", () => {
  it("is flagged like flat text, while the subject stays inside the safe area", { timeout: 120_000 }, async (ctx) => {
    const unsafe = await fixture("three-stage-unsafe.json");
    const scene = unsafe.scenes[0]!;
    const storyboard = { ...unsafe, scenes: [{ ...scene, props: { ...scene.props, shift: { x: 0.16, y: 0 } } }] };
    const result = await check(storyboard, ctx);
    expect(result.problems.length).toBeGreaterThan(0);
    for (const problem of result.problems) {
      expect(problem.check).toBe("safe-area");
      expect(problem.message).toMatch(/^text "motioncraft" is under the platform's button rail \(x > 900 for y 960-1600\) by \d+px$/);
    }
  });
});
