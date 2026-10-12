// Validation of the storyboard's `overlays` (see `StoryboardOverlay`).

import { DEFAULT_OVERLAY_CORNER, MAX_OVERLAYS, MAX_OVERLAY_TEXT, OVERLAY_CORNERS } from "../storyboard/types";

const OVERLAY_FIELDS = new Set(["text", "corner", "scenes"]);

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const describe = (value: unknown): string => (value === undefined ? "undefined" : JSON.stringify(value));

/** Problems with the storyboard's `overlays`, each prefixed `overlays[i]`; `sceneIds` are the ids the scenes declare. */
export function overlaysErrors(raw: unknown, sceneIds: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [`overlays must be an array (got ${describe(raw)})`];
  const errors: string[] = [];
  if (raw.length > MAX_OVERLAYS) errors.push(`overlays has ${raw.length} entries; at most ${MAX_OVERLAYS} are allowed`);
  // "corner|scene id" → the first overlay that took it.
  const taken = new Map<string, number>();
  raw.forEach((item: unknown, i) => {
    const at = `overlays[${i}]`;
    if (!isObject(item)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    for (const key of Object.keys(item)) if (!OVERLAY_FIELDS.has(key)) errors.push(`${at}: unknown field "${key}"`);
    const { text, corner, scenes } = item;
    if (typeof text !== "string" || text.trim() === "") errors.push(`${at}: text is required and must be a non-empty string`);
    else if (text.length > MAX_OVERLAY_TEXT) errors.push(`${at}: text is ${text.length} characters; at most ${MAX_OVERLAY_TEXT} fit a corner tag`);
    if (corner !== undefined && !OVERLAY_CORNERS.includes(corner as never)) {
      errors.push(`${at}: corner must be ${OVERLAY_CORNERS.map((c) => `"${c}"`).join(", ")} (got ${describe(corner)})`);
    }
    let shownOn: readonly string[] = sceneIds;
    if (scenes !== undefined) {
      if (!Array.isArray(scenes) || scenes.length === 0 || scenes.some((id) => typeof id !== "string")) {
        errors.push(`${at}: scenes must be a non-empty array of scene ids (got ${describe(scenes)})`);
        return;
      }
      for (const id of scenes as string[]) if (!sceneIds.includes(id)) errors.push(`${at}: scenes names unknown scene "${id}"`);
      shownOn = scenes as string[];
    }
    const where = typeof corner === "string" && OVERLAY_CORNERS.includes(corner as never) ? corner : corner === undefined ? DEFAULT_OVERLAY_CORNER : undefined;
    if (where === undefined) return;
    for (const id of new Set(shownOn)) {
      const key = `${where}|${id}`;
      const first = taken.get(key);
      if (first === undefined) taken.set(key, i);
      else errors.push(`${at}: corner "${where}" is already taken on scene "${id}" by overlays[${first}]`);
    }
  });
  return errors;
}
