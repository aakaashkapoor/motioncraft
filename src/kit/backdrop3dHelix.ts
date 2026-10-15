// Backdrop3D "helix": a glowing particle torus. Strands of small unlit
// squares wind round a torus like a helix bent into a ring; the ring lies
// tilted toward the camera, turns slowly about its own axis and sways. Each
// square has a soft glow quad behind it (see `backdrop3dGlow.ts`). The
// squares spiral in along the ring from the lead and are all in place by the
// settle.
//
// The world: the torus's ring has radius 1 in its own xy plane, its axis on
// z. Squares always face the camera (they are placed, not rotated, each
// frame), so they read as crisp pixels at any turn.

import * as THREE from "three";
import { random } from "../engine/random";
import type { Theme } from "../theme/types";
import { BACKDROP_SETTLE_MS, BACKDROP_START_MS, backdropColors, HELIX_SPECS, stagedRise, type BackdropIntensity } from "./backdrop3dPlan";
import { glowMaterial, glowTexture } from "./backdrop3dGlow";
import type { ThreeStageSize } from "./three/ThreeStage";

/** The tube's radius (the ring's is 1). */
const TUBE = 0.3;
/** Square sizes, world units, and how much the tube radius is jittered. */
const SIZE_MIN = 0.016;
const SIZE_MAX = 0.03;
const RADIAL_JITTER = 0.02;
/** Share of squares sprinkled in a colour other than their strand's. */
const SPRINKLE_SHARE = 0.12;
/** The tilt toward the camera (degrees from face-on), give or take TILT_JITTER_DEG per seed. */
const TILT_DEG = 62;
const TILT_JITTER_DEG = 5;
/** The slow sway about the vertical, degrees and ms per cycle. */
const SWAY_DEG = 10;
const SWAY_PERIOD_MS = 16_000;
/** Each square's entrance: it waits up to STAGGER_MS along the ring (a spiral), then grows in over GROW_MS. */
const STAGGER_MS = 450;
const GROW_MS = BACKDROP_SETTLE_MS - BACKDROP_START_MS - STAGGER_MS - 100;
/** How far behind its place (radians round the ring) a square starts. */
const SPIRAL_LAG = 1.4;
/** Glow quads: this many times a square's size, at this opacity. */
const GLOW_SIZE = 5;
const GLOW_OPACITY = 0.28;
/** Vertical field of view, degrees, and how much of the stage's half-size the torus may fill. */
const FOV = 35;
const FILL = 0.82;

export interface HelixSquare {
  /** Angles round the ring and round the tube, radians. */
  u: number;
  v: number;
  /** The tube radius it sits at. */
  radius: number;
  size: number;
  /** Its colour: 0 the ink, n the nth swatch (wrapping). */
  colorSlot: number;
  /** Its entrance delay after the backdrop's start, ms. */
  delayMs: number;
}

export interface HelixLayout {
  squares: HelixSquare[];
  /** Turn about the torus's axis, radians per ms (signed). */
  spinPerMs: number;
  tilt: number;
  /** Phase of the sway, radians. */
  swayPhase: number;
}

/** The squares of a helix torus for `seed`: positions, sizes, colours and delays. */
export function helixLayout(seed: number, intensity: BackdropIntensity): HelixLayout {
  const spec = HELIX_SPECS[intensity];
  const r = (key: string) => random(`${seed}:helix:${key}`);
  const squares: HelixSquare[] = [];
  for (let k = 0; k < spec.strands; k++) {
    for (let i = 0; i < spec.perStrand; i++) {
      const at = (i + r(`${k}:${i}:at`) * 0.3) / spec.perStrand;
      const u = at * 2 * Math.PI;
      const v = spec.windings * u + (2 * Math.PI * k) / spec.strands;
      const sprinkle = r(`${k}:${i}:sprinkle`) < SPRINKLE_SHARE;
      squares.push({
        u,
        v,
        radius: TUBE + (r(`${k}:${i}:radius`) - 0.5) * 2 * RADIAL_JITTER,
        size: SIZE_MIN + r(`${k}:${i}:size`) * (SIZE_MAX - SIZE_MIN),
        colorSlot: sprinkle ? Math.floor(r(`${k}:${i}:color`) * 4) : k,
        delayMs: at * STAGGER_MS * 0.8 + r(`${k}:${i}:delay`) * STAGGER_MS * 0.2,
      });
    }
  }
  const direction = r("direction") < 0.5 ? -1 : 1;
  return {
    squares,
    spinPerMs: (direction * spec.turnsPerMinute * 2 * Math.PI) / 60_000,
    tilt: THREE.MathUtils.degToRad(TILT_DEG + (r("tilt") - 0.5) * 2 * TILT_JITTER_DEG),
    swayPhase: r("sway") * 2 * Math.PI,
  };
}

export interface HelixState {
  layout: HelixLayout;
  squares: THREE.InstancedMesh;
  glow: THREE.InstancedMesh;
}

