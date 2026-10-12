// Validates a scene's `effects`: what each one marks (a `shareId` the scene
// draws, found as shot targets are), how (`kind`), when (a cue), in which
// colour role and for how long.

import { cueErrors } from "../kit/cues";
import type { ColorRole } from "../theme/roles";
import { sceneComponents } from "./components";
import { EFFECT_KINDS } from "./types";

/** The colour roles an effect can take. */
export const EFFECT_COLORS = ["accent", "positive", "negative", "text", "muted"] as const satisfies readonly ColorRole[];

/** How long a shake or pulse may run, in ms. */
export const EFFECT_DURATION = { min: 100, max: 2000 } as const;

const EFFECT_FIELDS = new Set(["target", "kind", "at", "color", "durationMs"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

const quoted = (options: readonly string[]) => {
  const q = options.map((o) => `"${o}"`);
  return `${q.slice(0, -1).join(", ")} or ${q.at(-1)}`;
};

/**
 * The element ids an effect can target in a scene: each component's
 * `shareId` and the ids in its `shareIds` (a StepList's steps), nested ones
 * too, in document order.
 */
export function effectTargetIds(scene: { component: unknown; props: Record<string, unknown> }): string[] {
  const ids = sceneComponents(scene).flatMap(({ props }) => {
    const own = typeof props.shareId === "string" ? [props.shareId] : [];
    const listed = Array.isArray(props.shareIds) ? props.shareIds.filter((id): id is string => typeof id === "string") : [];
    return [...own, ...listed];
  });
  return [...new Set(ids)];
}

/** Problems with one effect, prefixed with `label` (e.g. "effects[0]"). */
function effectErrors(raw: unknown, label: string, ids: readonly string[], narration: string | undefined, sceneMs: unknown): string[] {
  if (!isObject(raw)) return [`${label} must be an object { target, kind, at } (got ${describe(raw)})`];
  const errors = Object.keys(raw)
    .filter((key) => !EFFECT_FIELDS.has(key))
    .map((key) => `${label}: unknown field "${key}"`);
  const { target, kind, at, color, durationMs } = raw;
  if (typeof target !== "string" || target.trim() === "") {
    errors.push(`${label}.target must be a shareId in the scene (got ${describe(target)})`);
  } else if (!ids.includes(target)) {
    const known = ids.length === 0 ? "none" : ids.map((id) => `"${id}"`).join(", ");
    errors.push(`${label}.target "${target}" is not a shareId in this scene (it has ${known})`);
  }
  if (!EFFECT_KINDS.includes(kind as never)) errors.push(`${label}.kind must be ${quoted(EFFECT_KINDS)} (got ${describe(kind)})`);
  if (at === undefined) errors.push(`${label}.at is required: ms from the scene start or { "word": ... }`);
  else {
    const problems = cueErrors(at, narration).map((e) => `${label}.at: ${e}`);
    errors.push(...problems);
    if (problems.length === 0 && typeof at === "number" && typeof sceneMs === "number" && at >= sceneMs) {
      errors.push(`${label}.at (${at}) is not before the end of the scene (${sceneMs} ms)`);
    }
  }
  if (color !== undefined && !EFFECT_COLORS.includes(color as never)) errors.push(`${label}.color must be ${quoted(EFFECT_COLORS)} (got ${describe(color)})`);
  if (durationMs !== undefined && !(typeof durationMs === "number" && Number.isInteger(durationMs) && durationMs >= EFFECT_DURATION.min && durationMs <= EFFECT_DURATION.max)) {
    errors.push(`${label}.durationMs must be a whole number from ${EFFECT_DURATION.min} to ${EFFECT_DURATION.max} (got ${describe(durationMs)})`);
  }
  return errors;
}

/**
 * Problems with a scene's `effects`, unprefixed. `scene` is the scene as
 * written: targets must be ids it draws, word cues words of its narration,
 * and a fixed `durationMs` bounds when effects may start.
 */
export function effectsErrors(raw: unknown, scene: { component: unknown; props: Record<string, unknown>; narration?: unknown; durationMs?: unknown }): string[] {
  if (!Array.isArray(raw)) return [`effects must be an array of { target, kind, at } (got ${describe(raw)})`];
  const ids = effectTargetIds(scene);
  const narration = typeof scene.narration === "string" && scene.narration.trim() !== "" ? scene.narration : undefined;
  return raw.flatMap((effect: unknown, i) => effectErrors(effect, `effects[${i}]`, ids, narration, scene.durationMs));
}
