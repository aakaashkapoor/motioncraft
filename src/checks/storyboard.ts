// Layer-1 checks on the storyboard itself, before any frame is drawn (design
// v2, section 7): every scene boundary has a chosen transition, colors in props
// come from the theme's tokens (or the storyboard's overrides), media files
// exist and can be read, and the palette rules hold (see palette.ts). Warnings
// are advice; errors stop the render.

import { HEX_COLOR } from "../theme/color";
import { resolveTheme } from "../theme/resolve";
import { paletteSwatches } from "../theme/palettes";
import type { Theme } from "../theme/types";
import { fileProblem, mediaUses } from "../render/media";
import { ownValue } from "../engine/timeline";
import type { SceneNarration } from "../narration/types";
import { narrationTailMs } from "../render/durations";
import type { Storyboard } from "../storyboard/types";
import { checkFieldCuts, checkPaletteArea } from "./palette";
import { COLOR_KEY, CSS_COLOR_FUNCTION, normalizeHex, propStrings } from "./propColors";

export const STORYBOARD_CHECK_NAMES = ["transition", "theme-color", "media", "narration-fit", "palette-area", "field-cut"] as const;
export type StoryboardCheckName = (typeof STORYBOARD_CHECK_NAMES)[number];

export type Severity = "error" | "warn";

export interface StoryboardIssue {
  check: StoryboardCheckName;
  severity: Severity;
  sceneId: string;
  message: string;
}

/** Warns on every boundary that leaves its transition to the theme default. */
export function checkTransitions(storyboard: Storyboard, theme: Theme = resolveTheme(storyboard)): StoryboardIssue[] {
  const { scenes } = storyboard;
  return scenes.slice(0, -1).flatMap((scene, i) =>
    scene.transition !== undefined
      ? []
      : [
          {
            check: "transition" as const,
            severity: "warn" as const,
            sceneId: scene.id,
            message: `no transition into "${scenes[i + 1]!.id}", so the theme default "${theme.motion.transition}" is used; choose one (cut, fade, slide, zoomBlur, wipe, iris or whipPan)`,
          },
        ],
  );
}

/** Hex colors a storyboard may use: the resolved theme's, plus any it set itself. */
function allowedColors(storyboard: Storyboard, theme: Theme): Set<string> {
  const palette = theme.colors.palette === undefined ? [] : Object.values(theme.colors.palette);
  const colors = [...Object.values(theme.colors), ...palette, ...Object.values(storyboard.themeOverrides?.colors ?? {})];
  if (storyboard.accent !== undefined) colors.push(storyboard.accent);
  return new Set(colors.filter((c): c is string => typeof c === "string" && HEX_COLOR.test(c)).map(normalizeHex));
}

/**
 * Warns on colors in props that are not theme tokens: a hex color in a color
 * field that the theme (with the storyboard's overrides) does not have, a
 * color field that is neither a hex color nor a role name, or CSS color
 * syntax anywhere.
 */
export function checkThemeColors(storyboard: Storyboard, theme: Theme = resolveTheme(storyboard)): StoryboardIssue[] {
  const allowed = allowedColors(storyboard, theme);
  const roles = new Set(Object.keys(theme.colors).filter((key) => key !== "palette"));
  const { palette } = theme.colors;
  // Components take no palette role names, so a swatch goes in by its hex.
  const paletteHint =
    palette === undefined ? "" : `; a palette swatch goes in by its hex (${paletteSwatches(palette).map((s) => `${s.role} ${s.color}`).join(", ")})`;
  const issues: StoryboardIssue[] = [];
  for (const scene of storyboard.scenes) {
    for (const { path, key, value } of propStrings(scene.props)) {
      const trimmed = value.trim();
      const isHex = HEX_COLOR.test(trimmed);
      const bad = CSS_COLOR_FUNCTION.test(trimmed) || (COLOR_KEY.test(key) && (isHex ? !allowed.has(normalizeHex(trimmed)) : !roles.has(trimmed)));
      if (!bad) continue;
      issues.push({
        check: "theme-color",
        severity: "warn",
        sceneId: scene.id,
        message:
          `props.${path} ${JSON.stringify(value)} is not one of the theme's colors; ` +
          `use a role name (${[...roles].join(", ")}) where the prop takes one, leave it out for the theme default, ` +
          `or set the color in the storyboard ("accent" or "themeOverrides.colors")` +
          paletteHint,
      });
    }
  }
  return issues;
}

