// Where a 3D object lands in the frame: the screen rect of its geometry seen
// through a camera. Pure three.js math, no WebGL, so the checks can see into
// a ThreeStage (see `keyBoxes.ts`).
//
// An object is measured by the bounding box of each visible geometry under
// it, turned with its mesh (the box's 8 corners through `matrixWorld`), not
// by one world-axis-aligned box around everything: an axis-aligned box around
// a turned cube is up to ~20% larger on screen than the cube, and would flag
// a turning object well inside the safe area. Hidden children add nothing.
//
// Behind the camera: a box that reaches behind the camera is clipped at the
// camera's near plane, the way the renderer clips it, and the rect bounds the
// part in front. Projecting a corner behind the camera would flip it through
// the centre of the view and give a nonsense rect. A box with nothing in front
// of the near plane is not drawn at all, so the result is undefined.

import * as THREE from "three";
import type { Rect } from "../../layout/frame";

/** The 12 edges of a box, as pairs of corner indices (bit 0: max x, bit 1: max y, bit 2: max z). */
const EDGES: ReadonlyArray<readonly [number, number]> = [1, 2, 4].flatMap((bit) =>
  [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => (i & bit) === 0).map((i) => [i, i | bit] as const),
);

/** A box's 8 corners, in corner-index order, optionally moved by `matrix`. */
function corners(box: THREE.Box3, matrix?: THREE.Matrix4): THREE.Vector3[] {
  const { min, max } = box;
  return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const corner = new THREE.Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z);
    return matrix === undefined ? corner : corner.applyMatrix4(matrix);
  });
}

/** The world-space corners of every visible geometry's bounding box under `root`, one set of 8 per geometry. */
function geometryBoxes(root: THREE.Object3D): THREE.Vector3[][] {
  root.updateWorldMatrix(true, true);
  const boxes: THREE.Vector3[][] = [];
  root.traverseVisible((object) => {
    const { geometry } = object as Partial<THREE.Mesh>;
    if (!(geometry instanceof THREE.BufferGeometry)) return;
    if (geometry.boundingBox === null) geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    if (!box.isEmpty()) boxes.push(corners(box, object.matrixWorld));
  });
  return boxes;
}

/** The camera's near distance; a camera without one clips just in front of itself. */
function nearOf(camera: THREE.Camera): number {
  const near = (camera as Partial<THREE.PerspectiveCamera>).near;
  return typeof near === "number" && near > 0 ? near : 1e-6;
}

/**
 * The rect, in frame px, that `target` covers through `camera` on a stage
 * drawn at `stage` (frame px). An object is measured by its visible
 * geometries' own bounding boxes, turned with them; a `Box3` is a box in
 * world space. Not clipped to the stage: a box partly off the stage reaches
 * past it. Undefined when there is nothing to measure or all of it is behind
 * the near plane.
 */
export function projectBox(target: THREE.Object3D | THREE.Box3, camera: THREE.Camera, stage: Rect): Rect | undefined {
  const boxes = target instanceof THREE.Box3 ? (target.isEmpty() ? [] : [corners(target)]) : geometryBoxes(target);
  camera.updateWorldMatrix(true, false);

  // In view space the camera looks down -z; the near plane is z = -near.
  const near = nearOf(camera);
  const inFront = (p: THREE.Vector3) => p.z <= -near;
  const points: THREE.Vector3[] = [];
  for (const box of boxes) {
    const view = box.map((corner) => corner.clone().applyMatrix4(camera.matrixWorldInverse));
    points.push(...view.filter(inFront));
    for (const [a, b] of EDGES) {
      const p = view[a]!;
      const q = view[b]!;
      if (inFront(p) !== inFront(q)) points.push(p.clone().lerp(q, (-near - p.z) / (q.z - p.z)));
    }
  }
  if (points.length === 0) return undefined;

  // View space -> NDC (x, y in -1..1, y up) -> stage px (y down).
  const xs: number[] = [];
  const ys: number[] = [];
  for (const point of points) {
    const ndc = point.applyMatrix4(camera.projectionMatrix);
    xs.push(stage.x + ((ndc.x + 1) / 2) * stage.width);
    ys.push(stage.y + ((1 - ndc.y) / 2) * stage.height);
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
