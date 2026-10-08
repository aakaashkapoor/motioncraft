// Runs every rule over the measured frames of a storyboard. Pure: no browser.

import { frameAt, type Timeline } from "../engine/timeline";
import { frameSize } from "../layout/frame";
import type { Storyboard } from "../storyboard/types";
import { checkContrast } from "./contrast";
import { checkOverflow } from "./overflow";
import { checkReadability, sceneMs, sceneWords } from "./readability";
import { checkSafeArea } from "./safeArea";
import type { CheckName, CheckResult, FrameMeasurement, Problem } from "./types";

export interface MeasuredFrame {
  frame: number;
  measurement: FrameMeasurement;
}

export function judge(storyboard: Storyboard, timeline: Timeline, frames: readonly MeasuredFrame[]): CheckResult {
  const problems: Problem[] = [];
  const add = (check: CheckName, sceneId: string, frame: number, messages: readonly string[]) => {
    for (const message of messages) problems.push({ check, sceneId, frame, message });
  };

  // Most words of scene text seen on any measured frame, per scene index.
  const words = new Map<number, number>();
  for (const { frame, measurement } of frames) {
    const { sceneIndex, sceneId } = frameAt(timeline, frame);
    add("overflow", sceneId, frame, checkOverflow(measurement, frameSize(storyboard.aspect)));
    add("safe-area", sceneId, frame, checkSafeArea(measurement, storyboard.aspect));
    add("contrast", sceneId, frame, checkContrast(measurement));
    words.set(sceneIndex, Math.max(words.get(sceneIndex) ?? 0, sceneWords(measurement)));
  }

  for (const [sceneIndex, count] of [...words].sort(([a], [b]) => a - b)) {
    const scene = timeline.scenes[sceneIndex]!;
    const message = checkReadability(sceneMs(timeline, sceneIndex), count);
    if (message !== undefined) add("readability", scene.id, scene.startFrame, [message]);
  }

  problems.sort((a, b) => a.frame - b.frame);
  return { passed: problems.length === 0, problems };
}

export function formatProblem(problem: Problem): string {
  return `[${problem.check}] scene "${problem.sceneId}", frame ${problem.frame}: ${problem.message}`;
}
