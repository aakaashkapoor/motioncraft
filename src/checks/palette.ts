// Palette rules as layer-1 storyboard checks (warnings): no more than three
// palette roles carry area in one scene (60-30-10), and a cross-fade between
// two different grounds is flagged, since the renderer draws it as a hard cut.
// Palette role names ("p1".."p4") in props are not counted: components do not
// resolve them (theme-color warns), so they put no swatch on screen.

import { outgoingTransition } from "../engine/timeline";
import { cutsAtMidpoint, sceneGround } from "../render/fieldCut";
import type { SceneGround, Storyboard } from "../storyboard/types";
import { HEX_COLOR } from "../theme/color";
import { sceneTheme } from "../theme/field";
import { paletteSwatches } from "../theme/palettes";
import { resolveTheme } from "../theme/resolve";
import { PALETTE_ROLES, type PaletteRole, type Theme } from "../theme/types";
import { COLOR_KEY, normalizeHex, propStrings } from "./propColors";
import type { StoryboardIssue } from "./storyboard";

/** Most palette roles one scene may give area to: a ground, one supporting colour and the accent. */
export const MAX_AREA_ROLES = 3;

/**
 * Warns on a scene where more than three palette roles carry area: the
 * scene's ground (when it is a swatch), its accent (when it is a swatch; p1
 * on the theme's ground) and every swatch a color prop uses by its hex.
 * Runs only when the theme has a palette.
 */
export function checkPaletteArea(storyboard: Storyboard, theme: Theme = resolveTheme(storyboard)): StoryboardIssue[] {
  const { palette } = theme.colors;
  if (palette === undefined) return [];
  const swatches = paletteSwatches(palette);
  const roleOf = (hex: string): PaletteRole | undefined => swatches.find((s) => normalizeHex(s.color) === normalizeHex(hex))?.role;
  const issues: StoryboardIssue[] = [];
  for (const scene of storyboard.scenes) {
    const colors = sceneTheme(theme, scene).colors;
    const labels = new Map<PaletteRole, string>();
    const add = (role: PaletteRole | undefined, label: string) => {
      if (role !== undefined && !labels.has(role)) labels.set(role, label === "" ? role : `${role} ${label}`);
    };
    add(roleOf(colors.ground), "ground");
    add(roleOf(colors.accent), "accent");
    const named = new Set<PaletteRole>();
    for (const { key, value } of propStrings(scene.props)) {
      if (!COLOR_KEY.test(key)) continue;
      const trimmed = value.trim();
      const role = HEX_COLOR.test(trimmed) ? roleOf(trimmed) : undefined;
      if (role !== undefined) named.add(role);
    }
    for (const role of PALETTE_ROLES) if (named.has(role)) add(role, "");
    if (labels.size <= MAX_AREA_ROLES) continue;
    issues.push({
      check: "palette-area",
      severity: "warn",
      sceneId: scene.id,
      message: `${labels.size} palette roles carry area in this scene (${[...labels.values()].join(", ")}); keep to three: a ground, one supporting colour and the accent (60-30-10)`,
    });
  }
  return issues;
}

const groundName = (ground: SceneGround): string => (ground === "ground" ? "the ground" : ground);

/**
 * Warns on every boundary the renderer draws as a hard cut at its midpoint
 * (see `cutsAtMidpoint`): a cross-fade (fade, zoomBlur, slide) between two
 * scenes on different grounds.
 */
export function checkFieldCuts(storyboard: Storyboard, theme: Theme = resolveTheme(storyboard)): StoryboardIssue[] {
  const { scenes } = storyboard;
  return scenes.slice(0, -1).flatMap((scene, i) => {
    if (!cutsAtMidpoint(storyboard, i, theme)) return [];
    const next = scenes[i + 1]!;
    const { type } = outgoingTransition(scene, theme);
    const transition = scene.transition === undefined ? `the theme default "${type}"` : `"${type}"`;
    return [
      {
        check: "field-cut" as const,
        severity: "warn" as const,
        sceneId: scene.id,
        message:
          `${transition} into "${next.id}" crosses from ${groundName(sceneGround(scene))} to ${groundName(sceneGround(next))}; ` +
          `a transition that blends both scenes is drawn as a hard cut at its midpoint between two colour fields — use "cut", or "wipe", "iris" or "whipPan" to hide the change`,
      },
    ];
  });
}
