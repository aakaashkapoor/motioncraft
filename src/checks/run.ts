// Layer-1 checks: renders frames in the installed browser, measures them in the
// page, and judges the measurements. See docs/design.md, workflow step 5.

import { buildTimeline } from "../engine/timeline";
import { checkFrames } from "../render/frames";
import type { PageInput } from "../render/page";
import { prepareMedia } from "../render/media";
import { checkComponents, showFrame, withRenderPage } from "../render/session";
import { judge, type MeasuredFrame } from "./judge";
import { sampleVisibleFrames } from "./sample";
import type { CheckResult, FrameMeasurement } from "./types";

export interface RunChecksOptions extends PageInput {
  /**
   * Frames to check. Defaults to the first fully visible, middle and last
   * fully visible frame of every scene (see `sampleVisibleFrames`).
   */
  frames?: readonly number[];
}

export async function runChecks(options: RunChecksOptions): Promise<CheckResult> {
  checkComponents(options);
  const { input } = await prepareMedia(options);
  const { storyboard, durations, theme } = input;
  const timeline = buildTimeline(storyboard, durations, theme);
  const { frames } = options;
  if (frames !== undefined) checkFrames(frames, timeline);

  const measured = await withRenderPage(input, async (page) => {
    const measure = async (frame: number): Promise<FrameMeasurement> => {
      await showFrame(page, frame);
      return page.evaluate(() => window.motioncraft!.measureFrame());
    };
    if (frames === undefined) return sampleVisibleFrames(timeline, measure);
    const result: MeasuredFrame[] = [];
    for (const frame of frames) result.push({ frame, measurement: await measure(frame) });
    return result;
  });
  return judge(storyboard, timeline, measured, theme);
}
