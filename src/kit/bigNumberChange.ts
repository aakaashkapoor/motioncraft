// A BigNumber that shows a change ("$184 -> $46"): the old value is struck
// through, then the number counts from it to the new value and lands. The
// timing, the counted value and the prop check. Pure.

import { validateCue } from "../storyboard/validate";
import { readableColor } from "../theme/contrast";
import { headlineColor, roleColor } from "../theme/roles";
import type { Theme } from "../theme/types";
import { tween } from "./motion";

/** How the old value leaves: struck and moved above the number, or faded out. */
export const FROM_STYLES = ["strike", "replace"] as const;
export type FromStyle = (typeof FROM_STYLES)[number];

/** The colour roles the landed value can take; `accent` is the headline colour, as without a change. */
export const BIG_NUMBER_COLORS = ["accent", "positive", "negative"] as const;
export type BigNumberColor = (typeof BIG_NUMBER_COLORS)[number];

/**
 * The number's text colour for `color`: the headline colour for `accent`, else
 * the role's colour where it reads (WCAG AA) on the ground and cards, nudged
 * toward the text colour until it does, as `accentInk` does for the accent.
 */
export function bigNumberInk(theme: Theme, color: BigNumberColor): string {
  if (color === "accent") return headlineColor(theme);
  const { text, ground, surface } = theme.colors;
  return readableColor(roleColor(theme, color), text, [ground, surface]);
}

/** When the strike starts by default, in scene ms: after the entrance has mostly arrived. */
export const DEFAULT_STRIKE_MS = 600;
/** How long the number counts from the old value to the new one. */
export const COUNT_MS = 900;
/** The struck old value's size above the number, as a share of the number's. */
export const FROM_SCALE = 0.45;

/** When a value change happens, in ms on the component's clock. */
export interface ValueChangeTiming {
  /** The strike line starts to draw across the old value. */
  strikeMs: number;
  /** The strike line is drawn. With `strike` the old value starts to move up; with `replace` to fade out. */
  struckMs: number;
  /** The number starts to count from the old value. */
  countMs: number;
  /** The number lands on the new value: it pops and the shine sets off. */
  landMs: number;
}

/** The change's timing for a strike starting at `strikeMs`; the strike draws on the `fx` token. */
export function valueChangeTiming(theme: Theme, strikeMs: number, style: FromStyle): ValueChangeTiming {
  const { fx } = theme.motion;
  const struckMs = strikeMs + fx.ms;
  // Replace lets the old value fade out first, so two numbers never share the place.
  const countMs = style === "replace" ? struckMs + fx.ms : struckMs;
  return { strikeMs, struckMs, countMs, landMs: countMs + COUNT_MS };
}

/** The value the number shows `ms` in: `from` until the count, then easing out to `value`, at `decimals` places. */
export function countedValue(theme: Theme, timing: ValueChangeTiming, ms: number, from: number, value: number, decimals: number): number {
  const t = tween({ ms: COUNT_MS, curve: theme.motion.count.curve }, ms - timing.countMs);
  if (t >= 1) return value;
  const places = 10 ** Math.max(0, Math.min(20, Math.floor(decimals)));
  return Math.round((from + (value - from) * t) * places) / places;
}

const quoted = (options: readonly string[]) => {
  const q = options.map((o) => `"${o}"`);
  return q.length === 2 ? `${q[0]} or ${q[1]}` : `${q.slice(0, -1).join(", ")} or ${q.at(-1)}`;
};

/**
 * Problems with a BigNumber's change props (`from`, `fromStyle`, `color`,
 * `at`); `[]` when they are fine. A word cue in `at` is checked against
 * `narration`, the scene's text.
 */
export function bigNumberErrors(props: Record<string, unknown>, narration: string | undefined): string[] {
  const { value, from, fromStyle, color, at } = props;
  const errors: string[] = [];
  if (from !== undefined) {
    if (typeof from !== "number" || !Number.isFinite(from)) errors.push(`from must be a finite number (got ${JSON.stringify(from) ?? String(from)})`);
    else if (from === value) errors.push(`from must differ from value (both ${from})`);
  }
  if (fromStyle !== undefined && !FROM_STYLES.includes(fromStyle as FromStyle)) {
    errors.push(`fromStyle must be ${quoted(FROM_STYLES)} (got ${JSON.stringify(fromStyle)})`);
  }
  if (color !== undefined && !BIG_NUMBER_COLORS.includes(color as BigNumberColor)) {
    errors.push(`color must be ${quoted(BIG_NUMBER_COLORS)} (got ${JSON.stringify(color)})`);
  }
  if (from === undefined) {
    if (fromStyle !== undefined) errors.push("fromStyle needs from: it says how the old value leaves");
    if (at !== undefined) errors.push("at needs from: it starts the strike across the old value");
  } else if (at !== undefined) {
    errors.push(...validateCue(at, narration, "at"));
  }
  return errors;
}
