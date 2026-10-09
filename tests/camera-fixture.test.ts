// tests/fixtures/camera: a hero chat window docks with Pinned, then a shot
// pushes in to the docked window and pulls back to wide, with breathing on
// and Pinned and Handoff drawn on parallax layers. In the browser: the docked
// window's text reads at label size or larger when the shot lands, the shared
// morph still lands where the docked window is drawn, and every layer-1 check
// passes.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkStoryboard, formatProblem, runChecks } from "../src/checks";
import { ASPECTS, buildTimeline, validateStoryboard, type Aspect, type Storyboard } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { showFrame, withRenderPage } from "../src/render/session";
import { resolveTheme } from "../src/render/themes";

const FIXTURES: Record<Aspect, string> = { "9:16": "camera.json", "16:9": "camera-wide.json" };

async function load(aspect: Aspect): Promise<Storyboard> {
  const result = validateStoryboard(JSON.parse(await readFile(join(import.meta.dirname, "fixtures", FIXTURES[aspect]), "utf8")));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

/** On-screen font size (computed size times every transform's scale above it) of each text inside `[data-share-id=id]` in the scene. */
function screenTextSizes(id: string): Array<{ text: string; px: number }> {
  const scaleOf = (node: Element) => {
    const transform = getComputedStyle(node).transform;
    if (transform === "none") return 1;
    const m = new DOMMatrixReadOnly(transform);
    return Math.hypot(m.a, m.b);
  };
  const target = document.querySelector(`[data-camera] [data-share-id="${id}"]`);
  if (target === null) return [];
  const sizes: Array<{ text: string; px: number }> = [];
  for (const el of [target, ...target.querySelectorAll("*")]) {
    const text = [...el.childNodes].filter((n) => n instanceof Text).map((n) => n.textContent ?? "").join("").trim();
    if (text === "" || getComputedStyle(el).visibility !== "visible") continue;
    let scale = 1;
    for (let node: Element | null = el; node !== null; node = node.parentElement) scale *= scaleOf(node);
    sizes.push({ text, px: parseFloat(getComputedStyle(el).fontSize) * scale });
  }
  return sizes;
}

function rectOf(selector: string) {
  const el = document.querySelector(selector);
  if (el === null) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

describe("tests/fixtures/camera", () => {
  for (const aspect of ASPECTS) {
    it(`${aspect}: is valid, shots onto the docked window and back to wide`, async () => {
      const sb = await load(aspect);
      expect(sb.aspect).toBe(aspect);
      const docked = sb.scenes.find((scene) => scene.component === "Pinned")!;
      expect(docked.shots!.map((shot) => shot.target)).toEqual(["chat", "wide"]);
      const issues = await checkStoryboard(sb, { theme: resolveTheme(sb) });
      expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it(`${aspect}: the docked window's text is at least label size once the shot lands`, { timeout: 120_000 }, async (ctx) => {
      const sb = await load(aspect);
      const theme = resolveTheme(sb);
      const durations = estimateDurations(sb);
      const timeline = buildTimeline(sb, durations, theme);
      const index = sb.scenes.findIndex((scene) => scene.component === "Pinned");
      const scene = timeline.scenes[index]!;
      const shot = sb.scenes[index]!.shots![0]!;
      const landed = scene.startFrame + Math.ceil(((shot.atMs + theme.motion.shot.ms) * timeline.fps) / 1000);
      const label = theme.type.label[aspect].size;
      try {
        await withRenderPage({ storyboard: sb, theme, durations }, async (page) => {
          await showFrame(page, scene.startFrame + timeline.transitions[index - 1]!.frames, 20_000);
          const wide = await page.evaluate(screenTextSizes, "chat");
          await showFrame(page, landed, 20_000);
          const close = await page.evaluate(screenTextSizes, "chat");
          expect(close.map((t) => t.text)).toContain("Ship it today.");
          expect(close.length).toBe(wide.length);
          // Docked at rest the window is a picture; the shot makes it readable.
          expect(Math.min(...wide.map((t) => t.px))).toBeLessThan(label);
          // Every text at least `label`, give or take sub-pixel rounding.
          expect(close.filter((t) => t.px < label - 0.5)).toEqual([]);
        });
      } catch (error) {
        if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
        throw error;
      }
    });

    it(`${aspect}: the shared morph lands where the docked window is drawn, through the camera`, { timeout: 120_000 }, async (ctx) => {
      const sb = await load(aspect);
      const theme = resolveTheme(sb);
      const durations = estimateDurations(sb);
      const t = buildTimeline(sb, durations, theme).transitions[0]!;
      try {
        await withRenderPage({ storyboard: sb, theme, durations }, async (page) => {
          await showFrame(page, t.startFrame + t.frames - 1, 20_000);
          const morph = await page.evaluate(rectOf, '[data-morph-box="chat"]');
          await showFrame(page, t.startFrame + t.frames, 20_000);
          const solo = await page.evaluate(rectOf, '[data-camera] [data-share-id="chat"]');
          expect(morph && solo).toBeTruthy();
          for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(morph![key] - solo![key])).toBeLessThan(8);
        });
      } catch (error) {
        if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
        throw error;
      }
    });

    it(`${aspect}: passes every layer-1 check`, { timeout: 180_000 }, async (ctx) => {
      const sb = await load(aspect);
      const theme = resolveTheme(sb);
      const checked = await runChecks({ storyboard: sb, theme, durations: estimateDurations(sb) }).catch((error: unknown) => {
        if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
        throw error;
      });
      expect(checked.problems.map(formatProblem)).toEqual([]);
    });
  }
});
