// Backdrop3D "tunnel": concentric rings strung along a gently winding path,
// in the ink, one of them in the accent, and the camera flying in forever.
// Rings are recycled: the same few instances always hold the next rings
// ahead, so it never runs out, and everything is a pure function of the
// scene-clock ms (`tunnelRings`). Far rings fade into the ground (fog in the
// ground colour), so new ones never pop in. On the entrance the camera
// surges forward and the rings open out, nearest first.
//
// The world: a ring's radius is 1; the tunnel runs down -z.

import * as THREE from "three";
import { random } from "../engine/random";
import type { Theme } from "../theme/types";
import { BACKDROP_SETTLE_MS, backdropColors, backdropRise, stagedRise, TUNNEL_SPECS, type BackdropIntensity } from "./backdrop3dPlan";
import type { ThreeStageSize } from "./three/ThreeStage";

/** The ring's tube radius, and the accent ring's (thicker, so the one accent reads). */
const TUBE = 0.022;
const ACCENT_TUBE = 0.04;
/** How far the path winds sideways and up (ring radii), and over how many ring radii of depth it turns once. */
const BEND = 0.22;
const BEND_LENGTH_MIN = 9;
const BEND_LENGTH_MAX = 14;
/** Each ring's own lean, radians at most, seeded. */
const LEAN = 0.12;
/** The camera's slow roll, turns a minute. */
const ROLL_TURNS_PER_MINUTE = 0.6;
/** The entrance's surge: extra ring radii flown by the settle. */
const SURGE = 2.4;
/** Ring n (from the first ahead) opens RING_STAGGER_MS after the one before, up to STAGGER_MAX_MS, over OPEN_MS. */
const RING_STAGGER_MS = 45;
const STAGGER_MAX_MS = 600;
const OPEN_MS = 600;
/** How far ahead the camera looks along the path. */
const LOOK_AHEAD = 3;
/** Rings fade into the ground from this share of the tunnel's depth to its far end. */
const FOG_NEAR_SHARE = 0.45;
/** The narrow side of the stage spans this field of view, degrees. */
const NARROW_FOV = 64;

export interface TunnelLayout {
  seed: number;
  /** Rings in view at once, the gap between them, and the flight speed (ring radii per ms). */
  count: number;
  spacing: number;
  speedPerMs: number;
  /** The instance (ring index mod count) drawn in the accent. */
  accentSlot: number;
  /** The path's winding: wavenumbers and phases on x and y. */
  bend: { kx: number; ky: number; px: number; py: number };
  /** The camera's roll, radians per ms (signed). */
  rollPerMs: number;
}

/** The tunnel for `seed`: how dense and fast, which ring is the accent, how the path winds. */
export function tunnelLayout(seed: number, intensity: BackdropIntensity): TunnelLayout {
  const spec = TUNNEL_SPECS[intensity];
  const r = (key: string) => random(`${seed}:tunnel:${key}`);
  const length = (key: string) => BEND_LENGTH_MIN + r(key) * (BEND_LENGTH_MAX - BEND_LENGTH_MIN);
  // The accent ring sits a third to half way down the tunnel, out of the fog, as the entrance settles, and comes on toward the camera.
  const settledFirst = Math.floor((spec.speed * (BACKDROP_SETTLE_MS / 1000) + SURGE) / spec.spacing) + 1;
  return {
    seed,
    count: spec.rings,
    spacing: spec.spacing,
    speedPerMs: spec.speed / 1000,
    accentSlot: (settledFirst + Math.floor(spec.rings * (0.3 + 0.15 * r("accent")))) % spec.rings,
    bend: { kx: (2 * Math.PI) / length("bendX"), ky: (2 * Math.PI) / length("bendY"), px: r("phaseX") * 2 * Math.PI, py: r("phaseY") * 2 * Math.PI },
    rollPerMs: ((r("roll") < 0.5 ? -1 : 1) * ROLL_TURNS_PER_MINUTE * 2 * Math.PI) / 60_000,
  };
}

/** The path's centre at depth `z`. */
function pathAt(layout: TunnelLayout, z: number): { x: number; y: number } {
  const { kx, ky, px, py } = layout.bend;
  return { x: BEND * Math.sin(kx * z + px), y: BEND * Math.sin(ky * z + py) };
}

