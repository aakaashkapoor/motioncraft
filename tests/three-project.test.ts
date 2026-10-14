// projectBox: where a 3D object lands in the frame. Every expected rect here is
// worked out by hand from the camera's geometry, not by projecting again.

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { projectBox } from "../src/kit/three/project";
import type { Rect } from "../src/layout/frame";

function expectRect(actual: Rect | undefined, expected: Rect): void {
  expect(actual).toBeDefined();
  for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(actual![key] - expected[key]), key).toBeLessThan(1);
}

const box = (min: [number, number, number], max: [number, number, number]) => new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));

/** A camera at (0, 0, 10) looking down -z, as three makes it. */
function perspective(fov: number, aspect: number, near = 0.1): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, 100);
  camera.position.set(0, 0, 10);
  return camera;
}

describe("projectBox", () => {
  it("projects a centred cube through a 90 degree perspective camera, offset by the stage", () => {
    // The front face (z = 1) is 9 away and tan(45) = 1, so x and y reach +-1/9 in NDC:
    // 900 px * (1 -+ 1/9) / 2 = 400 and 500 px, plus the stage's (100, 50).
    const rect = projectBox(box([-1, -1, -1], [1, 1, 1]), perspective(90, 1), { x: 100, y: 50, width: 900, height: 900 });
    expectRect(rect, { x: 500, y: 450, width: 100, height: 100 });
  });

  it("projects an off-centre box on a wide stage, with y down", () => {
    // NDC x = x / (2d) (aspect 2), y = y / d. Right edge x = 3 at d = 9: 1/6; left x = 1 at d = 11: 1/22.
    // Top y = 2 at d = 9: 2/9; bottom y = 0. Screen x = 900 + 900 ndc, y = 450 - 450 ndc.
    const rect = projectBox(box([1, 0, -1], [3, 2, 1]), perspective(90, 2), { x: 0, y: 0, width: 1800, height: 900 });
    expectRect(rect, { x: 900 + 900 / 22, y: 350, width: 150 - 900 / 22, height: 100 });
  });

  it("takes an object's world bounds, updating its matrices first", () => {
    const parent = new THREE.Group();
    parent.position.set(1, 0, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.position.set(1, 1, 0);
    parent.add(mesh);
    // World box (1..3, 0..2, -1..1): the same as the test above.
    const rect = projectBox(parent, perspective(90, 2), { x: 0, y: 0, width: 1800, height: 900 });
    expectRect(rect, { x: 900 + 900 / 22, y: 350, width: 150 - 900 / 22, height: 100 });
  });

  it("measures a turned mesh by its own box, not a world-aligned box around it", () => {
    // A 2-unit cube turned 45 degrees about y: corners (+-sqrt2, +-1, 0) and (0, +-1, +-sqrt2).
    // x reaches sqrt2 / 10 (at d = 10); y reaches 1 / (10 - sqrt2) (the front corner).
    // A world-aligned box would put x = sqrt2 at d = 10 - sqrt2 instead: 16% wider.
    const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    cube.rotation.y = Math.PI / 4;
    const rect = projectBox(cube, perspective(90, 1), { x: 0, y: 0, width: 1000, height: 1000 });
    const halfX = 500 * (Math.SQRT2 / 10);
    const halfY = 500 * (1 / (10 - Math.SQRT2));
    expectRect(rect, { x: 500 - halfX, y: 500 - halfY, width: 2 * halfX, height: 2 * halfY });
  });

  it("leaves hidden children out, and is undefined for a hidden object", () => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)));
    const far = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    far.position.set(5, 0, 0);
    far.visible = false;
    group.add(far);
    // As the centred cube above: 900 px * (1 -+ 1/9) / 2.
    expectRect(projectBox(group, perspective(90, 1), { x: 0, y: 0, width: 900, height: 900 }), { x: 400, y: 400, width: 100, height: 100 });
    group.visible = false;
    expect(projectBox(group, perspective(90, 1), { x: 0, y: 0, width: 900, height: 900 })).toBeUndefined();
  });

  it("projects through an orthographic camera", () => {
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 100);
    camera.position.set(0, 0, 10);
    // NDC x = x / 4: -0.25..0.5 -> 10 + 400 (1 + ndc) = 310..610; y = y / 3: -1/3..0.5 -> 20 + 300 (1 - ndc) = 170..420.
    const rect = projectBox(box([-1, -1, -1], [2, 1.5, 1]), camera, { x: 10, y: 20, width: 800, height: 600 });
    expectRect(rect, { x: 310, y: 170, width: 300, height: 250 });
  });

  it("follows a camera that was moved and turned", () => {
    // Looking at the origin from +x: world z becomes screen x (z = -1 is on the right).
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
    camera.position.set(10, 0, 0);
    camera.lookAt(0, 0, 0);
    const rect = projectBox(box([-1, -1, -1], [1, 1, 1]), camera, { x: 0, y: 0, width: 900, height: 900 });
    expectRect(rect, { x: 400, y: 400, width: 100, height: 100 });
  });

  it("is undefined for a box wholly behind the camera, or an empty one", () => {
    expect(projectBox(box([-1, -1, 11], [1, 1, 13]), perspective(90, 1), { x: 0, y: 0, width: 900, height: 900 })).toBeUndefined();
    expect(projectBox(new THREE.Group(), perspective(90, 1), { x: 0, y: 0, width: 900, height: 900 })).toBeUndefined();
  });

  it("clips a box that reaches behind the camera at the near plane", () => {
    // Near plane at d = 1 (world z = 9): the box's slice there spans x, y +-1, which is NDC +-1: the whole stage.
    const rect = projectBox(box([-1, -1, 5], [1, 1, 15]), perspective(90, 1, 1), { x: 30, y: 40, width: 900, height: 900 });
    expectRect(rect, { x: 30, y: 40, width: 900, height: 900 });
    // Only the upper right of the axis: x, y 0..1 sliced at d = 1 reach NDC 0..1, the stage's upper right quarter.
    const quarter = projectBox(box([0, 0, 5], [1, 1, 15]), perspective(90, 1, 1), { x: 0, y: 0, width: 900, height: 900 });
    expectRect(quarter, { x: 450, y: 0, width: 450, height: 450 });
  });
});
