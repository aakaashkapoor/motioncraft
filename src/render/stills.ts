// Renders chosen frames of a storyboard to PNG files, one browser page for all
// frames.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildTimeline } from "../engine/timeline";
import type { Page } from "playwright-core";
import { checkFrames, slideFrames } from "./frames";
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

/** Shows each frame and saves it to its path. */
async function capture(page: Page, jobs: readonly { frame: number; path: string }[]): Promise<string[]> {
  for (const { frame, path } of jobs) {
    await showFrame(page, frame);
    await page.screenshot({ path, animations: "disabled", caret: "hide" });
  }
  return jobs.map((job) => job.path);
}

/** Renders each frame to `<outDir>/frame-NNNNN.png`. Returns the file paths. */
export async function renderStills(options: StillsOptions): Promise<string[]> {
  const { frames, outDir } = options;
  checkComponents(options);
  const { input } = await prepareMedia(options);
  checkFrames(frames, buildTimeline(input.storyboard, input.durations, input.theme));
  await mkdir(outDir, { recursive: true });

  return withRenderPage(input, (page) => capture(page, frames.map((frame) => ({ frame, path: join(outDir, stillFileName(frame)) }))));
}

/**
 * The input a slide is drawn from: no captions, no camera shots and no
 * breathing, so the camera stays wide. Timing is untouched.
 */
export function slideInput<T extends PageInput>(input: T): T {
  const scenes = input.storyboard.scenes.map(({ shots: _shots, ...scene }) => scene);
  const breathe = { ...input.theme.motion.breathe, on: false };
  const theme = { ...input.theme, motion: { ...input.theme.motion, breathe } };
  return { ...input, storyboard: { ...input.storyboard, captionStyle: "off", scenes }, theme };
}

export interface SlidesOptions extends PageInput {
  /** The scenes to render; every scene when absent or empty. */
  ids?: readonly string[];
  outDir: string;
}

/** Renders each chosen scene's settled hold frame to `<outDir>/<NN>-<sceneId>.png`. Returns the file paths. */
export async function renderSlides(options: SlidesOptions): Promise<string[]> {
  const { ids, outDir, ...rest } = options;
  checkComponents(rest);
  const { input } = await prepareMedia(rest);
  const slides = slideFrames(buildTimeline(input.storyboard, input.durations, input.theme), ids);
  await mkdir(outDir, { recursive: true });

  return withRenderPage(slideInput(input), (page) => capture(page, slides.map((s) => ({ frame: s.frame, path: join(outDir, s.fileName) }))));
}
