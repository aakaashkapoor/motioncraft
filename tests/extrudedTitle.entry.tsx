// Browser entry for tests/kit-extrudedtitle-pixels.test.ts: draws ExtrudedTitle
// at a frame on a fresh stage and reports the canvas on `window.extrudedTitle`.

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ExtrudedTitle } from "../src/kit/ExtrudedTitle";
import { SceneClockContext } from "../src/kit/frameContext";
import { lightTheme } from "../src/theme/light";

const container = document.createElement("div");
container.style.cssText = "position:relative;width:1920px;height:1080px";
document.body.append(container);
const root = createRoot(container);

function draw(text: string, finish: "matte" | "glossy" | "chrome", frame: number): string {
  flushSync(() => root.render(null));
  flushSync(() =>
    root.render(
      <SceneClockContext.Provider value={{ fps: 30, frame, frames: 150 }}>
        <ExtrudedTitle text={text} finish={finish} accentLetters={[0]} progress={frame / 149} theme={lightTheme} aspect="16:9" />
      </SceneClockContext.Provider>,
    ),
  );
  return container.querySelector("canvas")!.toDataURL("image/png");
}

(window as unknown as { extrudedTitle: { draw: typeof draw } }).extrudedTitle = { draw };
