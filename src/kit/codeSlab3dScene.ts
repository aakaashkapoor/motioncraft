// CodeSlab3D's three.js scene: a rounded, beveled slab (an extruded rounded
// rect in the theme's surface, glossy, lit by the studio rig), its face (the
// code painted on a canvas texture, unlit so the syntax colours show as they
// are, the lit bevel and sides giving the depth), a soft shadow behind it and
// an undrawn box over each painted line of text, which the checks read as 3D
// text. Building it needs no WebGL; without a DOM (tests) the face and the
// shadow are left unpainted and there are no text boxes.

import * as THREE from "three";
import type { Aspect } from "../storyboard/types";
import { mixColors, withAlpha } from "../theme/color";
import type { Theme } from "../theme/types";
import { PX_PER_UNIT, SHADOW_REACH, frontZ, paintSlabFace, type CodeSlabLayout, type SlabLine, type SlabPose } from "./codeSlab3dPlan";
import type { CodeToken } from "./highlight";
import { studioLights } from "./three/lights";
import { material } from "./three/materials";

/** The face texture's px per screen px. */
const TEXTURE_SCALE = 2;
/** The theme's card shadow is set for flat cards on the page; a slab floating in 3D takes a little more. */
const SHADOW_BOOST = 1.6;
/** How far the sides are tinted from the surface toward the muted text colour. */
const SIDE_TINT = 0.3;

export interface CodeSlabScene {
  scene: THREE.Scene;
  /** The slab and everything on it; posed each frame. */
  slab: THREE.Group;
  /** The beveled body. */
  body: THREE.Mesh;
  /** The painted face. */
  face: THREE.Mesh;
  /** A box per painted line of text, for the checks. */
  text: Array<{ mesh: THREE.Mesh; line: SlabLine }>;
  /** Repaints the face with the bands swept this far (one per highlighted line); a no-op without a DOM or when nothing changed. */
  paintBands(sweeps: readonly number[]): void;
}

const canPaint = () => typeof document !== "undefined";

/** The slab's outline: a rounded rect `width` by `height` (scene units) centred on the origin. */
function roundedRect(width: number, height: number, r: number): THREE.Shape {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

/** The body: the face's rounded rect, extruded and beveled, its front cap at `frontZ`. */
function bodyGeometry(layout: CodeSlabLayout): THREE.ExtrudeGeometry {
  const u = 1 / PX_PER_UNIT;
  const geometry = new THREE.ExtrudeGeometry(roundedRect(layout.face.width * u, layout.face.height * u, layout.corner * u), {
    depth: layout.depth * u,
    bevelEnabled: true,
    bevelThickness: layout.bevel * u,
    bevelSize: layout.bevel * u,
    bevelSegments: 5,
    curveSegments: 16,
  });
  geometry.translate(0, 0, (-layout.depth * u) / 2);
  return geometry;
}

/** The slab's soft shadow (the theme's card shadow), on a plane just behind it. */
function shadowPlane(theme: Theme, layout: CodeSlabLayout): THREE.Mesh | undefined {
  if (!canPaint()) return undefined;
  const { y, blur, opacity } = theme.cardShadow;
  const k = 0.5;
  const margin = blur * SHADOW_REACH;
  const outer = { width: layout.box.width, height: layout.box.height };
  const width = outer.width + 2 * margin;
  const height = outer.height + 2 * margin;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * k);
  canvas.height = Math.round(height * k);
  const g = canvas.getContext("2d")!;
  g.scale(k, k);
  // Only the shadow lands on the canvas: the rect itself is drawn off to the left.
  const away = width + 2 * margin;
  g.shadowColor = withAlpha(theme.colors.shadow, Math.min(1, opacity * SHADOW_BOOST));
  g.shadowBlur = blur * k;
  g.shadowOffsetX = away * k;
  g.shadowOffsetY = y * k;
  g.fillStyle = "#000";
  g.beginPath();
  g.roundRect(margin - away, margin, outer.width, outer.height, layout.corner + layout.bevel);
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width / PX_PER_UNIT, height / PX_PER_UNIT),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  plane.name = "shadow";
  plane.position.z = -layout.depth / 2 / PX_PER_UNIT - 0.1;
  return plane;
}

/** Builds the slab for `layout`, at rest (`poseCodeSlab` places it each frame), its bands not yet swept in. */
export function buildCodeSlabScene(
  theme: Theme,
  aspect: Aspect,
  layout: CodeSlabLayout,
  tokens: CodeToken[][],
  title: string | undefined,
  highlightLines: readonly number[],
): CodeSlabScene {
  const scene = new THREE.Scene();
  studioLights(scene, theme);
  const slab = new THREE.Group();
  slab.name = "slab";

  const made = material(theme, "glossy", "surface");
  // Lacquer over the surface: a soft sheen the bevel catches, little of the studio in it, so the sides keep the theme's surface.
  made.roughness = 0.35;
  made.envMapIntensity = 0.55;
  made.clearcoat = 0.6;
  // The sides (the extrusion's second group) take the surface toward the theme's muted text colour, so a light slab's depth
  // reads against a light ground instead of washing out to white under the key light.
  const sides = made.clone();
  sides.name = "glossy:surface sides";
  sides.color = new THREE.Color(mixColors(theme.colors.surface, theme.colors.textMuted, SIDE_TINT));
  const body = new THREE.Mesh(bodyGeometry(layout), [made, sides]);
  body.name = "body";

  const u = 1 / PX_PER_UNIT;
  const { face: facePx } = layout;
  let paintBands: CodeSlabScene["paintBands"] = () => {};
  const text: CodeSlabScene["text"] = [];
  const faceMaterial = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(facePx.width * u, facePx.height * u), faceMaterial);
  face.name = "face";
  face.position.z = frontZ(layout) + 0.002;

  if (canPaint()) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(facePx.width * TEXTURE_SCALE);
    canvas.height = Math.round(facePx.height * TEXTURE_SCALE);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    faceMaterial.map = texture;
    let painted = "";
    const paint = (sweeps: readonly number[]) => paintSlabFace(ctx, { theme, aspect, layout, tokens, title, bands: highlightLines.map((line, i) => ({ line, sweep: sweeps[i] ?? 0 })) });
    paintBands = (sweeps) => {
      const key = sweeps.map((s) => s.toFixed(4)).join(" ");
      if (key === painted) return;
      painted = key;
      paint(sweeps);
      texture.needsUpdate = true;
    };
    painted = highlightLines.map(() => (0).toFixed(4)).join(" ");
    for (const line of paint(highlightLines.map(() => 0))) {
      // Measured (its geometry has a box), never drawn.
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(line.width * u, line.height * u), new THREE.MeshBasicMaterial({ visible: false }));
      mesh.name = "text";
      mesh.position.set((line.x + line.width / 2 - facePx.width / 2) * u, -(line.y + line.height / 2 - facePx.height / 2) * u, 0.001);
      face.add(mesh);
      text.push({ mesh, line });
    }
  }

  const shadow = shadowPlane(theme, layout);
  if (shadow !== undefined) slab.add(shadow);
  slab.add(body, face);
  scene.add(slab);
  return { scene, slab, body, face, text, paintBands };
}

/** Places the slab for `pose`: offset below and behind its rest by slab heights, turned. */
export function poseCodeSlab(built: CodeSlabScene, pose: SlabPose, layout: CodeSlabLayout): void {
  const height = layout.box.height / PX_PER_UNIT;
  built.slab.position.set(0, pose.offset.y * height, pose.offset.z * height);
  built.slab.rotation.set(pose.rotation.x, pose.rotation.y, 0);
}
