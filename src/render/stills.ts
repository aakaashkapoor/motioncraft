// Renders chosen frames of a storyboard to PNG files, one browser page for all
// frames.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildTimeline } from "../engine/timeline";
import { kit } from "../kit";
import { frameSize } from "../layout/frame";
import { launchBrowser } from "./browser";
import { bundlePage } from "./bundle";
import { checkFrames } from "./frames";
import type { PageInput } from "./page";

export interface StillsOptions extends PageInput {
  frames: readonly number[];
  outDir: string;
}

export function stillFileName(frame: number): string {
  return `frame-${String(frame).padStart(5, "0")}.png`;
}

/** Renders each frame to `<outDir>/frame-NNNNN.png`. Returns the file paths. */
export async function renderStills(options: StillsOptions): Promise<string[]> {
  const { storyboard, theme, durations, frames, outDir } = options;
  for (const scene of storyboard.scenes) {
    if (!Object.hasOwn(kit, scene.component)) {
      throw new Error(`scene "${scene.id}": unknown component "${scene.component}" (kit has: ${Object.keys(kit).join(", ")})`);
    }
  }
  checkFrames(frames, buildTimeline(storyboard, durations));

  const html = await bundlePage({ storyboard, theme, durations });
  await mkdir(outDir, { recursive: true });

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: frameSize(storyboard.aspect), deviceScaleFactor: 1 });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    await page.setContent(html);
    if (pageErrors.length > 0) throw new Error(`render page failed to load: ${pageErrors[0]!.message}`);
    await page.waitForFunction(() => window.motioncraft !== undefined);

    const paths: string[] = [];
    for (const frame of frames) {
      await page.evaluate((n) => window.motioncraft!.renderFrame(n), frame);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const path = join(outDir, stillFileName(frame));
      await page.screenshot({ path, animations: "disabled", caret: "hide" });
      paths.push(path);
    }
    return paths;
  } finally {
    await browser.close();
  }
}
