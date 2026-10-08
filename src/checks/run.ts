// Layer-1 checks: renders frames in the installed browser, measures them in the
// page, and judges the measurements. See docs/design.md, workflow step 5.

import { buildTimeline } from "../engine/timeline";
import { checkFrames, perSceneFrames } from "../render/frames";
import type { PageInput } from "../render/page";
import { checkComponents, showFrame, withRenderPage } from "../render/session";
import { judge, type MeasuredFrame } from "./judge";
import type { CheckResult } from "./types";

export interface RunChecksOptions extends PageInput {
  /** Frames to check. Defaults to the start, middle and end of every scene. */
  frames?: readonly number[];
}

export async function runChecks(options: RunChecksOptions): Promise<CheckResult> {
  const { storyboard, theme, durations } = options;
  checkComponents(options);
  const timeline = buildTimeline(storyboard, durations);
  const frames = options.frames ?? perSceneFrames(timeline);
  checkFrames(frames, timeline);

  const measured = await withRenderPage({ storyboard, theme, durations }, async (page) => {
    const result: MeasuredFrame[] = [];
    for (const frame of frames) {
      await showFrame(page, frame);
      result.push({ frame, measurement: await page.evaluate(() => window.motioncraft!.measureFrame()) });
    }
    return result;
  });
  return judge(storyboard, timeline, measured);
}
