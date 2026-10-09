// Centering (a warning, 9:16 only): the scene's main block, all of its
// outermost kit blocks together without the caption, should be centered on
// the frame's center line (design v3, section C). v2 centered on x = 502
// because its safe area was lopsided; this catches that kind of drift. Blocks
// outside a camera shot do not count: the camera, not the layout, moved them.

import { frameSize, type Aspect } from "../layout/frame";
import { union } from "./geometry";
import { VISIBLE_OPACITY, type FrameMeasurement } from "./types";

/** How far the main block's center may sit from the frame's center line, in px. */
export const CENTERING_TOLERANCE_PX = 8;

export function checkCentering(measurement: FrameMeasurement, aspect: Aspect): string[] {
  if (aspect !== "9:16") return [];
  const blocks = measurement.blocks.filter((block) => !block.caption && !block.outOfShot && block.opacity >= VISIBLE_OPACITY);
  const main = union(blocks.map((block) => block.rect));
  if (main === undefined) return [];
  const mid = frameSize(aspect).width / 2;
  const center = main.x + main.width / 2;
  const off = center - mid;
  if (Math.abs(off) <= CENTERING_TOLERANCE_PX) return [];
  const labels = [...new Set(blocks.map((block) => block.label))].join(", ");
  const side = off < 0 ? "left" : "right";
  return [`the main block (${labels}) is centered on x = ${Math.round(center)}, ${Math.round(Math.abs(off))}px ${side} of the frame center (x = ${mid})`];
}
