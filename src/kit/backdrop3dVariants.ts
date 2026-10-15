// Backdrop3D's variants: how each one builds its scene and poses it for a
// scene-clock ms. Adding a variant is one entry here. A variant without an
// entry is not built yet (Backdrop3D says so).

import type * as THREE from "three";
import type { Theme } from "../theme/types";
import type { BackdropIntensity, BackdropVariant } from "./backdrop3dPlan";
import { blobLayout, buildBlobsScene, poseBlobs } from "./backdrop3dBlobs";
import { buildHelixScene, helixLayout, poseHelix } from "./backdrop3dHelix";
import { buildTunnelScene, poseTunnel, tunnelLayout } from "./backdrop3dTunnel";
import type { ThreeStageSize } from "./three/ThreeStage";

export interface BackdropBuilt<S = unknown> {
  scene: THREE.Scene;
  camera: THREE.Camera;
  state: S;
}

export interface BackdropBuilder<S = unknown> {
  build: (theme: Theme, seed: number, intensity: BackdropIntensity, size: ThreeStageSize) => BackdropBuilt<S>;
  pose: (state: S, ms: number) => void;
  /** "studio": the stage lights the scene with the studio environment map (for reflective materials). */
  environment?: "studio";
}

/** Widens a variant's typed builder to the table's shape. */
const builder = <S>(b: BackdropBuilder<S>): BackdropBuilder => b as unknown as BackdropBuilder;

export const BACKDROP_BUILDERS: Partial<Record<BackdropVariant, BackdropBuilder>> = {
  helix: builder({ build: (theme, seed, intensity, size) => buildHelixScene(theme, helixLayout(seed, intensity), size), pose: poseHelix }),
  blobs: builder({
    build: (theme, seed, intensity, size) => buildBlobsScene(theme, blobLayout(seed, intensity, size.width >= size.height), size),
    pose: poseBlobs,
    environment: "studio",
  }),
  tunnel: builder({ build: (theme, seed, intensity, size) => buildTunnelScene(theme, tunnelLayout(seed, intensity), size), pose: poseTunnel }),
};