/** Errors on VideoClip and Image files (and EndCard and TitleCard logos) that are missing or cannot be read, resolved against `mediaDir`. */
export async function checkMediaFiles(storyboard: Storyboard, mediaDir?: string): Promise<StoryboardIssue[]> {
  const issues: StoryboardIssue[] = [];
  for (const use of mediaUses(storyboard, mediaDir)) {
    const add = (message: string) => issues.push({ check: "media", severity: "error", sceneId: use.sceneId, message: `${use.component} ${message}` });
    if (use.src === undefined || use.path === undefined) {
      add(`${use.prop} is required: the path to a local file`);
      continue;
    }
    const problem = await fileProblem(use.path);
    if (problem !== undefined) add(`${use.prop} "${use.src}" ${problem} (looked for ${use.path})`);
  }
  return issues;
}

export interface CheckStoryboardOptions {
  /** Where media `src` paths resolve from; the storyboard's folder. Default the working directory. */
  mediaDir?: string;
  /** Default `resolveTheme(storyboard)`. */
  theme?: Theme;
  /** Measured narration audio per scene id; enables the `narration-fit` check. */
  narration?: Record<string, Pick<SceneNarration, "audioMs">>;
}

/** Errors on a scene whose `durationMs` is shorter than its lead, narration audio and tail (see `narrationTailMs`). */
export function checkNarrationFit(
  storyboard: Storyboard,
  narration: Record<string, Pick<SceneNarration, "audioMs">>,
  theme: Theme = resolveTheme(storyboard),
): StoryboardIssue[] {
  const issues: StoryboardIssue[] = [];
  for (const [i, scene] of storyboard.scenes.entries()) {
    const audio = ownValue(narration, scene.id);
    if (typeof scene.durationMs !== "number" || audio === undefined) continue;
    const { leadMs } = theme.motion;
    const tailMs = narrationTailMs(storyboard, i, theme);
    const neededMs = leadMs + audio.audioMs + tailMs;
    if (scene.durationMs >= neededMs) continue;
    issues.push({
      check: "narration-fit",
      severity: "error",
      sceneId: scene.id,
      message: `durationMs ${scene.durationMs} is shorter than the narration needs: ${leadMs} ms lead + ${audio.audioMs} ms audio + ${tailMs} ms tail = ${neededMs} ms; lengthen it or remove durationMs to follow the audio`,
    });
  }
  return issues;
}

/** Every storyboard check, errors first. */
export async function checkStoryboard(storyboard: Storyboard, options: CheckStoryboardOptions = {}): Promise<StoryboardIssue[]> {
  const theme = options.theme ?? resolveTheme(storyboard);
  const issues = [
    ...(await checkMediaFiles(storyboard, options.mediaDir)),
    ...checkTransitions(storyboard, theme),
    ...checkThemeColors(storyboard, theme),
    ...checkPaletteArea(storyboard, theme),
    ...checkFieldCuts(storyboard, theme),
    ...(options.narration === undefined ? [] : checkNarrationFit(storyboard, options.narration, theme)),
  ];
  return [...issues.filter((i) => i.severity === "error"), ...issues.filter((i) => i.severity === "warn")];
}

export function formatIssue(issue: StoryboardIssue): string {
  return `${issue.severity} [${issue.check}] scene "${issue.sceneId}": ${issue.message}`;
}
