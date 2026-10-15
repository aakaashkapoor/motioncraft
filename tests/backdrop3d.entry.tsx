// Browser entry for tests/kit-backdrop3d-pixels.test.ts: draws Backdrop3D at a
// frame on a fresh stage and reports the canvas on `window.backdrop3d`.

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Backdrop3D } from "../src/kit/Backdrop3D";
import type { BackdropVariant } from "../src/kit/backdrop3dPlan";
import { SceneClockContext } from "../src/kit/frameContext";
import { fieldTheme } from "../src/theme/field";
import { resolveTheme } from "../src/theme/resolve";

const theme = fieldTheme(resolveTheme({ theme: "dark", palette: "reel" }), "p3");
const container = document.createElement("div");
container.style.cssText = "position:relative;width:1920px;height:1080px";
document.body.append(container);
const root = createRoot(container);

function draw(variant: BackdropVariant, seed: number, frame: number): string {
  flushSync(() => root.render(null));
  flushSync(() =>
    root.render(
      <SceneClockContext.Provider value={{ fps: 30, frame, frames: 150 }}>
        <Backdrop3D variant={variant} seed={seed} intensity="busy" progress={frame / 149} theme={theme} aspect="16:9" />
      </SceneClockContext.Provider>,
    ),
  );
  return container.querySelector("canvas")!.toDataURL("image/png");
}

(window as unknown as { backdrop3d: { draw: typeof draw } }).backdrop3d = { draw };
