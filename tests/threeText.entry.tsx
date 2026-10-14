// Browser entry for tests/three-text.test.ts: draws 3D text (Geist Bold, a
// material preset, the studio lights) in a ThreeStage and reports what the
// canvas shows on `window.threeText`.

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { SceneClockContext } from "../src/kit/frameContext";
import { material, studioEnvironment, studioLights, textGeometry, ThreeStage, type MaterialPreset, type ThreeStageSize } from "../src/kit/three";
import { darkTheme } from "../src/theme/dark";
import { lightTheme } from "../src/theme/light";

const THEMES = { light: lightTheme, dark: darkTheme };
const AREA = { x: 0, y: 0, width: 640, height: 360 };

const container = document.createElement("div");
container.style.cssText = `position:relative;width:${AREA.width}px;height:${AREA.height}px`;
document.body.append(container);
const root = createRoot(container);

function draw(text: string, preset: MaterialPreset, themeName: keyof typeof THEMES, environment: "studio" | "none" = "none", frame = 0) {
  const theme = THEMES[themeName];
  const build = (size: ThreeStageSize) => {
    const scene = new THREE.Scene();
    // Chrome in its own (grey) role; the others in the accent.
    const mesh = new THREE.Mesh(textGeometry(text, { size: 1 }), preset === "chrome" ? material(theme, preset) : material(theme, preset, "accent"));
    mesh.rotation.set(-0.12, 0.28, 0);
    scene.add(mesh);
    studioLights(scene, theme);
    const camera = new THREE.PerspectiveCamera(30, size.width / size.height, 0.1, 100);
    const box = new THREE.Box3().setFromObject(mesh);
    const width = box.max.x - box.min.x;
    // Back far enough that the text fills ~85% of the width.
    camera.position.set(0, 0, width / 0.85 / (2 * Math.tan(THREE.MathUtils.degToRad(15)) * camera.aspect) + box.max.z);
    return { scene, camera };
  };
  flushSync(() => root.render(null));
  const start = performance.now();
  flushSync(() =>
    root.render(
      <SceneClockContext.Provider value={{ fps: 30, frame, frames: 30 }}>
        <ThreeStage
          area={AREA}
          aspect="16:9"
          progress={frame / 29}
          label={text}
          build={build}
          update={(ctx, ms) => void ctx.scene.children[0]!.rotation.set(-0.12, 0.28 - ms / 4000, 0)}
          {...(environment === "studio" ? { environment } : {})}
        />
      </SceneClockContext.Provider>,
    ),
  );
  const mountMs = performance.now() - start;
  const canvas = container.querySelector("canvas")!;
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext("2d")!;
  context.drawImage(canvas, 0, 0);
  const data = context.getImageData(0, 0, copy.width, copy.height).data;
  // The stage is transparent: drawn pixels are the visibly opaque ones (glass is partly see-through).
  let drawn = 0;
  const columns = new Set<number>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! > 32) {
      drawn++;
      columns.add((i / 4) % copy.width);
    }
  }
  const xs = [...columns];
  return {
    width: copy.width,
    height: copy.height,
    drawn,
    columns: columns.size,
    left: Math.min(...xs),
    right: Math.max(...xs),
    image: canvas.toDataURL("image/png"),
    mountMs,
  };
}

/** How long making the studio environment takes on a fresh renderer, in ms (finished on the GPU). */
function timeEnvironment(): number {
  const renderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas") });
  renderer.setSize(640, 360, false);
  const gl = renderer.getContext();
  const start = performance.now();
  const env = studioEnvironment(renderer);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  const ms = performance.now() - start;
  env.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return ms;
}

(window as unknown as { threeText: { draw: typeof draw; timeEnvironment: typeof timeEnvironment } }).threeText = { draw, timeEnvironment };
