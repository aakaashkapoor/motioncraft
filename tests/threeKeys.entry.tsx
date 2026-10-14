// Browser entry for tests/three-keys.test.ts: a ThreeStage with three keys (a
// turning box, a "3D text" slab and a hidden cube) on a 1920x1080 frame, and
// the layer-1 measurement of that frame, next to where projectBox puts each key.
// And a stage with one turning box alone, to compare its key box with the
// pixels the canvas actually drew.

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { measureFrame } from "../src/checks/measure";
import { SceneClockContext } from "../src/kit/frameContext";
import { ThreeStage, type ThreeBuilt, type ThreeStageSize } from "../src/kit/three";
import { projectBox } from "../src/kit/three/project";

const FPS = 30;
const FRAMES = 90;
const AREA = { x: 300, y: 120, width: 1000, height: 700 };

const frameBox = document.createElement("div");
frameBox.style.cssText = "position:relative;width:1920px;height:1080px;overflow:hidden;background:#101820";
document.body.append(frameBox);
const root = createRoot(frameBox);

let camera: THREE.PerspectiveCamera | undefined;
const objects: Record<string, THREE.Object3D> = {};

function build(size: ThreeStageSize): ThreeBuilt {
  const scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, size.width / size.height, 0.1, 100);
  camera.position.set(0, 0.5, 8);
  camera.lookAt(0, 0, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3366ff });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), mat);
  box.position.set(-1.2, 0.4, 0);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.2), mat);
  slab.position.set(0.8, -1.2, 0.5);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  hidden.visible = false;
  scene.add(box, slab, hidden, new THREE.AmbientLight(0xffffff, 1));
  Object.assign(objects, { box, slab, hidden });
  return {
    scene,
    camera,
    keys: [
      { label: "box", object: box },
      { label: "title", object: slab, text: "Hello 3D", color: "#f4f4f0" },
      { label: "ghost", object: hidden },
    ],
  };
}

function renderAt(frame: number) {
  flushSync(() =>
    root.render(
      <SceneClockContext.Provider value={{ fps: FPS, frame, frames: FRAMES }}>
        <ThreeStage
          area={AREA}
          aspect="16:9"
          progress={frame / (FRAMES - 1)}
          label="key stage"
          build={build}
          update={(ctx, ms) => {
            ctx.scene.children[0]!.rotation.set(ms / 900, ms / 600, 0);
          }}
        />
      </SceneClockContext.Provider>,
    ),
  );
  const expected = Object.fromEntries(Object.entries(objects).map(([name, object]) => [name, projectBox(object, camera!, AREA) ?? null]));
  const keyBoxes = [...frameBox.querySelectorAll("[data-key-element]")].map((el) => {
    const style = getComputedStyle(el);
    return {
      label: el.getAttribute("data-key-element"),
      ariaLabel: el.getAttribute("aria-label"),
      role: el.getAttribute("role"),
      text: el.textContent,
      background: style.backgroundColor,
      borderWidth: style.borderTopWidth,
      opacity: style.opacity,
    };
  });
  return { measurement: measureFrame(frameBox), expected, keyBoxes };
}

// One turning box on a transparent canvas: where its key box is, and where its pixels are.
const SOLO = { x: 0, y: 0, width: 640, height: 480 };
const soloBox = document.createElement("div");
soloBox.style.cssText = `position:relative;width:${SOLO.width}px;height:${SOLO.height}px;overflow:hidden`;
document.body.append(soloBox);
const soloRoot = createRoot(soloBox);

function buildSolo(size: ThreeStageSize): ThreeBuilt {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(40, size.width / size.height, 0.1, 100);
  cam.position.set(0, 0, 6);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshBasicMaterial({ color: 0xff3366 }));
  cube.name = "cube";
  scene.add(cube);
  return { scene, camera: cam, keys: [{ label: "cube", object: cube }] };
}

function renderSolo(frame: number) {
  flushSync(() =>
    soloRoot.render(
      <SceneClockContext.Provider value={{ fps: FPS, frame, frames: FRAMES }}>
        <ThreeStage
          area={SOLO}
          aspect="16:9"
          progress={frame / (FRAMES - 1)}
          build={buildSolo}
          update={(ctx, ms) => {
            ctx.scene.getObjectByName("cube")!.rotation.set(0.3 + ms / 700, ms / 400, ms / 1100);
          }}
        />
      </SceneClockContext.Provider>,
    ),
  );
  const canvas = soloBox.querySelector("canvas")!;
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext("2d")!;
  context.drawImage(canvas, 0, 0);
  const data = context.getImageData(0, 0, copy.width, copy.height).data;
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let y = 0; y < copy.height; y++) {
    for (let x = 0; x < copy.width; x++) {
      if (data[(y * copy.width + x) * 4 + 3]! === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  const key = measureFrame(soloBox).keys[0]!;
  return { key: key.rect, pixels: { x: left, y: top, width: right - left, height: bottom - top } };
}

(window as unknown as { threeKeys: { renderAt: typeof renderAt; renderSolo: typeof renderSolo } }).threeKeys = { renderAt, renderSolo };
