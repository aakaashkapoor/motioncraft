// The page the browser renders: one storyboard frame at a time. `Frame` is pure
// (same inputs, same markup); `mountPage` wires it to the DOM and exposes
// `window.motioncraft.renderFrame(n)` so the driver can step through frames
// without reloading.

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { CAPTION_ATTRIBUTE, measureFrame } from "../checks/measure";
import type { FrameMeasurement } from "../checks/types";
import { buildTimeline, frameAt, type SceneDurations, type Timeline } from "../engine/timeline";
import { Caption, kit } from "../kit";
import { SceneClockContext } from "../kit/frameContext";
import { Ground } from "../kit/Ground";
import { frameSize } from "../layout/frame";
import type { Storyboard } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { createPageEncoder, type PageEncoder } from "./encode";
import { domImages, pageGate, waitUntilReady } from "./ready";

/** Everything the page needs, serialized into the HTML as JSON. */
export interface PageInput {
  storyboard: Storyboard;
  theme: Theme;
  /** Scene durations in ms that override `durationMs` (see `buildTimeline`). */
  durations: Record<string, number>;
  /** Where relative media paths (`src`) resolve; the working directory by default. Used by Node, not the page. */
  mediaDir?: string;
}

export const INPUT_ELEMENT_ID = "motioncraft-input";
export const ROOT_ELEMENT_ID = "root";

export interface FrameProps {
  storyboard: Storyboard;
  theme: Theme;
  timeline: Timeline;
  frame: number;
}

/** Exactly what is on screen at `frame`: the ground, the scene's component and its caption. */
export function Frame({ storyboard, theme, timeline, frame }: FrameProps) {
  const info = frameAt(timeline, frame);
  const scene = storyboard.scenes[info.sceneIndex]!;
  const Component = Object.hasOwn(kit, scene.component) ? kit[scene.component] : undefined;
  if (Component === undefined) {
    throw new Error(`scene "${scene.id}": unknown component "${scene.component}"`);
  }
  const { aspect } = storyboard;
  const { width, height } = frameSize(aspect);
  const common = { progress: info.progress, theme, aspect };

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        backgroundColor: theme.colors.ground,
      }}
    >
      <Ground theme={theme} aspect={aspect} />
      <SceneClockContext.Provider value={{ fps: timeline.fps, frame: info.localFrame }}>
        <Component {...scene.props} {...common} />
      </SceneClockContext.Provider>
      {scene.narration !== undefined && (
        <div {...{ [CAPTION_ATTRIBUTE]: "" }}>
          <Caption {...common} text={scene.narration} />
        </div>
      )}
    </div>
  );
}

export interface PageApi {
  totalFrames: number;
  renderFrame(frame: number): void;
  /** Resolves once the frame on screen is ready to capture (see `waitUntilReady`). */
  waitUntilReady(timeoutMs: number): Promise<void>;
  /** The page's `delayRender`/`continueRender`, for the driver and tests. */
  delayRender(label: string): number;
  continueRender(handle: number): void;
  /** Measures the frame on screen for the layer-1 checks. */
  measureFrame(): FrameMeasurement;
  /** Encodes captured frames to H.264 (see `renderVideo`). */
  encoder: PageEncoder;
}

declare global {
  interface Window {
    motioncraft?: PageApi;
  }
}

/** Reads the embedded input, mounts React and exposes `window.motioncraft`. */
export function mountPage(): void {
  const json = document.getElementById(INPUT_ELEMENT_ID)?.textContent;
  const container = document.getElementById(ROOT_ELEMENT_ID);
  if (!json || !container) throw new Error("motioncraft page: missing input or root element");

  const { storyboard, theme, durations } = JSON.parse(json) as PageInput;
  const timeline = buildTimeline(storyboard, durations as SceneDurations);
  // React reports render errors here instead of throwing from flushSync.
  let renderError: unknown;
  const root = createRoot(container, {
    onUncaughtError(error) {
      renderError = error;
    },
  });

  // Load every bundled face up front: a face no frame has used yet must not be
  // missing (or silently replaced) when one first does.
  const fontsHandle = pageGate.delayRender("bundled fonts");
  Promise.all([...document.fonts].map((face) => face.load())).then(
    () => pageGate.continueRender(fontsHandle),
    (error: unknown) => pageGate.cancelRender(new Error(`a bundled font failed to load: ${String(error)}`)),
  );

  window.motioncraft = {
    totalFrames: timeline.totalFrames,
    renderFrame(frame) {
      renderError = undefined;
      // Commit synchronously so the DOM shows `frame` when this returns.
      flushSync(() => {
        root.render(<Frame storyboard={storyboard} theme={theme} timeline={timeline} frame={frame} />);
      });
      if (renderError !== undefined) throw renderError;
    },
    waitUntilReady(timeoutMs) {
      const sources = { fonts: () => document.fonts.ready, images: () => domImages(container) };
      return waitUntilReady(pageGate, sources, timeoutMs);
    },
    delayRender: (label) => pageGate.delayRender(label),
    continueRender: (handle) => pageGate.continueRender(handle),
    measureFrame() {
      const frame = container.firstElementChild;
      if (!frame) throw new Error("motioncraft page: no frame rendered yet");
      return measureFrame(frame);
    },
    encoder: createPageEncoder(),
  };
}
