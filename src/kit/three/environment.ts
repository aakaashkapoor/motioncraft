// A studio environment map for reflective materials: three's RoomEnvironment
// (a lit box room built in code, nothing loaded) prefiltered with PMREM on the
// stage's renderer. Chrome and glass need something to reflect; without it a
// metal shows only the lights' small highlights and reads as a dark solid.
// The room is neutral grey and white, so it tints nothing: colour still comes
// from the theme through the materials.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export interface StudioEnvironment {
  texture: THREE.Texture;
  dispose(): void;
}

/** Makes the studio environment map for `renderer`; call `dispose` when the scene is done with it. */
export function studioEnvironment(renderer: THREE.WebGLRenderer): StudioEnvironment {
  const generator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = generator.fromScene(room, 0.04);
  room.dispose();
  generator.dispose();
  return { texture: target.texture, dispose: () => target.dispose() };
}
