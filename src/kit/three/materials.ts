// Theme-aware material presets for 3D scenes. Every colour is a theme token
// (`theme.colors[role]`), never a literal, so a scene restyles with its theme.
// Theme tokens are sRGB CSS hex; `new THREE.Color(hex)` reads them as sRGB and
// stores them in three's linear working space (ColorManagement is on by
// default), and the stage's sRGB output turns them back. The stage's ACES
// filmic tone mapping then shifts what is drawn (it compresses highlights and
// desaturates a little), and lighting shades every face, so a material shows
// a lit, tone-mapped version of its theme colour, not the exact hex.
//
// Presets (all MeshPhysicalMaterial, so one type covers them):
//   matte  - rough dielectric, like card stock or clay. Default role `surface`.
//   glossy - smooth lacquer with a clear coat. Default role `accent`.
//   chrome - polished metal. Default role `textMuted` (a mid grey in every
//            theme), lifted toward white. Needs something to reflect: give
//            its ThreeStage `environment="studio"`, or it shows only the
//            lights' highlights and reads as a dark solid.
//   glass  - clear, refracting (transmission), tinted through its depth by
//            the role colour, partly see-through to what is behind the
//            canvas. Default role `accent`. Use `environment="studio"` too.

import * as THREE from "three";
import type { Theme, ThemeColorKey } from "../../theme/types";

export const MATERIAL_PRESETS = ["matte", "glossy", "chrome", "glass"] as const;
export type MaterialPreset = (typeof MATERIAL_PRESETS)[number];

/** The theme colour each preset takes when no role is given. */
export const DEFAULT_MATERIAL_ROLE: Record<MaterialPreset, ThemeColorKey> = {
  matte: "surface",
  glossy: "accent",
  chrome: "textMuted",
  glass: "accent",
};

const WHITE = new THREE.Color(1, 1, 1);
const LIFT = { chrome: 0.55, glass: 0.6 };

const FINISHES: Record<MaterialPreset, THREE.MeshPhysicalMaterialParameters> = {
  matte: { roughness: 0.85, metalness: 0 },
  glossy: { roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 },
  chrome: { roughness: 0.08, metalness: 1 },
  // `transparent` + `opacity` on top of `transmission` is deliberate:
  // transmission only refracts what three drew behind the glass, never the
  // page under the stage's transparent canvas, so opacity lets that show.
  glass: { roughness: 0.02, metalness: 0, transmission: 1, thickness: 0.8, ior: 1.5, transparent: true, opacity: 0.65 },
};

/**
 * A new material of `preset` coloured by the theme's `role` colour (default:
 * `DEFAULT_MATERIAL_ROLE[preset]`). The caller owns it (`disposeScene` frees it).
 */
export function material(theme: Theme, preset: MaterialPreset, role: ThemeColorKey = DEFAULT_MATERIAL_ROLE[preset]): THREE.MeshPhysicalMaterial {
  const tint = new THREE.Color(theme.colors[role]);
  // Metal and glass show their colour as a tint over what they reflect or let
  // through, so they take the role colour lifted toward white.
  const color = preset === "chrome" || preset === "glass" ? tint.clone().lerp(WHITE, LIFT[preset]) : tint;
  const made = new THREE.MeshPhysicalMaterial({ ...FINISHES[preset], color });
  // Glass takes its full tint through its depth, the way coloured glass does.
  if (preset === "glass") {
    made.attenuationColor = tint;
    made.attenuationDistance = 1.5;
  }
  made.name = `${preset}:${role}`;
  return made;
}