export interface TunnelRing {
  /** Which ring along the tunnel (1 is the first), and the instance holding it. */
  n: number;
  slot: number;
  x: number;
  y: number;
  z: number;
  /** Its lean about x and y, radians. */
  leanX: number;
  leanY: number;
  /** How far it has opened, 0 -> 1. */
  scale: number;
  accent: boolean;
}

export interface TunnelView {
  camera: { x: number; y: number; z: number; roll: number; look: { x: number; y: number; z: number } };
  rings: TunnelRing[];
}

/** The camera and every ring in view at `ms`: a pure function of the scene clock. */
export function tunnelRings(layout: TunnelLayout, ms: number): TunnelView {
  const { count, spacing, accentSlot, seed } = layout;
  const travel = layout.speedPerMs * Math.max(0, ms) + SURGE * backdropRise(ms);
  const cz = -travel;
  const lookZ = cz - LOOK_AHEAD;
  const camera = { ...pathAt(layout, cz), z: cz, roll: layout.rollPerMs * ms, look: { ...pathAt(layout, lookZ), z: lookZ } };
  const first = Math.floor(travel / spacing) + 1;
  const rings = Array.from({ length: count }, (_, i): TunnelRing => {
    const n = first + i;
    const z = -n * spacing;
    const slot = n % count;
    const lean = (key: string) => (random(`${seed}:tunnel:${n}:${key}`) - 0.5) * 2 * LEAN;
    return {
      n,
      slot,
      ...pathAt(layout, z),
      z,
      leanX: lean("leanX"),
      leanY: lean("leanY"),
      scale: stagedRise(ms, Math.min(STAGGER_MAX_MS, (n - 1) * RING_STAGGER_MS), OPEN_MS),
      accent: slot === accentSlot,
    };
  });
  return { camera, rings };
}

export interface TunnelState {
  layout: TunnelLayout;
  /** The ink rings, one instance per slot (the accent's slot left empty), and the accent ring. */
  rings: THREE.InstancedMesh;
  accent: THREE.Mesh;
  camera: THREE.PerspectiveCamera;
}

/** Builds the tunnel for `layout` on a stage of `size`; `poseTunnel` flies it each frame. */
export function buildTunnelScene(theme: Theme, layout: TunnelLayout, size: ThreeStageSize): { scene: THREE.Scene; camera: THREE.PerspectiveCamera; state: TunnelState } {
  const scene = new THREE.Scene();
  const colors = backdropColors(theme);
  const depth = layout.count * layout.spacing;
  scene.fog = new THREE.Fog(new THREE.Color(theme.colors.ground), depth * FOG_NEAR_SHARE, depth);
  const aspect = size.width / size.height;
  const tan = Math.tan(THREE.MathUtils.degToRad(NARROW_FOV / 2));
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(aspect >= 1 ? tan : tan / aspect));
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.02, depth + 2);
  const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(1, TUBE, 8, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.ink), toneMapped: false }), layout.count);
  rings.name = "tunnel rings";
  rings.frustumCulled = false;
  const accent = new THREE.Mesh(new THREE.TorusGeometry(1, ACCENT_TUBE, 10, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.accent), toneMapped: false }));
  accent.name = "tunnel accent ring";
  accent.frustumCulled = false;
  accent.matrixAutoUpdate = false;
  scene.add(rings, accent);
  const state = { layout, rings, accent, camera };
  poseTunnel(state, 0);
  return { scene, camera, state };
}

const scratch = { m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3() };

/** Flies the camera and places every ring for `ms` on the scene clock. */
export function poseTunnel(state: TunnelState, ms: number): void {
  const { layout, rings, accent, camera } = state;
  const view = tunnelRings(layout, ms);
  const { m, p, q, e, s } = scratch;
  for (const ring of view.rings) {
    q.setFromEuler(e.set(ring.leanX, ring.leanY, 0));
    m.compose(p.set(ring.x, ring.y, ring.z), q, s.set(ring.scale, ring.scale, ring.scale));
    if (ring.accent) {
      accent.matrix.copy(m);
      accent.matrixWorld.copy(m);
      // Its slot in the ink rings draws nothing.
      m.makeScale(0, 0, 0);
    }
    rings.setMatrixAt(ring.slot, m);
  }
  rings.instanceMatrix.needsUpdate = true;
  const { x, y, z, roll, look } = view.camera;
  camera.position.set(x, y, z);
  camera.up.set(Math.sin(roll), Math.cos(roll), 0);
  camera.lookAt(look.x, look.y, look.z);
  camera.updateMatrixWorld(true);
}
