// Overlay check (a warning): an overlay's pill must not sit on any scene text
// or caption. The layout keeps it to a corner of the safe area, but a scene's
// own text can still reach that corner, and only the render shows it.
// Overlaps are measured on the same sampled frames as the other layer-1 checks.

import { frameAt, buildTimeline } from "../engine/timeline";
import type { Rect } from "../layout/frame";
import { overlayPadding } from "../overlays/layout";
import { overlayOpacity, overlayRanges } from "../overlays/timing";
import { prepareMedia } from "../render/media";
import { checkComponents, showFrame, withRenderPage } from "../render/session";
import type { StoryboardOverlay } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { TOLERANCE_PX } from "./geometry";
import { sampleVisibleFrames } from "./sample";
import { quote, VISIBLE_OPACITY, type CheckName, type FrameMeasurement, type Problem } from "./types";
import type { RunChecksOptions } from "./run";

/** The name overlay warnings are reported under (see `Problem.check`). */
export const OVERLAY_CHECK = "overlay" as CheckName;

const overlaps = (a: Rect, b: Rect): boolean =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > TOLERANCE_PX && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > TOLERANCE_PX;

/**
 * Messages for the overlays on `measurement` whose pill (the overlay's measured
 * text plus its padding) covers other visible text. `shown` are the overlays
 * on screen at the measured frame.
 */
export function checkOverlayOverlap(measurement: FrameMeasurement, shown: readonly Pick<StoryboardOverlay, "text">[], theme: Theme): string[] {
  const pad = overlayPadding(theme);
  const visible = measurement.texts.filter((text) => text.opacity >= VISIBLE_OPACITY && !text.outOfShot);
  const messages: string[] = [];
  for (const overlay of shown) {
    const own = visible.find((text) => text.text === overlay.text);
    if (own === undefined) continue;
    const pill = { x: own.rect.x - pad.x, y: own.rect.y - pad.y, width: own.rect.width + 2 * pad.x, height: own.rect.height + 2 * pad.y };
    for (const text of visible) {
      if (text !== own && overlaps(pill, text.rect)) messages.push(`overlay ${quote(overlay.text)} covers ${text.caption ? "caption " : ""}text ${quote(text.text)}`);
    }
  }
  return messages;
}

/** Renders the sampled frames of a storyboard with overlays and warns where a pill covers text. */
export async function runOverlayChecks(options: RunChecksOptions): Promise<Problem[]> {
  const { overlays } = options.storyboard;
  if (overlays === undefined || overlays.length === 0) return [];
  checkComponents(options);
  const { input } = await prepareMedia(options);
  const { storyboard, durations, theme } = input;
  const timeline = buildTimeline(storyboard, durations, theme);
  const sceneIds = storyboard.scenes.map((scene) => scene.id);
  const ranges = (storyboard.overlays ?? []).map((overlay) => overlayRanges(overlay, sceneIds, timeline));
  const measured = await withRenderPage(input, async (page) =>
    sampleVisibleFrames(timeline, async (frame) => {
      await showFrame(page, frame);
      return page.evaluate(() => window.motioncraft!.measureFrame());
    }),
  );
  const warned = new Set<string>();
  const problems: Problem[] = [];
  for (const { frame, measurement } of measured) {
    const shown = (storyboard.overlays ?? []).filter((_, i) => overlayOpacity(ranges[i]!, frame, timeline) >= VISIBLE_OPACITY);
    for (const message of checkOverlayOverlap(measurement, shown, theme)) {
      const { sceneId } = frameAt(timeline, frame);
      const key = `${sceneId}|${message}`;
      if (warned.has(key)) continue;
      warned.add(key);
      problems.push({ check: OVERLAY_CHECK, sceneId, frame, message });
    }
  }
  return problems;
}
