// ExtrudedTitle's three.js scene: a beveled Geist Bold mesh per letter, each
// on a pivot at its baseline so it can flip up on its own beat, all in a word
// group that swings about its middle; the finish's material in the ink (the
// accent letters in the accent); a soft contact shadow on the floor under the
// word (a blurred radial gradient on a canvas texture, as the source does),
// the studio rig, and a painted studio for the letters to reflect. An undrawn plane over the settled front face gives the
// camera tests something exact to measure. Building it needs no WebGL;
// without a DOM (tests) there is no shadow.

import * as THREE from "three";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { mixColors, withAlpha } from "../theme/color";
import { relativeLuminance } from "../theme/contrast";
import type { Theme, ThemeColorKey } from "../theme/types";
import {
  BEVEL_SIZE,
  BEVEL_THICKNESS,
  DEPTH,
  FRONT_Z,
  SHADOW_DEPTH,
  letterPose,
  wordPose,
  type ExtrudedFinish,
  type ExtrudedTitleLayout,
} from "./extrudedTitlePlan";
import { geistBold } from "./three/fonts3d";
import { studioLights } from "./three/lights";
import { material } from "./three/materials";

/** Each finish's ink: the theme colour the letters take (chrome stays the preset's own grey, lifted). */
const INK: Record<ExtrudedFinish, ThemeColorKey> = { matte: "text", glossy: "text", chrome: "textMuted" };
/** The studio's vertical bars: where (u) and how wide, as shares of the map, and how much light they add. */
const BARS: ReadonlyArray<readonly [number, number, number]> = [
  [0.3, 0.04, 3],
  [0.345, 0.016, 2.5],
  [0.4, 0.03, 3],
  [0.6, 0.03, 3],
  [0.655, 0.016, 2.5],
  [0.7, 0.04, 3],
];
/** How much light the overhead softbox adds. */
const SOFTBOX = 2.5;
/** How dark the contact shadow is at its centre. */
const SHADOW_OPACITY = 0.55;

export interface ExtrudedTitleScene {
  scene: THREE.Scene;
  /** The word: swings about y. */
  word: THREE.Group;
  /** The letters alone (the text key). */
  glyphs: THREE.Group;
  letters: Array<{ pivot: THREE.Group; mesh: THREE.Mesh }>;
  /** An undrawn plane over the settled front face. */
  front: THREE.Mesh;
}

const canPaint = () => typeof document !== "undefined";

/** A letter's geometry: extruded and beveled, centred on x and through its depth, its baseline at y = 0. */
function letterGeometry(char: string): TextGeometry {
  const geometry = new TextGeometry(char, {
    font: geistBold(),
    size: 1,
    depth: DEPTH,
    curveSegments: 10,
    bevelEnabled: true,
    bevelThickness: BEVEL_THICKNESS,
    bevelSize: BEVEL_SIZE,
    bevelOffset: 0,
    bevelSegments: 5,
  });
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  geometry.translate(-(min.x + max.x) / 2, 0, -(min.z + max.z) / 2);
  return geometry;
}

/** The contact shadow: a soft ellipse on the floor under the word. */
function contactShadow(theme: Theme, layout: ExtrudedTitleLayout): THREE.Mesh | undefined {
  if (!canPaint()) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext("2d")!;
  const gradient = g.createRadialGradient(256, 64, 0, 256, 64, 256);
  gradient.addColorStop(0, withAlpha(theme.colors.shadow, SHADOW_OPACITY));
  gradient.addColorStop(0.55, withAlpha(theme.colors.shadow, SHADOW_OPACITY * 0.35));
  gradient.addColorStop(1, withAlpha(theme.colors.shadow, 0));
  g.setTransform(1, 0, 0, 0.25, 0, 48);
  g.fillStyle = gradient;
  g.fillRect(0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.extent.width * 1.2, SHADOW_DEPTH),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  plane.name = "shadow";
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = Math.min(0, layout.extent.yMin) - 0.01;
  return plane;
}

