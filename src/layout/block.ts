// Where a scene's main block goes (design v3, section C, "fill the frame"):
// centered on the frame's center line, and vertically on the optical center
// of the safe area rather than parked at the top of the content area.

import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import type { Rect, Size } from "./frame";
import { safeZones } from "./safe";

/**
 * The y a block centers on. A component given no slot is the scene's own main
 * block and centers on the optical center (y 840 in `shorts`); one laid out
 * in a slot (a Section's content, half of a Handoff) centers in its slot.
 */
export function blockCenterY(theme: Theme, aspect: Aspect, slot?: Rect): number {
  return slot === undefined ? safeZones(aspect, theme.safe).opticalCenter : slot.y + slot.height / 2;
}

/**
 * A block of `size`, centered horizontally in `area` and vertically on
 * `centerY`, moved only as far as it must to stay inside `area`. Never wider
 * than `area`; one taller than `area` overflows it evenly, for the checks to
 * report.
 */
export function placeBlock(area: Rect, size: Size, centerY: number): Rect {
  const width = Math.min(size.width, area.width);
  const { height } = size;
  const x = area.x + (area.width - width) / 2;
  const y =
    height >= area.height
      ? area.y + (area.height - height) / 2
      : Math.min(Math.max(centerY - height / 2, area.y), area.y + area.height - height);
  return { x, y, width, height };
}
