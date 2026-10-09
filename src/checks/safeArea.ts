// Safe area: visible text and key elements must stay inside the safe area of
// the aspect and safe profile, clear of the platform UI drawn over the frame.
// Text must also keep off the profile's keep-outs (the 9:16 button rail);
// shapes may cross them. While the camera is on a shot, what lies outside the
// shot is scenery the camera moves; the wide frames around the shot judge it.

import { frameSize, type Aspect, type Rect } from "../layout/frame";
import { safeArea, safeZones } from "../layout/safe";
import { DEFAULT_SAFE_PROFILE, type SafeProfile } from "../storyboard/types";
import { contains, describeExcess, TOLERANCE_PX } from "./geometry";
import { quote, VISIBLE_OPACITY, type FrameMeasurement } from "./types";

/** How far `text` reaches into `keepOut` from its open side, in px; 0 when clear of it. */
function intrusion(keepOut: Rect, text: Rect): number {
  const rows = text.y < keepOut.y + keepOut.height && keepOut.y < text.y + text.height;
  if (!rows) return 0;
  return Math.max(0, Math.min(text.x + text.width, keepOut.x + keepOut.width) - Math.max(text.x, keepOut.x));
}

/** "x > 900 for y 960-1600", or "x > 880" for a rail the full height of the frame. */
function describeKeepOut(keepOut: Rect, aspect: Aspect): string {
  const fullHeight = keepOut.y <= 0 && keepOut.y + keepOut.height >= frameSize(aspect).height;
  return `x > ${keepOut.x}${fullHeight ? "" : ` for y ${keepOut.y}-${keepOut.y + keepOut.height}`}`;
}

export function checkSafeArea(measurement: FrameMeasurement, aspect: Aspect, profile: SafeProfile = DEFAULT_SAFE_PROFILE): string[] {
  const safe = safeArea(aspect, profile);
  const { keepOut } = safeZones(aspect, profile);
  const where = aspect === "9:16" ? `the 9:16 "${profile}" safe area` : `the ${aspect} safe area`;
  const messages: string[] = [];
  for (const text of measurement.texts) {
    if (text.opacity < VISIBLE_OPACITY || text.outOfShot) continue;
    if (!contains(safe, text.rect)) {
      messages.push(`text ${quote(text.text)} is outside ${where} (${describeExcess(safe, text.rect)})`);
      continue;
    }
    for (const rail of keepOut) {
      const px = intrusion(rail, text.rect);
      if (px > TOLERANCE_PX) messages.push(`text ${quote(text.text)} is under the platform's button rail (${describeKeepOut(rail, aspect)}) by ${Math.round(px)}px`);
    }
  }
  for (const key of measurement.keys) {
    if (key.opacity < VISIBLE_OPACITY || key.outOfShot || contains(safe, key.rect)) continue;
    messages.push(`${key.label} is outside ${where} (${describeExcess(safe, key.rect)})`);
  }
  return messages;
}
