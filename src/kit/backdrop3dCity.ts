// Backdrop3D "city": an isometric city of extruded bars rising out of a grid.
// A square block of seeded bars, most in a quiet grey step of the ink and a
// share in the accent, on a floor of grid lines, filmed by an orthographic
// camera from the true isometric angle so the tops and two sides read as
// three tones under the studio lights. Reference: orange and grey bars on a
// near-black ground.
//
// The bars rise in a wave from the near corner: each starts as its diagonal
// comes up and all have reached their heights by the settle (`cityHeights`).
// For the hold the camera turns very slowly about the block, a few degrees
// either way, so it never looks frozen.
//
// The world: one grid cell is 1 unit; the block is centred on the origin on
// the xz plane, bars standing up +y.

import * as THREE from "three";
import { random } from "../engine/random";
import type { Theme } from "../theme/types";
import { CITY_SPECS, backdropColors, stagedRise, type BackdropIntensity } from "./backdrop3dPlan";
import { studioLights } from "./three/lights";
import type { ThreeStageSize } from "./three/ThreeStage";

/** A bar's footprint, as a share of its cell. */
const FOOTPRINT = 0.72;
/** Bar heights, cells: most between LOW and HIGH (skewed low), a few towers up to TOWER. */
const LOW = 0.4;
const HIGH = 2.6;
const TOWER = 5.2;
const TOWER_SHARE = 0.08;
/** Share of bars in the accent. */
const ACCENT_SHARE = 0.22;
/** The wave: the far corner starts WAVE_MS after the near one; each bar rises over RISE_MS. */
const WAVE_MS = 650;
const RISE_MS = 550;
/** The camera's slow turn for the hold, degrees either way (its period is the intensity's). */
const TURN_DEG = 5;
/** The true isometric elevation, degrees, and the azimuth the camera starts from. */
const ELEVATION_DEG = 35.264;
const AZIMUTH_DEG = 45;
/** How much of the stage's width or height the block may fill. */
const FILL = 0.84;

export interface CityBar {
  /** Grid cell, 0..size-1 on each side. */
  gx: number;
  gz: number;
  /** Its full height, cells. */
  height: number;
  accent: boolean;
  /** When it starts rising, ms after the backdrop's start. */
  delayMs: number;
}

export interface CityLayout {
  /** Cells a side. */
  size: number;
  bars: CityBar[];
  /** The hold's turn: its phase, radians, and ms per swing. */
  turnPhase: number;
  turnPeriodMs: number;
}

/** The block for `seed`: each bar's cell, height, colour and start in the wave. */
export function cityLayout(seed: number, intensity: BackdropIntensity): CityLayout {
  const { size, turnPeriodMs } = CITY_SPECS[intensity];
  const r = (key: string) => random(`${seed}:city:${key}`);
  const bars: CityBar[] = [];
  for (let gx = 0; gx < size; gx++) {
    for (let gz = 0; gz < size; gz++) {
      const tower = r(`${gx}:${gz}:tower`) < TOWER_SHARE;
      const pick = r(`${gx}:${gz}:height`);
      bars.push({
        gx,
        gz,
        height: tower ? HIGH + pick * (TOWER - HIGH) : LOW + pick * pick * (HIGH - LOW),
        accent: r(`${gx}:${gz}:accent`) < ACCENT_SHARE,
        // The wave runs from the near corner (the highest gx + gz, nearest the camera) to the far one.
        delayMs: ((2 * (size - 1) - gx - gz) / (2 * (size - 1))) * WAVE_MS,
      });
    }
  }
  return { size, bars, turnPhase: r("turn") * 2 * Math.PI, turnPeriodMs };
}

/** Every bar's height at `ms` on the scene clock: 0 until its wave reaches it, its full height by the settle. */
export function cityHeights(layout: CityLayout, ms: number): number[] {
  return layout.bars.map((bar) => bar.height * stagedRise(ms, bar.delayMs, RISE_MS));
}

export interface CityState {
  layout: CityLayout;
  grey: THREE.InstancedMesh;
  accent: THREE.InstancedMesh;
  /** Each bar's instance: which mesh and which index in it. */
  slots: Array<{ mesh: THREE.InstancedMesh; index: number }>;
  camera: THREE.OrthographicCamera;
  /** The camera's distance from the block's centre, and the point it looks at. */
  distance: number;
  target: THREE.Vector3;
}

/** The camera's place for an azimuth (radians), looking at `target` from the isometric elevation. */
function placeCamera(state: Pick<CityState, "camera" | "distance" | "target">, azimuth: number): void {
  const { camera, distance, target } = state;
  const elevation = THREE.MathUtils.degToRad(ELEVATION_DEG);
  camera.position.set(
    target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
    target.y + distance * Math.sin(elevation),
    target.z + distance * Math.cos(elevation) * Math.cos(azimuth),
  );
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
}

