// Browser entry for tests/three-stage.test.tsx: mounts a ThreeStage (a lit box
// turned by the scene clock) and a useThreeAsset probe, and exposes them to the
// test on `window.threeTest`. Counts requestAnimationFrame calls from the start,
// and renderer.render calls. In React's development build everything is
// mounted under StrictMode, which replays mount effects.

import { StrictMode, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { SceneClockContext } from "../src/kit/frameContext";
import { ThreeStage, useThreeAsset, type ThreeBuilt, type ThreeStageSize } from "../src/kit/three";
import { pageGate } from "../src/render/ready";

let rafCalls = 0;
const requestFrame = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (callback) => {
  rafCalls++;
  return requestFrame(callback);
};

// WebGLRenderer sets `render` on each instance, so each stage's renderer is
// wrapped the first time `update` sees it (update runs before every render).
let renders = 0;
const counted = new WeakSet<THREE.WebGLRenderer>();
function countRenders(renderer: THREE.WebGLRenderer) {
  if (counted.has(renderer)) return;
  counted.add(renderer);
  const render = renderer.render.bind(renderer);
  renderer.render = (...args) => {
    renders++;
    render(...args);
  };
}

// Every canvas given a WebGL context, to see that unmounting loses it.
const canvases: HTMLCanvasElement[] = [];
const getContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
  if (type.startsWith("webgl") && !canvases.includes(this)) canvases.push(this);
  return (getContext as (...a: unknown[]) => unknown).call(this, type, ...rest);
} as typeof getContext;
const strict = (children: ReactNode) => (process.env.NODE_ENV === "production" ? children : <StrictMode>{children}</StrictMode>);

const FPS = 30;
const FRAMES = 60;
const AREAS = [
  { x: 20, y: 10, width: 160, height: 90 },
  { x: 0, y: 0, width: 90, height: 160 },
];

const updates: number[] = [];
let builds = 0;
let camera: THREE.PerspectiveCamera | undefined;

function build(size: ThreeStageSize): ThreeBuilt {
  builds++;
  const scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, size.width / size.height, 0.1, 100);
  camera.position.set(0, 0, 5);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: 0x3366ff }));
  box.name = "box";
  scene.add(box);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(2, 3, 4);
  scene.add(light);
  return { scene, camera, keys: [{ label: "box", object: box }] };
}

const container = document.createElement("div");
container.style.cssText = "position:relative;width:400px;height:300px";
document.body.append(container);
const root = createRoot(container);

function renderAt(frame: number, areaIndex = 0) {
  flushSync(() =>
    root.render(
      strict(<SceneClockContext.Provider value={{ fps: FPS, frame, frames: FRAMES }}>
        <ThreeStage
          area={AREAS[areaIndex]}
          aspect="16:9"
          progress={frame / (FRAMES - 1)}
          label="test stage"
          build={build}
          update={(ctx, ms) => {
            countRenders(ctx.renderer);
            updates.push(ms);
            const box = ctx.scene.getObjectByName("box")!;
            box.rotation.set(ms / 900, ms / 600, 0);
          }}
        />
      </SceneClockContext.Provider>),
    ),
  );
  const all = container.querySelectorAll("canvas");
  const canvas = all[0]!;
  // Copy through a 2D canvas to count the pixels the stage drew.
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext("2d")!;
  context.drawImage(canvas, 0, 0);
  const data = context.getImageData(0, 0, copy.width, copy.height).data;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) opaque++;
  const style = getComputedStyle(canvas);
  return {
    canvasCount: all.length,
    contexts: canvases.length,
    cameraAspect: camera!.aspect,
    image: canvas.toDataURL("image/png"),
    opaque,
    width: canvas.width,
    height: canvas.height,
    cssWidth: style.width,
    cssHeight: style.height,
    left: canvas.getBoundingClientRect().left - container.getBoundingClientRect().left,
    top: canvas.getBoundingClientRect().top - container.getBoundingClientRect().top,
  };
}

// The asset probe: shows the loaded value as text, so the test can see what
// the committed DOM holds the moment the gate goes idle.
let loads = 0;
let settle: { resolve: (value: string) => void; reject: (error: unknown) => void } | undefined;
let throws = false;
function load(): Promise<string> {
  loads++;
  if (throws) throw new Error("load threw");
  return new Promise((resolve, reject) => (settle = { resolve, reject }));
}
function Probe() {
  const value = useThreeAsset("probe", load);
  return <p id="probe">{value ?? "loading"}</p>;
}
const probeContainer = document.createElement("div");
document.body.append(probeContainer);
const probeRoot = createRoot(probeContainer);
const probeText = () => document.getElementById("probe")?.textContent ?? null;

const threeTest = {
  renderAt,
  updates: () => [...updates],
  clearUpdates: () => void updates.splice(0),
  rafCalls: () => rafCalls,
  renders: () => renders,
  builds: () => builds,
  /** Unmounts the stage; reports the canvases left in the page and whether each stage canvas lost its context. */
  unmountStage() {
    flushSync(() => root.render(null));
    return { canvasesLeft: container.querySelectorAll("canvas").length, lost: canvases.map((canvas) => !canvas.isConnected && (canvas.getContext("webgl2")?.isContextLost() ?? true)) };
  },
  mountProbe(throwing = false) {
    loads = 0;
    throws = throwing;
    // Re-render a few times: the load must start once, keyed by its label.
    for (let i = 0; i < 3; i++) flushSync(() => probeRoot.render(strict(<Probe key="probe" />)));
    return { pending: pageGate.pending(), loads, text: probeText() };
  },
  unmountProbe() {
    flushSync(() => probeRoot.render(null));
    return pageGate.pending();
  },
  /** Resolves the load, then reports what the DOM shows once the gate is idle. */
  async resolveProbe(value: string) {
    settle!.resolve(value);
    await pageGate.idle();
    return { pending: pageGate.pending(), loads, text: probeText() };
  },
  /** Rejects the load (unless it already threw), then reports how waiting on the gate ends. */
  async rejectProbe(message: string) {
    settle?.reject(new Error(message));
    try {
      await pageGate.idle();
      return { error: null, pending: pageGate.pending() };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), pending: pageGate.pending() };
    }
  },
  pending: () => pageGate.pending(),
};

(window as unknown as { threeTest: typeof threeTest }).threeTest = threeTest;
