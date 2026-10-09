// Type scale (a warning): visible text whose computed font size is not a step
// of the theme's type ramp, so a size was invented somewhere instead of taken
// from the ramp. Text a component shrank on purpose to fit its box (marked
// with `TYPE_FIT_ATTRIBUTE`) is allowed any size.

import type { TypeRole } from "../theme/types";
import { quote, VISIBLE_OPACITY, type FrameMeasurement } from "./types";

/** A ramp step's size at the storyboard's aspect (see `rampSteps`). */
export interface RampStep {
  role: TypeRole;
  size: number;
}

/** Computed sizes this close to a step count as on it (sub-pixel rounding). */
const TOLERANCE_PX = 0.5;

const px = (n: number) => `${Math.round(n * 10) / 10}px`;

/** Where `size` falls among the steps, for the message. Steps that share a size are named by the first. */
function between(size: number, steps: readonly RampStep[]): string {
  const sorted = steps.filter((step, i) => steps.findIndex((s) => s.size === step.size) === i).sort((a, b) => a.size - b.size);
  const below = sorted.filter((step) => step.size < size).at(-1);
  const above = sorted.find((step) => step.size > size);
  const name = (step: RampStep) => `${step.role} ${px(step.size)}`;
  if (below === undefined) return `below ${name(above!)}`;
  if (above === undefined) return `above ${name(below)}`;
  return `between ${name(below)} and ${name(above)}`;
}

export function checkTypeScale(measurement: FrameMeasurement, steps: readonly RampStep[]): string[] {
  const messages: string[] = [];
  for (const text of measurement.texts) {
    if (text.opacity < VISIBLE_OPACITY || text.fitted || steps.length === 0) continue;
    if (steps.some((step) => Math.abs(step.size - text.fontSize) <= TOLERANCE_PX)) continue;
    messages.push(`text ${quote(text.text)} is ${px(text.fontSize)}, which is not a step of the type ramp (${between(text.fontSize, steps)})`);
  }
  return messages;
}