/**
 * The studio the letters reflect (the source's softbox room): an
 * equirectangular map in the theme's light and dark ends, bright above, a
 * soft mid-tone at the horizon, dark below, with a softbox strip overhead and
 * vertical bars brighter than white (it is a float map), so chrome and the
 * clear coat show crisp bands. The bars sit where the faces look while the
 * word is turned, so they sweep across the letters as it swings face-on; the
 * curved bevels catch the bright top and the dark floor.
 */
function studioMap(theme: Theme): THREE.DataTexture {
  const { ground, text } = theme.colors;
  const [lightHex, darkHex] = relativeLuminance(ground) >= relativeLuminance(text) ? [ground, text] : [text, ground];
  const light = new THREE.Color(lightHex);
  const dark = new THREE.Color(darkHex);
  const mid = light.clone().lerp(dark, 0.55);
  const W = 512;
  const H = 256;
  const data = new Float32Array(W * H * 4);
  const smooth = (t: number) => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  };
  const color = new THREE.Color();
  for (let y = 0; y < H; y++) {
    // Row 0 is straight down (three's equirect v runs up the texture).
    const elevation = ((y + 0.5) / H) * 180 - 90;
    const base = elevation >= 0 ? mid.clone().lerp(light, smooth(elevation / 60)) : mid.clone().lerp(dark, smooth(-elevation / 45));
    const softbox = elevation > 45 && elevation < 68 ? SOFTBOX : 0;
    const tall = elevation > -35 && elevation < 60 ? 1 : 0;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      let glow = softbox;
      for (const [at, width, power] of BARS) {
        const d = Math.min(Math.abs(u - at), 1 - Math.abs(u - at)) / (width / 2);
        glow += tall * power * (1 - smooth((d - 0.6) / 0.4));
      }
      color.copy(light).multiplyScalar(glow).add(base);
      const i = (y * W + x) * 4;
      data[i] = color.r;
      data[i + 1] = color.g;
      data[i + 2] = color.b;
      data[i + 3] = 1;
    }
  }
  const texture = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Builds the word for `layout`, every letter lying flat (`poseExtrudedTitle` places them each frame). */
export function buildExtrudedTitleScene(theme: Theme, layout: ExtrudedTitleLayout, finish: ExtrudedFinish, accentLetters: readonly number[]): ExtrudedTitleScene {
  const scene = new THREE.Scene();
  studioLights(scene, theme);
  const ink = material(theme, finish, INK[finish]);
  const accent = accentLetters.length === 0 ? undefined : material(theme, finish, "accent");
  const word = new THREE.Group();
  word.name = "word";
  const glyphs = new THREE.Group();
  glyphs.name = "letters";
  const letters = layout.letters.map(({ char, index, x }) => {
    const mesh = new THREE.Mesh(letterGeometry(char), accent !== undefined && accentLetters.includes(index) ? accent : ink);
    mesh.name = `letter ${char}`;
    const pivot = new THREE.Group();
    pivot.position.x = x;
    pivot.add(mesh);
    glyphs.add(pivot);
    return { pivot, mesh };
  });
  const { extent } = layout;
  // Measured (it has a box), never drawn.
  const front = new THREE.Mesh(new THREE.PlaneGeometry(extent.width, extent.yMax - extent.yMin), new THREE.MeshBasicMaterial({ visible: false }));
  front.name = "front";
  front.position.set(0, (extent.yMin + extent.yMax) / 2, FRONT_Z);
  word.add(glyphs, front);
  // The shadow swings with the word.
  const shadow = contactShadow(theme, layout);
  if (shadow !== undefined) word.add(shadow);
  scene.add(word);
  scene.environment = studioMap(theme);
  poseExtrudedTitle({ scene, word, glyphs, letters, front }, 0);
  return { scene, word, glyphs, letters, front };
}

/** Poses the letters and the word for `ms` on the scene clock. */
export function poseExtrudedTitle(built: ExtrudedTitleScene, ms: number): void {
  const count = built.letters.length;
  built.letters.forEach(({ pivot }, i) => {
    const pose = letterPose(ms, i, count);
    pivot.rotation.x = pose.rotationX;
    pivot.position.y = pose.lift;
    pivot.visible = pose.shown;
  });
  const pose = wordPose(ms);
  built.word.rotation.set(pose.rotationX, pose.rotationY, 0);
}
