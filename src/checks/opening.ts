// Opening (a warning): frame 0 is the thumbnail GitHub, Slack, X and most
// players show until someone presses play, so it should carry text. Warns when
// frame 0 shows none (the caption does not count: it has not started).

import { VISIBLE_OPACITY, type FrameMeasurement } from "./types";

export const BLANK_OPENING_MESSAGE = "frame 0 is blank, which is what GitHub, Slack and social apps show before play; use `opening: settled` or put text on the first frame";

export function checkOpening(measurement: FrameMeasurement): string[] {
  const shown = measurement.texts.some((text) => !text.caption && text.opacity >= VISIBLE_OPACITY && text.text.trim() !== "");
  return shown ? [] : [BLANK_OPENING_MESSAGE];
}
