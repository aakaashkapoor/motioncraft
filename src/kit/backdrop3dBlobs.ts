// Backdrop3D "blobs": glossy iridescent metaballs drifting and merging. A
// marching-cubes surface (three's `MarchingCubes`) over a few seeded balls,
// each on its own slow Lissajous path, so they meet, melt into one another and
// part again. The material is a clear-coated physical one in the accent with
// a thin-film iridescence, lit by the studio environment alone (the stage
// makes it: `environment: "studio"`): no lights, which keeps the frame inside
// its SwiftShader budget and looks the same. Reference: a near-black ground.
//
// The world: the marching-cubes field spans -1..1 on each axis (its own
// 0..1 coordinates, doubled); the balls stay far enough inside it that no
// blob is ever cut by the field's edge. The blobs drift in an ellipse that
// is wide on a wide stage and tall on a tall one, framed with room around it.
// On the entrance each ball swells from nothing, one after another, and all
// are whole by the settle.

import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { random } from "../engine/random";
import type { Theme } from "../theme/types";
import { BLOB_SPECS, backdropColors, stagedRise, type BackdropIntensity } from "./backdrop3dPlan";
import type { ThreeStageSize } from "./three/ThreeStage";

/** The field's cells a side (smooth enough at 1080p, cheap enough for SwiftShader), and the most triangles its buffers hold. */
const RESOLUTION = 34;
const MAX_POLYS = 30_000;
/** A ball's falloff (MarchingCubes' `subtract`) and the field level drawn as the surface. */
const SUBTRACT = 12;
const ISOLATION = 80;
/** A lone ball's surface radius, in the field's 0..1 units, give or take RADIUS_JITTER. */
const RADIUS = 0.13;
const RADIUS_JITTER = 0.025;
/** How far ball centres stray from the middle, in 0..1 units: along the stage's long side, its short side, and in depth. */
const REACH_LONG = 0.3;
const REACH_SHORT = 0.17;
const REACH_DEPTH = 0.1;
/** Each ball's entrance: it waits up to STAGGER_MS, then swells over SWELL_MS (landing by the settle). */
const STAGGER_MS = 350;
const SWELL_MS = 850;
/** The camera's distance, and the half-size of the stage's short side it sees at the blobs' depth (field units, -1..1). */
const CAMERA_Z = 4;
const SHORT_HALF = 0.95;

export interface Blob {
  /** The ball's surface radius alone, 0..1 field units. */
  radius: number;
  /** Lissajous path: centre offsets are reach * sin(2π ms / period + phase), per axis. */
  periodMs: { x: number; y: number; z: number };
  phase: { x: number; y: number; z: number };
  /** Its entrance delay after the backdrop's start, ms. */
  delayMs: number;
}

export interface BlobLayout {
  blobs: Blob[];
  /** Whether the long side is horizontal (a wide or square stage) or vertical. */
  wide: boolean;
}

/** The balls for `seed`: sizes, paths and delays; `wide` from the stage. */
export function blobLayout(seed: number, intensity: BackdropIntensity, wide: boolean): BlobLayout {
  const spec = BLOB_SPECS[intensity];
  const r = (key: string) => random(`${seed}:blobs:${key}`);
  const period = (key: string) => spec.periodMinMs + r(key) * (spec.periodMaxMs - spec.periodMinMs);
  const blobs = Array.from({ length: spec.count }, (_, i): Blob => ({
    radius: RADIUS + (r(`${i}:radius`) * 2 - 1) * RADIUS_JITTER,
    periodMs: { x: period(`${i}:px`), y: period(`${i}:py`), z: period(`${i}:pz`) },
    phase: { x: r(`${i}:fx`) * 2 * Math.PI, y: r(`${i}:fy`) * 2 * Math.PI, z: r(`${i}:fz`) * 2 * Math.PI },
    delayMs: (i / Math.max(1, spec.count - 1)) * STAGGER_MS,
  }));
  return { blobs, wide };
}

export interface BlobPlace {
  /** Centre in the field's 0..1 units. */
  x: number;
  y: number;
  z: number;
  /** Surface radius now (0 before its entrance), 0..1 units. */
  radius: number;
}

/** Where every ball is, and how big, at `ms` on the scene clock. */
export function blobPlaces(layout: BlobLayout, ms: number): BlobPlace[] {
  const [reachX, reachY] = layout.wide ? [REACH_LONG, REACH_SHORT] : [REACH_SHORT, REACH_LONG];
  const wave = (period: number, phase: number) => Math.sin((2 * Math.PI * ms) / period + phase);
  return layout.blobs.map((b) => ({
    x: 0.5 + reachX * wave(b.periodMs.x, b.phase.x),
    y: 0.5 + reachY * wave(b.periodMs.y, b.phase.y),
    z: 0.5 + REACH_DEPTH * wave(b.periodMs.z, b.phase.z),
    radius: b.radius * stagedRise(ms, b.delayMs, SWELL_MS),
  }));
}

export interface BlobsState {
  layout: BlobLayout;
  surface: MarchingCubes;
}

/** The blobs' material: clear-coated, iridescent, in the accent. */
function blobMaterial(theme: Theme): THREE.MeshPhysicalMaterial {
  const made = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(backdropColors(theme).accent),
    roughness: 0.12,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: 1,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [320, 900],
    envMapIntensity: 1.2,
  });
  made.name = "blobs:accent";
  return made;
}

/** Builds the blobs for `layout` on a stage of `size`; `poseBlobs` moves them each frame. */
export function buildBlobsScene(theme: Theme, layout: BlobLayout, size: ThreeStageSize): { scene: THREE.Scene; camera: THREE.PerspectiveCamera; state: BlobsState } {
  const scene = new THREE.Scene();
  const surface = new MarchingCubes(RESOLUTION, blobMaterial(theme), false, false, MAX_POLYS);
  surface.isolation = ISOLATION;
  surface.name = "blobs";
  surface.frustumCulled = false;
  scene.add(surface);
  const aspect = size.width / size.height;
  const halfHeight = aspect >= 1 ? SHORT_HALF : SHORT_HALF / aspect;
  const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(halfHeight / CAMERA_Z)), aspect, 0.1, CAMERA_Z * 3);
  camera.position.set(0, 0, CAMERA_Z);
  camera.lookAt(0, 0, 0);
  const state = { layout, surface };
  poseBlobs(state, 0);
  return { scene, camera, state };
}

/** Rebuilds the surface for `ms` on the scene clock. */
export function poseBlobs(state: BlobsState, ms: number): void {
  const { layout, surface } = state;
  surface.reset();
  for (const ball of blobPlaces(layout, ms)) {
    if (ball.radius <= 0) continue;
    // A lone ball's surface sits where strength / d² - subtract = isolation.
    surface.addBall(ball.x, ball.y, ball.z, (ISOLATION + SUBTRACT) * ball.radius ** 2, SUBTRACT);
  }
  surface.update();
}
