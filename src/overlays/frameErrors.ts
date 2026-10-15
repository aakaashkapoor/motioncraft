// Validation of the storyboard's `frame` (see `StoryboardFrame`) and a scene's `frameLabel`.

import { FRAME_STYLES, MAX_FRAME_LABEL, MAX_SCENE_FRAME_LABEL } from "../storyboard/types";

const FRAME_FIELDS = new Set(["style", "label", "showTimecode", "showSpec"]);

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const describe = (value: unknown): string => (value === undefined ? "undefined" : JSON.stringify(value));

/** The problem with a label of at most `max` characters, if any. */
function labelError(name: string, value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return `${name} must be a non-empty string (got ${describe(value)})`;
  if (value.length > max) return `${name} is ${value.length} characters; at most ${max} fit`;
  return undefined;
}

/** The problem with a scene's `frameLabel`, if any. */
export function frameLabelError(value: unknown): string | undefined {
  return labelError("frameLabel", value, MAX_SCENE_FRAME_LABEL);
}

/** Problems with the storyboard's `frame`, each prefixed `frame`; `overlays` is the storyboard's, which cannot share the corners. */
export function frameErrors(raw: unknown, overlays: unknown): string[] {
  if (!isObject(raw)) return [`frame must be an object (got ${describe(raw)})`];
  const errors: string[] = [];
  for (const key of Object.keys(raw)) if (!FRAME_FIELDS.has(key)) errors.push(`frame: unknown field "${key}"`);
  const { style, label, showTimecode, showSpec } = raw;
  if (!FRAME_STYLES.includes(style as never)) errors.push(`frame: style must be ${FRAME_STYLES.map((s) => `"${s}"`).join(", ")} (got ${describe(style)})`);
  const labelProblem = label === undefined ? undefined : labelError("label", label, MAX_FRAME_LABEL);
  if (labelProblem !== undefined) errors.push(`frame: ${labelProblem}`);
  for (const [name, value] of [["showTimecode", showTimecode], ["showSpec", showSpec]] as const) {
    if (value !== undefined && typeof value !== "boolean") errors.push(`frame: ${name} must be true or false (got ${describe(value)})`);
  }
  if (overlays !== undefined) errors.push("frame and overlays cannot be used together: the frame already draws in every corner");
  return errors;
}
