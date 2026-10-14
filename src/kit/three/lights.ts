// A studio lighting rig for 3D scenes: a key light above and to the right, a
// softer fill from the left, a rim light from behind for an edge, and a
// hemisphere light for soft ambient. Colours come from the theme: the lights
// are its light end (ground or text, whichever is lighter), the rim leans
// toward the accent, and the hemisphere's ground bounce is the theme's ground.
// No light casts shadows (turn `castShadow` on per light where wanted).

import * as THREE from "three";
import { mixColors } from "../../theme/color";
import { relativeLuminance } from "../../theme/contrast";
import type { Theme } from "../../theme/types";

export interface StudioLights {
  key: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
}

/** Adds the studio rig to `scene` and returns its lights. Positions suit a subject near the origin seen from +z. */
export function studioLights(scene: THREE.Scene, theme: Theme): StudioLights {
  const { ground, text, accent } = theme.colors;
  const [light, dark] = relativeLuminance(ground) >= relativeLuminance(text) ? [ground, text] : [text, ground];
  // Bright whatever the theme (its light end), with a breath of the accent.
  const base = mixColors(light, accent, 0.03);

  const key = new THREE.DirectionalLight(new THREE.Color(base), 2.6);
  key.position.set(3, 4, 5);
  const fill = new THREE.DirectionalLight(new THREE.Color(mixColors(base, dark, 0.12)), 0.9);
  fill.position.set(-5, 1, 3);
  const rim = new THREE.DirectionalLight(new THREE.Color(mixColors(base, accent, 0.3)), 2);
  rim.position.set(-1, 3, -5);
  const ambient = new THREE.HemisphereLight(new THREE.Color(base), new THREE.Color(ground), 0.7);
  ambient.position.set(0, 1, 0);

  for (const one of [key, fill, rim, ambient]) {
    one.castShadow = false;
    scene.add(one);
  }
  key.name = "studio key";
  fill.name = "studio fill";
  rim.name = "studio rim";
  ambient.name = "studio ambient";
  return { key, fill, rim, ambient };
}
