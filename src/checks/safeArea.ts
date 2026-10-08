// Safe area: visible text and key elements must stay inside `safeArea(aspect)`,
// clear of the platform UI drawn over the frame.

import { safeArea, type Aspect } from "../layout/frame";
import { contains, describeExcess } from "./geometry";
import { quote, VISIBLE_OPACITY, type FrameMeasurement } from "./types";

export function checkSafeArea(measurement: FrameMeasurement, aspect: Aspect): string[] {
  const safe = safeArea(aspect);
  const where = `the ${aspect} safe area`;
  const messages: string[] = [];
  for (const text of measurement.texts) {
    if (text.opacity < VISIBLE_OPACITY || contains(safe, text.rect)) continue;
    messages.push(`text ${quote(text.text)} is outside ${where} (${describeExcess(safe, text.rect)})`);
  }
  for (const key of measurement.keys) {
    if (key.opacity < VISIBLE_OPACITY || contains(safe, key.rect)) continue;
    messages.push(`${key.label} is outside ${where} (${describeExcess(safe, key.rect)})`);
  }
  return messages;
}
