// The overlay fixtures rendered through the real page: a top-corner tag that
// would crowd a scene's eyebrow or headline makes that scene lay out below it
// (src/render/page.tsx passes `sceneAreaUnderOverlays`), so the overlay check
// is quiet on both (issue #159, finding 6: "EXAMPLE BILL" beside "How it works"
// on scene 2 of overlay.json in 9:16).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runOverlayChecks } from "../src/checks/overlays";
import { validateStoryboard, type Storyboard } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { resolveTheme } from "../src/render/themes";

async function load(file: string): Promise<Storyboard> {
  const result = validateStoryboard(JSON.parse(await readFile(join(import.meta.dirname, "fixtures", file), "utf8")));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

describe("overlay fixtures: no tag crowds a scene header on the rendered page", { timeout: 300_000 }, () => {
  it.for(["overlay.json", "overlay-wide.json"])("%s", async (file, ctx) => {
    const storyboard = await load(file);
    const theme = resolveTheme(storyboard);
    const warnings = await runOverlayChecks({ storyboard, theme, durations: estimateDurations(storyboard), mediaDir: join(import.meta.dirname, "fixtures") }).catch(
      (error: unknown) => {
        if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed, skipping browser checks: ${error.message}`);
        throw error;
      },
    );
    expect(warnings.map((w) => `frame ${w.frame}: ${w.message}`)).toEqual([]);
  });
});
