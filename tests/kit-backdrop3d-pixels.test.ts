// Backdrop3D draws the same pixels for the same frame and seed, on a fresh
// stage too, and different pixels for another seed.

import { join } from "node:path";
import type { Page } from "playwright-core";
import { describe, expect, it } from "vitest";
import { bundleBrowserEntry, withOfflinePage } from "./browserPage";

const ENTRY = join(import.meta.dirname, "backdrop3d.entry.tsx");
/** Every variant. */
const VARIANTS = ["helix", "blobs", "city", "tunnel"];

function draw(page: Page, variant: string, seed: number, frame: number): Promise<string> {
  return page.evaluate(
    ([variant, seed, frame]) => (window as unknown as { backdrop3d: { draw(v: string, s: number, n: number): string } }).backdrop3d.draw(variant, seed, frame),
    [variant, seed, frame] as const,
  );
}

describe("Backdrop3D pixels", () => {
  it("draws the same frame and seed identically twice, and another seed differently", { timeout: 120_000 }, async (ctx) => {
    const js = await bundleBrowserEntry(ENTRY);
    await withOfflinePage(ctx, js, async ({ page, requests }) => {
      for (const variant of VARIANTS) {
        const first = await draw(page, variant, 1, 60);
        expect(await draw(page, variant, 1, 60), variant).toBe(first);
        expect(await draw(page, variant, 2, 60), variant).not.toBe(first);
      }
      expect(requests).toEqual(["https://motioncraft.test/test.html"]);
    });
  });
});
