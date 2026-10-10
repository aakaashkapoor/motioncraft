// What scripts/render.ts needs before it draws a frame: the narration (spoken
// or cached), the scene durations that follow from it, and the storyboard
// errors that must stop a render.

import { checkStoryboard, formatIssue } from "../checks";
import type { SceneNarration } from "../narration/types";
import type { Storyboard } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { estimateDurations, sceneDurations } from "./durations";

export interface RenderPlanOptions {
  storyboard: Storyboard;
  theme: Theme;
  mediaDir: string;
  /** Speaks (or loads) the narration; null renders silent, with estimated durations. */
  narrate: ((storyboard: Storyboard) => Promise<Record<string, SceneNarration>>) | null;
}

export type RenderPlan =
  | { ok: true; durations: Record<string, number>; narration?: Record<string, SceneNarration>; warnings: string[] }
  | { ok: false; errors: string[] };

/** Narrate, size the scenes, and run the storyboard checks; any error stops the render. */
export async function planRender(options: RenderPlanOptions): Promise<RenderPlan> {
  const { storyboard, theme, mediaDir } = options;
  const narration = options.narrate === null ? undefined : await options.narrate(storyboard);
  const issues = await checkStoryboard(storyboard, { theme, mediaDir, ...(narration === undefined ? {} : { narration }) });
  const errors = issues.filter((issue) => issue.severity === "error").map(formatIssue);
  if (errors.length > 0) return { ok: false, errors };
  const warnings = issues.map(formatIssue);
  const durations = narration === undefined ? estimateDurations(storyboard) : sceneDurations(storyboard, narration, theme);
  return { ok: true, durations, ...(narration === undefined ? {} : { narration }), warnings };
}
