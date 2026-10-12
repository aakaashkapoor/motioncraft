// `runChecks` plus the overlay warnings: the frame checks of `./run`, then,
// only for a storyboard with overlays, a second render that looks for a pill
// sitting on text (see `runOverlayChecks`).

import { runOverlayChecks } from "./overlays";
import { runChecks as runFrameChecks, type RunChecksOptions } from "./run";
import type { CheckResult } from "./types";

export async function runChecks(options: RunChecksOptions): Promise<CheckResult> {
  const result = await runFrameChecks(options);
  const overlay = await runOverlayChecks(options);
  if (overlay.length === 0) return result;
  return { ...result, warnings: [...result.warnings, ...overlay].sort((a, b) => a.frame - b.frame) };
}
