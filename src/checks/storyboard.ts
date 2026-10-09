// Layer-1 checks on the storyboard itself, before any frame is drawn (design
// v2, section 7): every scene boundary has a chosen transition, colors in props
// come from the theme's tokens (or the storyboard's overrides), and media files
// exist and can be read. Warnings are advice; errors stop the render.

import { HEX_COLOR } from "../theme/color";
import { resolveTheme } from "../theme/resolve";
import type { Theme } from "../theme/types";
import { fileProblem, mediaUses } from "../render/media";
import type { Storyboard } from "../storyboard/types";

export const STORYBOARD_CHECK_NAMES = ["transition", "theme-color", "media"] as const;
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
            message: `no transition into "${scenes[i + 1]!.id}", so the theme default "${theme.motion.transition}" is used; choose one (cut, fade, slide, zoomBlur or wipe)`,
          },
        ],
  );
}

/** Prop keys that hold a color. */
const COLOR_KEY = /(colou?r|background|fill|stroke|tint)$/i;
/** CSS color syntax other than hex, which can never match a hex token. */
const CSS_COLOR_FUNCTION = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;

/** `#abc` → `#aabbcc`, lower case. */
function normalizeHex(color: string): string {
  const hex = color.trim().toLowerCase().slice(1);
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex}`;
}

/** Hex colors a storyboard may use: the resolved theme's, plus any it set itself. */
function allowedColors(storyboard: Storyboard, theme: Theme): Set<string> {
  const colors = [...Object.values(theme.colors), ...Object.values(storyboard.themeOverrides?.colors ?? {})];
  if (storyboard.accent !== undefined) colors.push(storyboard.accent);
  return new Set(colors.filter((c): c is string => typeof c === "string" && HEX_COLOR.test(c)).map(normalizeHex));
}

/** Every string in `value` with its path, e.g. `messages[0].avatar.color`. */
function strings(value: unknown, path: string, key: string, found: Array<{ path: string; key: string; value: string }>): void {
  if (typeof value === "string") found.push({ path, key, value });
  else if (Array.isArray(value)) value.forEach((item, i) => strings(item, `${path}[${i}]`, key, found));
  else if (typeof value === "object" && value !== null) {
    for (const [k, child] of Object.entries(value)) strings(child, path === "" ? k : `${path}.${k}`, k, found);
  }
}

/**
 * Warns on colors in props that are not theme tokens: a hex color in a color
 * field that the theme (with the storyboard's overrides) does not have, a
 * color field that is neither a hex color nor a role name, or CSS color
 * syntax anywhere.
 */
export function checkThemeColors(storyboard: Storyboard, theme: Theme = resolveTheme(storyboard)): StoryboardIssue[] {
  const allowed = allowedColors(storyboard, theme);
  const roles = new Set(Object.keys(theme.colors));
  const issues: StoryboardIssue[] = [];
  for (const scene of storyboard.scenes) {
    const found: Array<{ path: string; key: string; value: string }> = [];
    strings(scene.props, "", "", found);
    for (const { path, key, value } of found) {
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
          `or set the color in the storyboard ("accent" or "themeOverrides.colors")`,
      });
    }
  }
  return issues;
}

/** Errors on VideoClip and Image files that are missing or cannot be read, resolved against `mediaDir`. */
export async function checkMediaFiles(storyboard: Storyboard, mediaDir?: string): Promise<StoryboardIssue[]> {
  const issues: StoryboardIssue[] = [];
  for (const use of mediaUses(storyboard, mediaDir)) {
    const add = (message: string) => issues.push({ check: "media", severity: "error", sceneId: use.sceneId, message: `${use.component} ${message}` });
    if (use.src === undefined || use.path === undefined) {
      add("src is required: the path to a local file");
      continue;
    }
    const problem = await fileProblem(use.path);
    if (problem !== undefined) add(`src "${use.src}" ${problem} (looked for ${use.path})`);
  }
  return issues;
}

export interface CheckStoryboardOptions {
  /** Where media `src` paths resolve from; the storyboard's folder. Default the working directory. */
  mediaDir?: string;
  /** Default `resolveTheme(storyboard)`. */
  theme?: Theme;
}

/** Every storyboard check, errors first. */
export async function checkStoryboard(storyboard: Storyboard, options: CheckStoryboardOptions = {}): Promise<StoryboardIssue[]> {
  const theme = options.theme ?? resolveTheme(storyboard);
  const issues = [
    ...(await checkMediaFiles(storyboard, options.mediaDir)),
    ...checkTransitions(storyboard, theme),
    ...checkThemeColors(storyboard, theme),
  ];
  return [...issues.filter((i) => i.severity === "error"), ...issues.filter((i) => i.severity === "warn")];
}

export function formatIssue(issue: StoryboardIssue): string {
  return `${issue.severity} [${issue.check}] scene "${issue.sceneId}": ${issue.message}`;
}
