// Runs every rule over the measured frames of a storyboard. Pure: no browser.

import { frameAt, type Timeline } from "../engine/timeline";
import { frameSize } from "../layout/frame";
import { rampSteps } from "../layout/type";
import type { Storyboard } from "../storyboard/types";
import { resolveTheme } from "../theme/resolve";
import type { Theme } from "../theme/types";
import { checkContrast } from "./contrast";
import { checkOverflow } from "./overflow";
import { checkReadability, sceneMs, sceneWords } from "./readability";
import { checkSafeArea } from "./safeArea";
import { checkTypeScale } from "./typeScale";
import { WARNING_CHECKS, type CheckName, type CheckResult, type FrameMeasurement, type Problem } from "./types";

export interface MeasuredFrame {
  frame: number;
  measurement: FrameMeasurement;
}

/**
 * Judges the measured frames of `storyboard`, drawn with `theme` (its own
 * resolved theme by default). Warnings are reported once per scene, on the
 * first frame that shows them.
 */
export function judge(storyboard: Storyboard, timeline: Timeline, frames: readonly MeasuredFrame[], theme: Theme = resolveTheme(storyboard)): CheckResult {
  const problems: Problem[] = [];
  const warnings: Problem[] = [];
  const warned = new Set<string>();
  const add = (check: CheckName, sceneId: string, frame: number, messages: readonly string[]) => {
    for (const message of messages) {
      if (!WARNING_CHECKS.has(check)) {
        problems.push({ check, sceneId, frame, message });
        continue;
      }
      const key = JSON.stringify([check, sceneId, message]);
      if (warned.has(key)) continue;
      warned.add(key);
      warnings.push({ check, sceneId, frame, message });
    }
  };
  const steps = rampSteps(theme, storyboard.aspect);

  // Most words of scene text seen on any measured frame, per scene index.
  const words = new Map<number, number>();
  for (const { frame, measurement } of frames) {
    const { sceneIndex, sceneId } = frameAt(timeline, frame);
    add("overflow", sceneId, frame, checkOverflow(measurement, frameSize(storyboard.aspect)));
    add("safe-area", sceneId, frame, checkSafeArea(measurement, storyboard.aspect));
    add("contrast", sceneId, frame, checkContrast(measurement));
    add("type-scale", sceneId, frame, checkTypeScale(measurement, steps));
    words.set(sceneIndex, Math.max(words.get(sceneIndex) ?? 0, sceneWords(measurement)));
  }

  for (const [sceneIndex, count] of [...words].sort(([a], [b]) => a - b)) {
    const scene = timeline.scenes[sceneIndex]!;
    const message = checkReadability(sceneMs(timeline, sceneIndex), count);
    if (message !== undefined) add("readability", scene.id, scene.startFrame, [message]);
  }

  problems.sort((a, b) => a.frame - b.frame);
  warnings.sort((a, b) => a.frame - b.frame);
  return { passed: problems.length === 0, problems, warnings };
}

export function formatProblem(problem: Problem): string {
  const severity = WARNING_CHECKS.has(problem.check) ? "warn " : "";
  return `${severity}[${problem.check}] scene "${problem.sceneId}", frame ${problem.frame}: ${problem.message}`;
}