/** The ortho half-sizes that fit the whole risen block, seen from every azimuth of the turn, into the stage with room. */
function fitFrustum(state: CityState, size: ThreeStageSize): void {
  const { layout, camera } = state;
  const half = layout.size / 2;
  const tallest = Math.max(...layout.bars.map((b) => b.height));
  const corners: THREE.Vector3[] = [];
  for (const x of [-half, half]) for (const z of [-half, half]) for (const y of [0, tallest]) corners.push(new THREE.Vector3(x, y, z));
  let w = 0;
  let h = 0;
  for (const turn of [-1, 0, 1]) {
    placeCamera(state, THREE.MathUtils.degToRad(AZIMUTH_DEG + turn * TURN_DEG));
    const view = camera.matrixWorldInverse;
    for (const c of corners) {
      const p = c.clone().applyMatrix4(view);
      w = Math.max(w, Math.abs(p.x));
      h = Math.max(h, Math.abs(p.y));
    }
  }
  const aspect = size.width / size.height;
  const halfHeight = Math.max(h, w / aspect) / FILL;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

/** Builds the city for `layout` on a stage of `size`; `poseCity` raises and films it each frame. */
export function buildCityScene(theme: Theme, layout: CityLayout, size: ThreeStageSize): { scene: THREE.Scene; camera: THREE.OrthographicCamera; state: CityState } {
  const scene = new THREE.Scene();
  studioLights(scene, theme);
  const colors = backdropColors(theme);
  // A unit box standing on its base, so scaling y raises it from the floor.
  const box = new THREE.BoxGeometry(FOOTPRINT, 1, FOOTPRINT).translate(0, 0.5, 0);
  const accentCount = layout.bars.filter((b) => b.accent).length;
  const greyMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.grey) });
  greyMaterial.name = "city:grey";
  const accentMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.accent) });
  accentMaterial.name = "city:accent";
  // At least one instance each (a mesh of none is not allowed), drawing only the bars it has.
  const grey = new THREE.InstancedMesh(box, greyMaterial, Math.max(1, layout.bars.length - accentCount));
  const accent = new THREE.InstancedMesh(box, accentMaterial, Math.max(1, accentCount));
  grey.count = layout.bars.length - accentCount;
  accent.count = accentCount;
  grey.name = "city bars";
  accent.name = "city accent bars";
  for (const mesh of [grey, accent]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const counts = new Map([
    [grey, 0],
    [accent, 0],
  ]);
  const slots = layout.bars.map((bar) => {
    const mesh = bar.accent ? accent : grey;
    const index = counts.get(mesh)!;
    counts.set(mesh, index + 1);
    return { mesh, index };
  });
  // The floor grid: lines on the cell edges, in the ink's quiet step.
  const half = layout.size / 2;
  const points: number[] = [];
  for (let i = 0; i <= layout.size; i++) {
    const at = i - half;
    points.push(-half, 0, at, half, 0, at, at, 0, -half, at, 0, half);
  }
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(points, 3)),
    new THREE.LineBasicMaterial({ color: new THREE.Color(colors.grey), transparent: true, opacity: 0.45 }),
  );
  grid.name = "city grid";
  scene.add(grid);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, layout.size * 8);
  const state: CityState = { layout, grey, accent, slots, camera, distance: layout.size * 3, target: new THREE.Vector3(0, Math.max(...layout.bars.map((b) => b.height)) / 3, 0) };
  fitFrustum(state, size);
  poseCity(state, 0);
  return { scene, camera, state };
}

const scratch = { m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };

/** Raises every bar and turns the camera for `ms` on the scene clock. */
export function poseCity(state: CityState, ms: number): void {
  const { layout, slots } = state;
  const heights = cityHeights(layout, ms);
  const half = (layout.size - 1) / 2;
  const { m, p, q, s } = scratch;
  layout.bars.forEach((bar, i) => {
    const { mesh, index } = slots[i]!;
    // A bar not yet risen is flattened to nothing (a zero scale draws no face).
    const h = heights[i]!;
    mesh.setMatrixAt(index, m.compose(p.set(bar.gx - half, 0, bar.gz - half), q, s.set(h > 0 ? 1 : 0, h, h > 0 ? 1 : 0)));
  });
  state.grey.instanceMatrix.needsUpdate = true;
  state.accent.instanceMatrix.needsUpdate = true;
  const turn = Math.sin((2 * Math.PI * ms) / layout.turnPeriodMs + layout.turnPhase) - Math.sin(layout.turnPhase);
  placeCamera(state, THREE.MathUtils.degToRad(AZIMUTH_DEG + (TURN_DEG / 2) * turn));
}
