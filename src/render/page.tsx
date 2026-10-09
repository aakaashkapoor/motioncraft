// The page the browser renders: one storyboard frame at a time. `Frame` is pure
// (same inputs, same markup); `mountPage` wires it to the DOM and exposes
// `window.motioncraft.renderFrame(n)` so the driver can step through frames
// without reloading.

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { CAPTION_ATTRIBUTE, measureFrame } from "../checks/measure";
import type { FrameMeasurement } from "../checks/types";
import { buildTimeline, frameAt, scenesOnScreen, type ActiveScene, type SceneDurations, type Timeline } from "../engine/timeline";
import { Caption, kit } from "../kit";
import { SceneClockContext } from "../kit/frameContext";
import { Ground } from "../kit/Ground";
import { frameSize } from "../layout/frame";
import type { Storyboard } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { transitionStyle } from "../transitions";
import { morphEndpoints, morphProgress, sharedIds, type BoundaryMeasurement, type SharedMeasurements } from "../transitions/shared";
import { createPageEncoder, type PageEncoder } from "./encode";
import { fontLoadRequests } from "./fontFaces";
import { domImages, loadFonts, pageGate, waitUntilReady } from "./ready";
import { SHARED_SCENE_ATTRIBUTE, SharedMorph } from "./SharedMorph";
import { readSharedBoxes } from "./sharedMeasure";

/** Everything the page needs, serialized into the HTML as JSON. */
export interface PageInput {
  storyboard: Storyboard;
  theme: Theme;
  /** Scene durations in ms that override `durationMs` (see `buildTimeline`). The theme sets the default transition. */
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
  /**
   * Shared-element boxes per scene boundary, measured in the page. Where a
   * transition has some, its shared elements morph; without, every element
   * uses the scene presentation.
   */
  shared?: SharedMeasurements;
}

interface SceneLayerProps {
  storyboard: Storyboard;
  theme: Theme;
  fps: number;
  scene: ActiveScene;
  /** Hide this scene's shared originals: a morph draws them. */
  hideShared?: boolean;
}

/** One scene's component and caption. During a transition, wrapped in its presentation's style. */
function SceneLayer({ storyboard, theme, fps, scene: active, hideShared = false }: SceneLayerProps) {
  const scene = storyboard.scenes[active.sceneIndex]!;
  const Component = Object.hasOwn(kit, scene.component) ? kit[scene.component] : undefined;
  if (Component === undefined) {
    throw new Error(`scene "${scene.id}": unknown component "${scene.component}"`);
  }
  const { aspect } = storyboard;
  const common = { progress: active.progress, theme, aspect };
  const content = (
    <SceneClockContext.Provider value={{ fps, frame: active.localFrame, frames: active.sceneFrames }}>
      <Component {...scene.props} {...common} />
      {scene.narration !== undefined && (
        <div {...{ [CAPTION_ATTRIBUTE]: "" }}>
          <Caption {...common} text={scene.narration} />
        </div>
      )}
    </SceneClockContext.Provider>
  );
  if (active.transition === undefined) return content;
  const style = transitionStyle(active.transition, frameSize(aspect));
  const marker = hideShared ? { [SHARED_SCENE_ATTRIBUTE]: "" } : {};
  return (
    <div {...marker} style={{ position: "absolute", inset: 0, ...style }}>
      {content}
    </div>
  );
}

/** The boundary a frame's transition crosses, and the shared ids it can morph, if any. */
function morphAt(info: ReturnType<typeof frameAt>, shared: SharedMeasurements | undefined) {
  if (info.pair === undefined || shared === undefined) return undefined;
  const boundary = info.sceneIndex - 1;
  const measurement = shared.get(boundary);
  if (measurement === undefined) return undefined;
  const ids = sharedIds(measurement.from, measurement.to);
  return ids.length === 0 ? undefined : { boundary, measurement, ids };
}

/**
 * Exactly what is on screen at `frame`: the ground, then each scene's
 * component and caption. During a transition both scenes are stacked, the
 * incoming one on top, over one shared ground; elements the two scenes share
 * (see `shared`) are drawn once, morphing, above both.
 */
