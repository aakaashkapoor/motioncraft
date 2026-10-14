// disposeScene frees every geometry, material and texture under a scene, once each.

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { disposeScene } from "../src/kit/three/disposeScene";

describe("disposeScene", () => {
  it("disposes each geometry, material and texture once, including shared ones and the background", () => {
    const disposed: string[] = [];
    const track = <T extends THREE.EventDispatcher<{ dispose: object }>>(name: string, thing: T): T => {
      thing.addEventListener("dispose", () => disposed.push(name));
      return thing;
    };
    const map = track("map", new THREE.Texture());
    const geometry = track("box", new THREE.BoxGeometry());
    const shared = track("shared", new THREE.MeshStandardMaterial({ map }));
    const other = track("other", new THREE.MeshBasicMaterial({ map }));
    const scene = new THREE.Scene();
    scene.background = track("background", new THREE.Texture());
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, shared), new THREE.Mesh(geometry, [shared, other]));
    scene.add(group, new THREE.AmbientLight());

    disposeScene(scene);

    expect(disposed.sort()).toEqual(["background", "box", "map", "other", "shared"]);
  });
});
