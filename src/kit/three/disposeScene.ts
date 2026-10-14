// Frees the GPU resources a three.js scene holds: every geometry, material
// and texture reachable from it. Three never frees these on its own.

import * as THREE from "three";

function disposeMaterial(material: THREE.Material, done: Set<object>): void {
  if (done.has(material)) return;
  done.add(material);
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture && !done.has(value)) {
      done.add(value);
      value.dispose();
    }
  }
  material.dispose();
}

/** Disposes every geometry, material and texture under `scene`, each once, including its background and environment. */
export function disposeScene(scene: THREE.Scene): void {
  const done = new Set<object>();
  scene.traverse((object) => {
    const { geometry, material } = object as Partial<THREE.Mesh>;
    if (geometry instanceof THREE.BufferGeometry && !done.has(geometry)) {
      done.add(geometry);
      geometry.dispose();
    }
    const materials = Array.isArray(material) ? material : material === undefined ? [] : [material];
    for (const one of materials) disposeMaterial(one, done);
  });
  for (const texture of [scene.background, scene.environment]) {
    if (texture instanceof THREE.Texture && !done.has(texture)) {
      done.add(texture);
      texture.dispose();
    }
  }
}
