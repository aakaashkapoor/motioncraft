// Fake glow for Backdrop3D, with no post-processing: soft quads (a radial
// falloff computed in code into a small texture) drawn behind bright marks. On
// a dark ground they add light (additive blending); on a light ground adding
// light would only wash out toward white, so there they lay a soft tint of
// the mark's colour over the ground instead.

import * as THREE from "three";
import { relativeLuminance } from "../theme/contrast";
import type { Theme } from "../theme/types";

/** Grounds darker than this get additive glow; lighter ones a soft tint. */
const DARK_GROUND_LUMINANCE = 0.35;

/** The glow texture's side, px. */
const TEXTURE_SIZE = 64;

/**
 * A white radial falloff, its alpha a Gaussian-like core with a soft tail:
 * the glow's shape, tinted per instance. Computed here rather than painted on
 * a 2D canvas, whose gradients the browser may dither differently each time.
 */
export function glowTexture(): THREE.DataTexture {
  const size = TEXTURE_SIZE;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const alpha = d >= 1 ? 0 : Math.exp(-6 * d * d) * (1 - d * d);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The glow quads' material: the soft texture, tinted by the instance colour,
 * blended to suit the ground. It is drawn in the opaque pass, before the
 * marks (give the mesh `renderOrder = -1`): drawn as a transparent object
 * over the marks, the overlapping quads came out a few pixels different from
 * one render to the next on a real GPU, and a frame must always be the same.
 * Blending is set by hand, since three turns it off for "opaque" normal
 * blending.
 */
export function glowMaterial(theme: Theme, map: THREE.Texture, opacity: number): THREE.MeshBasicMaterial {
  const dark = relativeLuminance(theme.colors.ground) < DARK_GROUND_LUMINANCE;
  const material = new THREE.MeshBasicMaterial({ map, opacity: dark ? opacity : opacity * 0.6, depthWrite: false, toneMapped: false });
  if (dark) material.blending = THREE.AdditiveBlending;
  else {
    material.blending = THREE.CustomBlending;
    material.blendSrc = THREE.SrcAlphaFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }
  return material;
}
