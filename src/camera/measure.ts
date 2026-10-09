// Reads a scene's shot targets in the page: the box of the element with a
// target's `shareId`, laid out with the camera wide, and the depth of the
// parallax layer it is on. Browser only; the framing math is in `./shots`.

import { SHARE_ATTRIBUTE } from "../render/sharedMeasure";
import { DEPTH_ATTRIBUTE } from "./attributes";
import type { ShotTargetBox } from "./shots";

/** The first element with `shareId` inside `frame`, measured against the frame's own box; undefined if none is drawn. */
export function readTarget(frame: Element, shareId: string): ShotTargetBox | undefined {
  const origin = frame.getBoundingClientRect();
  for (const element of frame.querySelectorAll(`[${SHARE_ATTRIBUTE}]`)) {
    if (element.getAttribute(SHARE_ATTRIBUTE) !== shareId) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const layer = element.closest(`[${DEPTH_ATTRIBUTE}]`);
    const depth = layer === null ? 1 : Number(layer.getAttribute(DEPTH_ATTRIBUTE));
    return { rect: { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height }, depth };
  }
  return undefined;
}