/** The torus's orientation: its tilt toward the camera, then `sway` (radians) about the vertical. */
const orientation = (layout: HelixLayout, sway: number) => new THREE.Matrix4().makeRotationY(sway).multiply(new THREE.Matrix4().makeRotationX(-layout.tilt));

/** The sway at `ms`, radians. */
const swayAt = (layout: HelixLayout, ms: number) => THREE.MathUtils.degToRad(SWAY_DEG) * Math.sin((2 * Math.PI * ms) / SWAY_PERIOD_MS + layout.swayPhase);

/** A point on the torus surface, in the torus's own frame. */
const torusPoint = (u: number, v: number, radius: number, out: THREE.Vector3) =>
  out.set((1 + radius * Math.cos(v)) * Math.cos(u), (1 + radius * Math.cos(v)) * Math.sin(u), radius * Math.sin(v));

/**
 * The camera that frames the torus as large as fits: FILL of the stage's
 * half-width or half-height, whichever binds, through the whole sway.
 */
function helixCamera(layout: HelixLayout, size: ThreeStageSize): THREE.PerspectiveCamera {
  const aspect = size.width / size.height;
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.05, 100);
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const outline: THREE.Vector3[] = [];
  const p = new THREE.Vector3();
  for (let k = -4; k <= 4; k++) {
    const turn = orientation(layout, (THREE.MathUtils.degToRad(SWAY_DEG) * k) / 4);
    for (let i = 0; i < 48; i++) for (let j = 0; j < 12; j++) outline.push(torusPoint((i / 48) * 2 * Math.PI, (j / 12) * 2 * Math.PI, TUBE + RADIAL_JITTER + SIZE_MAX, p).clone().applyMatrix4(turn));
  }
  // The farthest the camera can be and still have a point leave the FILL box shrinks as it comes closer: search for the distance that just fits.
  const fits = (d: number) => outline.every((q) => Math.abs(q.x) / ((d - q.z) * tan * aspect) <= FILL && Math.abs(q.y) / ((d - q.z) * tan) <= FILL);
  let near = 1.5;
  let far = 40;
  for (let i = 0; i < 40; i++) {
    const mid = (near + far) / 2;
    if (fits(mid)) far = mid;
    else near = mid;
  }
  // The near side of the ring looks bigger, so the outline sits low: raise the view onto its middle.
  const ys = outline.map((q) => q.y / ((far - q.z) * tan));
  const shift = ((Math.max(...ys) + Math.min(...ys)) / 2) * far * tan;
  camera.position.set(0, shift, far);
  camera.lookAt(0, shift, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

/** Builds the helix for `layout` on a stage of `size`; `poseHelix` places the squares each frame. */
export function buildHelixScene(theme: Theme, layout: HelixLayout, size: ThreeStageSize): { scene: THREE.Scene; camera: THREE.PerspectiveCamera; state: HelixState } {
  const scene = new THREE.Scene();
  const colors = backdropColors(theme);
  const slotColor = (slot: number) => new THREE.Color(slot % (colors.swatches.length + 1) === 0 ? colors.ink : colors.swatches[(slot % (colors.swatches.length + 1)) - 1]!);
  const count = layout.squares.length;
  const squares = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), count);
  squares.name = "helix squares";
  squares.frustumCulled = false;
  const glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowMaterial(theme, glowTexture(), GLOW_OPACITY), count);
  glow.name = "helix glow";
  glow.frustumCulled = false;
  // Drawn first, under the squares (see `glowMaterial`).
  glow.renderOrder = -1;
  layout.squares.forEach((square, i) => {
    const color = slotColor(square.colorSlot);
    squares.setColorAt(i, color);
    glow.setColorAt(i, color);
  });
  scene.add(squares);
  scene.add(glow);
  const state = { layout, squares, glow };
  poseHelix(state, 0);
  return { scene, camera: helixCamera(layout, size), state };
}

const scratch = { m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };

/** Places every square (and its glow) for `ms` on the scene clock. */
export function poseHelix(state: HelixState, ms: number): void {
  const { layout, squares, glow } = state;
  const turn = orientation(layout, swayAt(layout, ms));
  const spin = layout.spinPerMs * ms;
  const { m, p, q, s } = scratch;
  layout.squares.forEach((square, i) => {
    const grow = stagedRise(ms, square.delayMs, GROW_MS);
    const lag = (1 - grow) * SPIRAL_LAG;
    torusPoint(square.u + spin - lag, square.v - lag * 3, square.radius * (0.4 + 0.6 * grow), p).applyMatrix4(turn);
    const scale = square.size * grow;
    squares.setMatrixAt(i, m.compose(p, q, s.set(scale, scale, scale)));
    const g = scale * GLOW_SIZE;
    glow.setMatrixAt(i, m.compose(p, q, s.set(g, g, g)));
  });
  squares.instanceMatrix.needsUpdate = true;
  glow.instanceMatrix.needsUpdate = true;
}
