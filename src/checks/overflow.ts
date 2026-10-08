// Overflow / clipping: visible text that does not fit its box (so something
// clips it) or that runs past the edge of the frame.

import type { Size } from "../layout/frame";
import { contains, describeExcess } from "./geometry";
import { quote, VISIBLE_OPACITY, type FrameMeasurement } from "./types";

export function checkOverflow(measurement: FrameMeasurement, frame: Size): string[] {
  const bounds = { x: 0, y: 0, ...frame };
  const messages: string[] = [];
  for (const text of measurement.texts) {
    if (text.opacity < VISIBLE_OPACITY) continue;
    // The nearest box that clips the text is what the viewer sees cut off.
    const clip = text.clips.find((box) => !contains(box, text.rect));
    if (clip !== undefined) {
      messages.push(`text ${quote(text.text)} overflows its box and is clipped (${describeExcess(clip, text.rect)})`);
    } else if (!contains(bounds, text.rect)) {
      messages.push(`text ${quote(text.text)} runs past the frame (${describeExcess(bounds, text.rect)})`);
    }
  }
  return messages;
}
