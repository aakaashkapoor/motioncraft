// The layer-1 checks see into a ThreeStage: each ThreeKey gets an invisible
// box at its projected rect, marked as a key element, and the keys together
// are the stage's block for centering. 3D text keeps its string as
// aria-label and, given its colour, is measured as text. The key box of a
// turning box hugs the pixels the canvas drew.

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FrameMeasurement } from "../src/checks/types";
import type { Rect } from "../src/layout/frame";
import { bundleBrowserEntry, withOfflinePage } from "./browserPage";

const ENTRY = join(import.meta.dirname, "threeKeys.entry.tsx");

interface Rendered {
  measurement: FrameMeasurement;
  expected: Record<"box" | "slab" | "hidden", Rect | null>;
  keyBoxes: Array<{ label: string; ariaLabel: string | null; role: string | null; text: string; background: string; borderWidth: string; opacity: string }>;
}

interface Solo {
  key: Rect;
  pixels: Rect;
}

type Api = { renderAt(n: number): Rendered; renderSolo(n: number): Solo };

function expectNear(actual: Rect | undefined, expected: Rect | null | undefined): void {
  expect(actual).toBeDefined();
  expect(expected).toBeTruthy();
  for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(actual![key] - expected![key]), key).toBeLessThanOrEqual(1);
}

describe("ThreeStage key boxes", () => {
  it("are measured at each key's projected rect, every frame, and paint nothing", { timeout: 90_000 }, async (ctx) => {
    const js = await bundleBrowserEntry(ENTRY);
    await withOfflinePage(ctx, js, async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      const renderAt = (frame: number) => page.evaluate((f) => (window as unknown as { threeKeys: Api }).threeKeys.renderAt(f), frame);
      const first = await renderAt(10);
      const later = await renderAt(70);

      for (const { measurement, expected } of [first, later]) {
        const key = (label: string) => measurement.keys.find((k) => k.label === label);
        expectNear(key("box")?.rect, expected.box);
        expectNear(key("title")?.rect, expected.slab);
        expect(key("box")?.opacity).toBe(1);
        // A hidden object is not on screen: its box is out of the DOM, not judged and not faint content.
        expect(measurement.keys.map((k) => k.label)).toEqual(["box", "title"]);
        expect(expected.hidden).toBeNull();
        // The stage's block is the union of the keys on screen.
        expect(measurement.blocks.map((b) => b.label)).toEqual(["key stage"]);
        const union = {
          x: Math.min(expected.box!.x, expected.slab!.x),
          y: Math.min(expected.box!.y, expected.slab!.y),
          width: Math.max(expected.box!.x + expected.box!.width, expected.slab!.x + expected.slab!.width) - Math.min(expected.box!.x, expected.slab!.x),
          height: Math.max(expected.box!.y + expected.box!.height, expected.slab!.y + expected.slab!.height) - Math.min(expected.box!.y, expected.slab!.y),
        };
        expectNear(measurement.blocks[0]!.rect, union);
        // The 3D text is text to the checks: its string, at its rect, in its material's colour, on what is under the stage.
        expect(measurement.texts).toHaveLength(1);
        const text = measurement.texts[0]!;
        expect([text.text, text.color, text.backgrounds, text.opacity, text.fitted, text.caption]).toEqual(["Hello 3D", "rgb(244, 244, 240)", ["rgb(16, 24, 32)"], 1, true, false]);
        expectNear(text.rect, expected.slab);
        // Clipped by the stage (the key layer), then the frame.
        expect(text.clips[0]).toEqual({ x: 300, y: 120, width: 1000, height: 700 });
      }
      // The turning box moved between the frames, and its key box with it.
      expect(first.expected.box).not.toEqual(later.expected.box);

      expect(first.keyBoxes.map(({ label, ariaLabel, role }) => ({ label, ariaLabel, role }))).toEqual([
        { label: "box", ariaLabel: null, role: null },
        { label: "title", ariaLabel: "Hello 3D", role: "img" },
      ]);
      for (const box of first.keyBoxes) expect([box.background, box.borderWidth, box.opacity]).toEqual(["rgba(0, 0, 0, 0)", "0px", "1"]);
      // With a stage of keys, the wrapper is not role="img" (that would hide the keys' labels).
      expect(await page.evaluate(() => document.querySelector("[data-three-stage]")!.getAttribute("role"))).toBeNull();

      // Not a pixel of the frame changes when the key layer is taken away.
      const frame = { x: 0, y: 0, width: 1920, height: 1080 };
      const withKeys = await page.screenshot({ clip: frame });
      await page.evaluate(() => document.querySelectorAll<HTMLElement>("[data-three-keys]").forEach((el) => (el.style.display = "none")));
      const without = await page.screenshot({ clip: frame });
      expect(withKeys.equals(without)).toBe(true);
    });
  });

  it("hug the pixels a turning box draws", { timeout: 90_000 }, async (ctx) => {
    const js = await bundleBrowserEntry(ENTRY);
    await withOfflinePage(ctx, js, async ({ page }) => {
      for (const frame of [0, 12, 25, 41, 67]) {
        const { key, pixels } = await page.evaluate((f) => (window as unknown as { threeKeys: Api }).threeKeys.renderSolo(f), frame);
        const at = `frame ${frame}: key ${JSON.stringify(key)}, pixels ${JSON.stringify(pixels)}`;
        // Every drawn pixel is inside the key box (antialiasing may reach 1 px out)...
        expect(pixels.x, at).toBeGreaterThanOrEqual(key.x - 2);
        expect(pixels.y, at).toBeGreaterThanOrEqual(key.y - 2);
        expect(pixels.x + pixels.width, at).toBeLessThanOrEqual(key.x + key.width + 2);
        expect(pixels.y + pixels.height, at).toBeLessThanOrEqual(key.y + key.height + 2);
        // ...and the key box is no more than a few percent bigger than what was drawn.
        expect(key.width, at).toBeLessThanOrEqual(pixels.width * 1.03 + 2);
        expect(key.height, at).toBeLessThanOrEqual(pixels.height * 1.03 + 2);
      }
    });
  });
});
