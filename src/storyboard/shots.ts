// Validates a scene's camera `shots` (design v3, life #1): when each move
// starts, what it frames (a `shareId` in the scene, a rect in frame px, or
// "wide"), how much of the frame the target fills, and how long the move
// takes. Shots run in time order, inside the scene.

import { sceneComponents } from "./components";
import { WIDE_SHOT } from "./types";

/** The share of the frame a shot's target may fill (design v3, life #1). */
export const SHOT_FILL = { min: 0.6, max: 0.85 } as const;

const SHOT_FIELDS = new Set(["atMs", "target", "fill", "durationMs"]);
const RECT_FIELDS = ["x", "y", "width", "height"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function describe(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

function isRect(value: unknown): boolean {
  return (
    isObject(value) &&
    Object.keys(value).length === RECT_FIELDS.length &&
    RECT_FIELDS.every((key) => isNumber(value[key])) &&
    (value.width as number) > 0 &&
    (value.height as number) > 0
  );
}

/** The `shareId`s of a scene's component and those nested in it, in document order. */
function shareIds(scene: { component: unknown; props: Record<string, unknown> }): string[] {
  const ids = sceneComponents(scene)
    .map((use) => use.props.shareId)
    .filter((id): id is string => typeof id === "string");
  return [...new Set(ids)];
}

/** Problems with one shot, unprefixed but for `label` (e.g. "shots[0]"). */
function shotErrors(raw: unknown, label: string, ids: readonly string[]): string[] {
  if (!isObject(raw)) return [`${label} must be an object (got ${describe(raw)})`];
  const errors = Object.keys(raw)
    .filter((key) => !SHOT_FIELDS.has(key))
    .map((key) => `${label}: unknown field "${key}"`);
  const { atMs, target, fill, durationMs } = raw;
  if (!isNumber(atMs) || !Number.isInteger(atMs) || atMs < 0) errors.push(`${label}.atMs must be a whole number of ms >= 0 (got ${describe(atMs)})`);
  if (typeof target === "string" && target !== WIDE_SHOT && target.trim() !== "") {
    if (!ids.includes(target)) {
      const known = ids.length === 0 ? "none" : ids.map((id) => `"${id}"`).join(", ");
      errors.push(`${label}.target "${target}" is not a shareId in this scene (it has ${known})`);
    }
  } else if (target !== WIDE_SHOT && !isRect(target)) {
    errors.push(`${label}.target must be a shareId in the scene, a rect { "x", "y", "width", "height" } in frame px, or "wide" (got ${describe(target)})`);
  }
  if (fill !== undefined) {
    if (target === WIDE_SHOT) errors.push(`${label}.fill has no effect on a "wide" shot`);
    else if (!isNumber(fill) || fill < SHOT_FILL.min || fill > SHOT_FILL.max) {
      errors.push(`${label}.fill must be a number from ${SHOT_FILL.min} to ${SHOT_FILL.max} (got ${describe(fill)})`);
    }
  }
  if (durationMs !== undefined && !(isNumber(durationMs) && Number.isInteger(durationMs) && durationMs > 0)) {
    errors.push(`${label}.durationMs must be a positive integer (got ${describe(durationMs)})`);
  }
  return errors;
}

/**
 * Problems with a scene's `shots`, unprefixed. `scene` is the scene as
 * written: its targets must be `shareId`s it draws, and a fixed `durationMs`
 * bounds when shots may start.
 */
export function shotsErrors(raw: unknown, scene: { component: unknown; props: Record<string, unknown>; durationMs?: unknown }): string[] {
  if (!Array.isArray(raw)) return [`shots must be an array of shots (got ${describe(raw)})`];
  const ids = shareIds(scene);
  const errors: string[] = [];
  let previous: { index: number; atMs: number } | undefined;
  raw.forEach((shot: unknown, i) => {
    const label = `shots[${i}]`;
    errors.push(...shotErrors(shot, label, ids));
    const atMs = isObject(shot) ? shot.atMs : undefined;
    if (!isNumber(atMs) || atMs < 0) return;
    if (previous !== undefined && atMs < previous.atMs) {
      errors.push(`${label}.atMs (${atMs}) is before shots[${previous.index}].atMs (${previous.atMs}): list shots in time order`);
    }
    if (isNumber(scene.durationMs) && atMs >= scene.durationMs) {
      errors.push(`${label}.atMs (${atMs}) is not before the end of the scene (${scene.durationMs} ms)`);
    }
    previous = { index: i, atMs };
  });
  return errors;
}
