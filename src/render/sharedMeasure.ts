// Reads the shared elements (`data-share-id`) of a scene laid out in the page:
// each one's box after transforms, corner radius, background and opacity, in
// px relative to the frame. Browser only; the morph math is in
// `src/transitions/shared.ts`.

import type { SharedBox } from "../transitions/shared";

export const SHARE_ATTRIBUTE = "data-share-id";

/** A computed `border-top-left-radius` ("16px", "50%", "8px 12px") in px, for a `width` x `height` box. */
export function radiusPx(value: string, width: number, height: number): number {
  const first = value.trim().split(/\s+/)[0] ?? "";
  const number = Number.parseFloat(first);
  if (!Number.isFinite(number)) return 0;
  return first.endsWith("%") ? (number / 100) * Math.min(width, height) : number;
}

/** The first element per `shareId` inside `frame`, measured against the frame's own box. */
export function readSharedBoxes(frame: Element): Record<string, SharedBox> {
  const origin = frame.getBoundingClientRect();
  const boxes: Record<string, SharedBox> = {};
  for (const element of frame.querySelectorAll<HTMLElement>(`[${SHARE_ATTRIBUTE}]`)) {
    const id = element.getAttribute(SHARE_ATTRIBUTE)!;
    if (Object.hasOwn(boxes, id)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const style = getComputedStyle(element);
    // Ancestors' transforms scale the box; the radius is in the element's own px.
    const scale = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
    boxes[id] = {
      x: rect.x - origin.x,
      y: rect.y - origin.y,
      width: rect.width,
      height: rect.height,
      radius: radiusPx(style.borderTopLeftRadius, element.offsetWidth, element.offsetHeight) * scale,
      background: style.backgroundColor,
      opacity: Number(style.opacity),
    };
  }
  return boxes;
}
