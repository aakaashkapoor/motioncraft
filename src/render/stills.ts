// Renders chosen frames of a storyboard to PNG files, one browser page for all
// frames.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildTimeline } from "../engine/timeline";
import { checkFrames } from "./frames";
import type { PageInput } from "./page";
import { prepareMedia } from "./media";
import { checkComponents, showFrame, withRenderPage } from "./session";

export interface StillsOptions extends PageInput {
  frames: readonly number[];
  outDir: string;
}

export function stillFileName(frame: number): string {
  return `frame-${String(frame).padStart(5, "0")}.png`;
}

/** Renders each frame to `<outDir>/frame-NNNNN.png`. Returns the file paths. */
export async function renderStills(options: StillsOptions): Promise<string[]> {
  const { frames, outDir } = options;
  checkComponents(options);
  const { input } = await prepareMedia(options);
  checkFrames(frames, buildTimeline(input.storyboard, input.durations, input.theme));
  await mkdir(outDir, { recursive: true });

  return withRenderPage(input, async (page) => {
    const paths: string[] = [];
    for (const frame of frames) {
      await showFrame(page, frame);
      const path = join(outDir, stillFileName(frame));
      await page.screenshot({ path, animations: "disabled", caret: "hide" });
      paths.push(path);
    }
    return paths;
  });
}
