// ExtrudedTitle draws the same pixels for the same frame, on a fresh stage
// too, and different pixels as the letters flip and the word swings.

import { join } from "node:path";
import type { Page } from "playwright-core";
import { describe, expect, it } from "vitest";
import { bundleBrowserEntry, withOfflinePage } from "./browserPage";

const ENTRY = join(import.meta.dirname, "extrudedTitle.entry.tsx");

function draw(page: Page, text: string, finish: string, frame: number): Promise<string> {
  return page.evaluate(
    ([text, finish, frame]) => (window as unknown as { extrudedTitle: { draw(t: string, f: string, n: number): string } }).extrudedTitle.draw(text, finish, frame),
    [text, finish, frame] as const,
  );
}

describe("ExtrudedTitle pixels", () => {
  it("draws the same frame identically twice, and moves between frames", { timeout: 90_000 }, async (ctx) => {
    const js = await bundleBrowserEntry(ENTRY);
    await withOfflinePage(ctx, js, async ({ page, requests }) => {
      for (const [text, finish] of [
        ["motioncraft", "glossy"],
        ["SHIP IT", "chrome"],
      ] as const) {
        const first = await draw(page, text, finish, 20);
        expect(await draw(page, text, finish, 20)).toBe(first);
        expect(await draw(page, text, finish, 30)).not.toBe(first);
      }
      expect(requests).toEqual(["https://motioncraft.test/test.html"]);
    });
  });
});
