// 3D text draws: Geist Bold extruded, lit by the studio rig and shaded with a
// theme material, fills a ThreeStage across its width. Set
// MOTIONCRAFT_THREE_TEXT_PNG to a directory to keep the rendered PNG.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { describe, expect, it } from "vitest";
import { bundleBrowserEntry, withOfflinePage } from "./browserPage";

const ENTRY = join(import.meta.dirname, "threeText.entry.tsx");
const SAMPLE = "motioncraft 0123 $%&";

interface Drawn {
  width: number;
  height: number;
  drawn: number;
  columns: number;
  left: number;
  right: number;
  image: string;
  mountMs: number;
}

function draw(page: Page, text: string, preset: string, theme: string, environment: string, frame = 0): Promise<Drawn> {
  return page.evaluate(
    ([text, preset, theme, environment, frame]) =>
      (window as unknown as { threeText: { draw(t: string, p: string, th: string, e: string, f: number): Drawn } }).threeText.draw(text, preset, theme, environment, frame),
    [text, preset, theme, environment, frame] as const,
  );
}

describe("3D text", () => {
  it("draws the same pixels for the same frame with the studio environment, on a fresh stage too", { timeout: 90_000 }, async (ctx) => {
    const js = await bundleBrowserEntry(ENTRY);
    await withOfflinePage(ctx, js, async ({ page }) => {
      const first = await draw(page, SAMPLE, "chrome", "light", "studio", 6);
      const again = await draw(page, SAMPLE, "chrome", "light", "studio", 6);
      const other = await draw(page, SAMPLE, "chrome", "light", "studio", 20);
      expect(again.image).toBe(first.image);
      expect(other.image).not.toBe(first.image);
      // The environment changes what chrome shows.
      expect((await draw(page, SAMPLE, "chrome", "light", "none", 6)).image).not.toBe(first.image);
    });
  });

  it("draws the sample across the stage with each material preset", { timeout: 90_000 }, async (ctx) => {
    const js = await bundleBrowserEntry(ENTRY);
    await withOfflinePage(ctx, js, async ({ page, requests }) => {
      const cases = [
        ["glossy", "light", "none"],
        ["matte", "dark", "none"],
        ["chrome", "light", "studio"],
        ["chrome", "dark", "studio"],
        ["glass", "dark", "studio"],
        ["glass", "light", "studio"],
      ] as const;
      for (const [preset, theme, environment] of cases) {
        const shot = await draw(page, SAMPLE, preset, theme, environment);
        const label = `${preset} on ${theme} (${environment})`;
        const out = process.env.MOTIONCRAFT_THREE_TEXT_PNG;
        if (out !== undefined) {
          mkdirSync(out, { recursive: true });
          writeFileSync(join(out, `three-text-${preset}-${theme}.png`), Buffer.from(shot.image.split(",")[1]!, "base64"));
        }
        expect([shot.width, shot.height], label).toEqual([640, 360]);
        // A wide, short line: ink covers a fair share of the stage, across most of its width.
        expect(shot.drawn, label).toBeGreaterThan(640 * 360 * 0.03);
        expect(shot.left, label).toBeLessThan(640 * 0.2);
        expect(shot.right, label).toBeGreaterThan(640 * 0.8);
        // Gaps between letters and words leave some columns empty.
        expect(shot.columns, label).toBeGreaterThan(640 * 0.5);
        expect(shot.columns, label).toBeLessThan(shot.right - shot.left);
      }
      const timings = await page.evaluate(() =>
        Array.from({ length: 3 }, () => (window as unknown as { threeText: { timeEnvironment(): number } }).threeText.timeEnvironment()),
      );
      if (process.env.MOTIONCRAFT_THREE_TEXT_PNG) console.log(`studio environment (PMREM) ms: ${timings.map((t) => t.toFixed(1)).join(", ")}`);
      expect(requests).toEqual(["https://motioncraft.test/test.html"]);
    });
  });
});