export function Frame({ storyboard, theme, timeline, frame, shared }: FrameProps) {
  const info = frameAt(timeline, frame);
  const size = frameSize(storyboard.aspect);
  const morph = morphAt(info, shared);
  const transition = morph === undefined ? undefined : timeline.transitions[morph.boundary]!;

  return (
    <div
      style={{
        position: "relative",
        width: size.width,
        height: size.height,
        overflow: "hidden",
        backgroundColor: theme.colors.ground,
      }}
    >
      <Ground theme={theme} aspect={storyboard.aspect} ms={(frame * 1000) / timeline.fps} />
      {scenesOnScreen(info).map((scene) => (
        <SceneLayer key={scene.sceneId} storyboard={storyboard} theme={theme} fps={timeline.fps} scene={scene} hideShared={morph !== undefined} />
      ))}
      {morph !== undefined && (
        <SharedMorph
          ids={morph.ids}
          measurement={morph.measurement}
          t={morphProgress(info.transition!.transitionProgress, transition!.frames, timeline.fps)}
          endpoints={morphEndpoints(timeline, morph.boundary)}
          size={size}
          renderScene={(scene) => <SceneLayer storyboard={storyboard} theme={theme} fps={timeline.fps} scene={scene} />}
        />
      )}
    </div>
  );
}

/** One scene alone, at rest (no presentation), on a frame-sized box: what shared elements are measured on. */
function MeasureFrame({ storyboard, theme, fps, scene }: { storyboard: Storyboard; theme: Theme; fps: number; scene: ActiveScene }) {
  const { width, height } = frameSize(storyboard.aspect);
  return (
    <div style={{ position: "relative", width, height, overflow: "hidden" }}>
      <SceneLayer storyboard={storyboard} theme={theme} fps={fps} scene={scene} />
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
  const timeline = buildTimeline(storyboard, durations as SceneDurations, theme);
  // React reports render errors here instead of throwing from flushSync.
  let renderError: unknown;
  const root = createRoot(container, {
    onUncaughtError(error) {
      renderError = error;
    },
  });

  // Load every bundled family at every kit weight up front: a weight no frame
  // has used yet must not be missing (or silently replaced) when one first does.
  const fontsHandle = pageGate.delayRender("bundled fonts");
  let fontsLoaded = false;
  loadFonts(fontLoadRequests(), (font) => document.fonts.load(font)).then(
    () => {
      fontsLoaded = true;
      pageGate.continueRender(fontsHandle);
    },
    (error: unknown) => pageGate.cancelRender(new Error(`a bundled font failed to load: ${String(error)}`)),
  );

  // Shared elements are measured on an invisible stage beside the frame: A at
  // the start of the transition and B at its end, once per boundary. Boxes
  // measured before the fonts load are used but not kept, and the frame is
  // redrawn once they have (see `waitUntilReady`).
  const stage = document.createElement("div");
  stage.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none";
  document.body.append(stage);
  const stageRoot = createRoot(stage, {
    onUncaughtError(error) {
      renderError = error;
    },
  });
  const measured = new Map<number, BoundaryMeasurement>();
  let provisional = false;
  const measureScene = (scene: ActiveScene) => {
    flushSync(() => stageRoot.render(<MeasureFrame storyboard={storyboard} theme={theme} fps={timeline.fps} scene={scene} />));
    if (renderError !== undefined) throw renderError;
    return readSharedBoxes(stage.firstElementChild!);
  };
  const sharedFor = (frame: number): SharedMeasurements => {
    const info = frameAt(timeline, frame);
    if (info.pair === undefined) return measured;
    const boundary = info.sceneIndex - 1;
    if (measured.has(boundary)) return measured;
    const [from, to] = morphEndpoints(timeline, boundary);
    const measurement = { from: measureScene(from), to: measureScene(to) };
    flushSync(() => stageRoot.render(null));
    if (fontsLoaded) return measured.set(boundary, measurement);
    provisional = true;
    return new Map([...measured, [boundary, measurement]]);
  };

  let current = 0;
  const renderFrame = (frame: number) => {
    renderError = undefined;
    current = frame;
    provisional = false;
    const shared = sharedFor(frame);
    // Commit synchronously so the DOM shows `frame` when this returns.
    flushSync(() => {
      root.render(<Frame storyboard={storyboard} theme={theme} timeline={timeline} frame={frame} shared={shared} />);
    });
    if (renderError !== undefined) throw renderError;
  };

  window.motioncraft = {
    totalFrames: timeline.totalFrames,
    renderFrame,
    async waitUntilReady(timeoutMs) {
      const sources = { fonts: () => document.fonts.ready, images: () => domImages(container) };
      await waitUntilReady(pageGate, sources, timeoutMs);
      if (!provisional) return;
      renderFrame(current);
      await waitUntilReady(pageGate, sources, timeoutMs);
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
