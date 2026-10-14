// LayerStack3D's three.js scene: one rounded, beveled plate per layer (the
// theme's surface in the matte preset; the highlighted layer in the glossy
// accent), each with its top face painted on a canvas texture (a hairline
// where the flat top meets the rounded edge, and its icon), a soft contact
// shadow under the bottom plate, and the studio lights. Building it needs no
// WebGL, and without a DOM (tests) the faces are left unpainted.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ICON_NODES, type IconNode } from "../icons/nodes";
import { withAlpha } from "../theme/color";
import type { Theme } from "../theme/types";
import type { LayerStackLayout, StackLayer } from "./layerStack3dPlan";
import { material } from "./three/materials";
import { studioLights } from "./three/lights";

/** The face texture's side, px. */
const FACE_PX = 512;
/** The icon's size as a share of the face, and its centre (a share of the face from its back-left corner): toward the front corner, the part of the face the plate above leaves in view. */
const ICON_SHARE = 0.3;
const ICON_AT = 0.66;
/** The contact shadow: its side (world units), its drop below the bottom plate, and its darkness at the centre. */
const SHADOW_SIZE = 7.5;
const SHADOW_DROP = 0.5;
const SHADOW_DARKNESS = 0.5;

export interface LayerStackScene {
  scene: THREE.Scene;
  /** One plate per layer, top first; each carries its face. */
  plates: THREE.Mesh[];
  /** Follows the bottom plate. */
  shadow: THREE.Mesh;
}

const canPaint = () => typeof document !== "undefined";

function canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Draws a bundled 24-unit line icon with canvas paths, `size` px square, its top-left at `x`, `y`. */
function drawIcon(g: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, color: string): void {
  g.save();
  g.translate(x, y);
  g.scale(size / 24, size / 24);
  g.strokeStyle = color;
  g.lineWidth = 1.75;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const [tag, attrs] of ICON_NODES[name as keyof typeof ICON_NODES] as IconNode) {
    const n = (key: string) => Number(attrs[key] ?? 0);
    if (tag === "path") g.stroke(new Path2D(String(attrs.d)));
    else if (tag === "circle") {
      g.beginPath();
      g.arc(n("cx"), n("cy"), n("r"), 0, Math.PI * 2);
      g.stroke();
    } else {
      g.beginPath();
      g.roundRect(n("x"), n("y"), n("width"), n("height"), n("rx"));
      g.stroke();
    }
  }
  g.restore();
}

/**
 * A plate's top face: a hairline inset from the edge and the layer's icon, on
 * transparent; the highlighted plate's face is filled with the accent itself.
 */
function faceTexture(theme: Theme, icon: string | undefined, highlighted: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = FACE_PX;
  const g = canvas.getContext("2d")!;
  if (highlighted) {
    g.fillStyle = theme.colors.accent;
    g.fillRect(0, 0, FACE_PX, FACE_PX);
  }
  const ink = highlighted ? theme.colors.accentText : theme.colors.textMuted;
  g.strokeStyle = highlighted ? withAlpha(theme.colors.accentText, 0.35) : theme.colors.border;
  g.lineWidth = 4;
  const inset = 22;
  g.beginPath();
  g.roundRect(inset, inset, FACE_PX - 2 * inset, FACE_PX - 2 * inset, 18);
  g.stroke();
  if (icon !== undefined) {
    const size = FACE_PX * ICON_SHARE;
    drawIcon(g, icon, FACE_PX * ICON_AT - size / 2, FACE_PX * ICON_AT - size / 2, size, ink);
  }
  return canvasTexture(canvas);
}

/** A soft round shadow on transparent, darkest at the middle. */
function shadowTexture(theme: Theme): THREE.CanvasTexture | undefined {
  if (!canPaint()) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const g = canvas.getContext("2d")!;
  const gradient = g.createRadialGradient(128, 128, 24, 128, 128, 128);
  gradient.addColorStop(0, withAlpha(theme.colors.shadow, Math.min(1, theme.cardShadow.opacity * 2 * SHADOW_DARKNESS + 0.12)));
  gradient.addColorStop(1, withAlpha(theme.colors.shadow, 0));
  g.fillStyle = gradient;
  g.fillRect(0, 0, 256, 256);
  return canvasTexture(canvas);
}

/** Builds the stack for `layout`: plates at rest at the origin (`update` places them each frame). */
export function buildLayerStackScene(theme: Theme, layout: LayerStackLayout, layers: readonly StackLayer[], highlight?: number): LayerStackScene {
  const scene = new THREE.Scene();
  studioLights(scene, theme);
  const { size, thick, round } = layout.plate;
  const geometry = new RoundedBoxGeometry(size, thick, size, 4, round);
  const face = new THREE.PlaneGeometry(size - 2 * round, size - 2 * round);
  const plates = layers.map((layer, i) => {
    const lit = i === highlight;
    const made = lit ? material(theme, "glossy", "accent") : material(theme, "matte", "surface");
    if (lit) {
      // A soft sheen and little of the studio's reflection, so the lit sides stay the accent's hue.
      made.roughness = 0.4;
      made.envMapIntensity = 0.3;
      made.clearcoat = 0.4;
    } else {
      // A little sheen on the matte stock, so the bevel catches the key light.
      made.roughness = 0.6;
      made.envMapIntensity = 0.5;
    }
    const plate = new THREE.Mesh(geometry, made);
    plate.name = "plate";
    if (canPaint()) {
      const map = faceTexture(theme, layer.icon, lit);
      const offset = { polygonOffset: true, polygonOffsetFactor: -2 };
      // Lit, the top face of a light accent (a dark theme's) washes out toward white under the key light: the
      // highlighted face shows the accent as it is, unlit and not tone mapped, its lit bevel and sides giving the depth.
      const paint = lit
        ? new THREE.MeshBasicMaterial({ map, toneMapped: false, ...offset })
        : new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.7, ...offset });
      const top = new THREE.Mesh(face, paint);
      top.name = "face";
      top.rotation.x = -Math.PI / 2;
      top.position.y = thick / 2 + 0.002;
      plate.add(top);
    }
    scene.add(plate);
    return plate;
  });
  const shadowMap = shadowTexture(theme);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(SHADOW_SIZE, SHADOW_SIZE),
    new THREE.MeshBasicMaterial({ map: shadowMap ?? null, transparent: true, depthWrite: false, toneMapped: false, visible: shadowMap !== undefined }),
  );
  shadow.name = "shadow";
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  return { scene, plates, shadow };
}

/** Places the plates and the shadow at the frame's heights (world y, top first). */
export function poseLayerStack(built: LayerStackScene, ys: readonly number[], thick: number): void {
  built.plates.forEach((plate, i) => plate.position.set(0, ys[i]!, 0));
  built.shadow.position.y = ys[ys.length - 1]! - thick / 2 - SHADOW_DROP;
}
