// The page the browser renders: one storyboard frame at a time. `Frame` is pure
// (same inputs, same markup); `mountPage` wires it to the DOM and exposes
// `window.motioncraft.renderFrame(n)` so the driver can step through frames
// without reloading.

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { CameraWorld } from "../camera/Camera";
import { drawsOverTarget, effectDrawMs } from "../camera/effectMotion";
import { SceneEffects } from "../camera/SceneEffects";
import { readTarget } from "../camera/measure";
import { cameraAt, type CameraMode, type CameraTargets, type SceneTargets, type ShotTargetBox } from "../camera/shots";
import { CAPTION_ATTRIBUTE, measureFrame } from "../checks/measure";
import type { FrameMeasurement } from "../checks/types";
import { buildTimeline, frameAt, scenesOnScreen, type ActiveScene, type SceneDurations, type Timeline } from "../engine/timeline";
import { Caption, kit } from "../kit";
import type { PageNarration } from "../narration/types";
import { SceneClockContext, SceneWordsContext } from "../kit/frameContext";
import { resolveCue } from "../kit/cues";
import { sceneWords } from "../kit/sceneWords";
import { Ground } from "../kit/Ground";
import { frameSize } from "../layout/frame";
import { Overlays } from "../overlays/Overlays";
import { sceneAreaUnderOverlays } from "../overlays/sceneHeaders";
import { WIDE_SHOT, opensSettled, type Storyboard, type StoryboardScene } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { transitionOverlay, transitionStyle } from "../transitions";
import { morphEndpoints, morphProgress, sharedIds, type BoundaryMeasurement, type SharedMeasurements } from "../transitions/shared";
import { mixAndEncodeAudio, type EncodedAudio } from "./audioEncode";
import type { AudioPlan } from "./audioPlan";
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
  /** Measured word times per scene id, on the scene's audio clock (0 = start of its audio). Captions use them instead of even spacing. */
  narration?: PageNarration;
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
  /**
   * Boxes of the scenes' shot targets, measured in the page (which stops with
   * an error when a target is not drawn). Here, a shot onto an element
   * without one is skipped.
   */
  targets?: CameraTargets;
  /**
   * Boxes of the scenes' ring and highlight targets by effect index, measured
   * in the page like shot targets. An effect without one is not drawn.
   */
  effectTargets?: CameraTargets;
  /** `live` (default) draws the camera as it plays; `steady` holds its breathing still, for the checks. */
  camera?: Exclude<CameraMode, "wide">;
  /** Measured word times per scene id (see `PageInput`). */
  narration?: PageInput["narration"];
}

interface SceneLayerProps {
  storyboard: Storyboard;
  theme: Theme;
  fps: number;
  scene: ActiveScene;
  /** Hide this scene's shared originals: a morph draws them. */
  hideShared?: boolean;
  targets?: CameraTargets;
  effectTargets?: CameraTargets;
  camera: CameraMode;
  narration?: PageInput["narration"];
  /** Draw the scene's effects (default). Off on the measuring stage, so boxes are measured at rest. */
  effects?: boolean;
}

/** A scene's narration words on its clock, for word cues: the voice's words, or an even estimate without cached audio. */
function wordsOf(theme: Theme, scene: StoryboardScene, sceneFrames: number, fps: number, narration: PageInput["narration"]) {
  return scene.narration === undefined ? [] : sceneWords(theme, scene.narration, ((sceneFrames - 1) * 1000) / fps, narration?.[scene.id]?.words);
}

/**
 * One scene's component, in its camera's world, and its caption, which stays
 * fixed. During a transition, wrapped in its presentation's style, with the
 * presentation's overlay (iris's ring) drawn above it.
 */
function SceneLayer({ storyboard, theme, fps, scene: active, hideShared = false, targets, effectTargets, camera, narration, effects = true }: SceneLayerProps) {
  const scene = storyboard.scenes[active.sceneIndex]!;
  const Component = Object.hasOwn(kit, scene.component) ? kit[scene.component] : undefined;
  if (Component === undefined) {
    throw new Error(`scene "${scene.id}": unknown component "${scene.component}"`);
  }
  const { aspect } = storyboard;
  const common = { progress: active.progress, theme, aspect };
  // A top-corner overlay that would crowd this scene's eyebrow or headline: the scene lays out below it instead.
  const headerArea = sceneAreaUnderOverlays(theme, aspect, scene, storyboard.overlays ?? []);
  const view = cameraAt({
    theme,
    aspect,
    sceneIndex: active.sceneIndex,
    ms: (active.localFrame * 1000) / fps,
    progress: active.progress,
    shots: scene.shots,
    targets: targets?.get(active.sceneIndex),
    mode: camera,
  });
  // Word cues resolve against these: the voice's words, or an even estimate without cached audio.
  const words = wordsOf(theme, scene, active.sceneFrames, fps, narration);
  const drawEffects = effects && camera !== "wide" && scene.effects !== undefined && scene.effects.length > 0;
  const content = (
    <SceneClockContext.Provider value={{ fps, frame: active.localFrame, frames: active.sceneFrames, settled: opensSettled(storyboard, active.sceneIndex) }}>
      <SceneWordsContext.Provider value={words}>
        <CameraWorld view={view} aspect={aspect} {...(drawEffects ? { effects: scene.id } : {})}>
          <Component {...scene.props} {...common} {...(headerArea !== undefined && { area: headerArea })} />
          {drawEffects && <SceneEffects sceneId={scene.id} effects={scene.effects!} targets={effectTargets?.get(active.sceneIndex)} {...common} />}
        </CameraWorld>
      </SceneWordsContext.Provider>
      {scene.narration !== undefined && storyboard.captionStyle !== "off" && (
        <div {...{ [CAPTION_ATTRIBUTE]: "" }}>
          <Caption {...common} text={scene.narration} captionStyle={storyboard.captionStyle} words={narration?.[scene.id]?.words} />
        </div>
      )}
    </SceneClockContext.Provider>
  );
  if (active.transition === undefined) return content;
  const style = transitionStyle(active.transition, frameSize(aspect));
  const overlay = transitionOverlay(active.transition, frameSize(aspect), theme.colors.accent);
  const marker = hideShared ? { [SHARED_SCENE_ATTRIBUTE]: "" } : {};
  return (
    <>
      <div {...marker} style={{ position: "absolute", inset: 0, ...style }}>
        {content}
      </div>
      {overlay !== undefined && <div style={overlay} />}
    </>
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
 * component and caption, then the overlays above them all. During a transition both scenes are stacked, the
 * incoming one on top, over one shared ground; elements the two scenes share
 * (see `shared`) are drawn once, morphing, above both.
 */
export function Frame({ storyboard, theme, timeline, frame, shared, targets, effectTargets, camera = "live", narration }: FrameProps) {
  const info = frameAt(timeline, frame);
  const size = frameSize(storyboard.aspect);
  const morph = morphAt(info, shared);
  const transition = morph === undefined ? undefined : timeline.transitions[morph.boundary]!;
  const layer = { storyboard, theme, fps: timeline.fps, targets, effectTargets, camera, narration };

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
        <SceneLayer key={scene.sceneId} {...layer} scene={scene} hideShared={morph !== undefined} />
      ))}
      {morph !== undefined && (
        <SharedMorph
          ids={morph.ids}
          measurement={morph.measurement}
          t={morphProgress(info.transition!.transitionProgress, transition!.frames, timeline.fps)}
          endpoints={morphEndpoints(timeline, morph.boundary)}
          size={size}
          renderScene={(scene) => <SceneLayer {...layer} camera="live" scene={scene} />}
        />
      )}
      {storyboard.overlays !== undefined && (
        <Overlays overlays={storyboard.overlays} sceneIds={storyboard.scenes.map((scene) => scene.id)} theme={theme} aspect={storyboard.aspect} timeline={timeline} frame={frame} />
      )}
    </div>
  );
}

/**
 * One scene alone, out of any transition, on a frame-sized box: what shared
 * elements are measured on (through the camera, as drawn), and shot targets
 * (with the camera wide).
 */
function MeasureFrame(props: { storyboard: Storyboard; theme: Theme; fps: number; scene: ActiveScene; targets?: CameraTargets; camera: CameraMode; narration?: PageInput["narration"] }) {
  const { width, height } = frameSize(props.storyboard.aspect);
  return (
    <div style={{ position: "relative", width, height, overflow: "hidden" }}>
      <SceneLayer {...props} effects={false} />
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
  /** Mixes the audio plan and encodes it as AAC or Opus (see `renderVideo`). */
  mixAndEncodeAudio(plan: AudioPlan): Promise<EncodedAudio>;
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

  const { storyboard, theme, durations, narration } = JSON.parse(json) as PageInput;
  const timeline = buildTimeline(storyboard, durations as SceneDurations, theme);
  // React reports render errors here instead of throwing from flushSync.
  let renderError: unknown;
  const root = createRoot(container, {
    onUncaughtError(error) {
      renderError = error;
    },
  });

  // Load every bundled family at every kit weight up front, and the
  // storyboard's brand faces: a weight no frame has used yet must not be
  // missing (or silently replaced) when one first does.
  const fontsHandle = pageGate.delayRender("bundled fonts");
  let fontsLoaded = false;
  loadFonts(fontLoadRequests(storyboard.fonts), (font) => document.fonts.load(font)).then(
    () => {
      fontsLoaded = true;
      pageGate.continueRender(fontsHandle);
    },
    (error: unknown) => pageGate.cancelRender(new Error(`a bundled or brand font failed to load: ${String(error)}`)),
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
  const stageScene = (scene: ActiveScene, camera: CameraMode) => {
    flushSync(() => stageRoot.render(<MeasureFrame storyboard={storyboard} theme={theme} fps={timeline.fps} scene={scene} targets={targets} camera={camera} narration={narration} />));
    if (renderError !== undefined) throw renderError;
    return stage.firstElementChild!;
  };

  // Shot targets, and the targets of rings and highlights, are measured on
  // the same stage, with the camera wide and no effects drawn, on the frame
  // each shot lands or each effect finishes drawing; once per scene. Boxes
  // measured before the fonts load are measured again once they have.
  const targets = new Map<number, SceneTargets>();
  const effectTargets = new Map<number, SceneTargets>();
  const provisionalTargets = new Set<number>();
  const measureTargets = (sceneIndex: number) => {
    if (targets.has(sceneIndex)) return;
    const scene = storyboard.scenes[sceneIndex]!;
    const { id, frames } = timeline.scenes[sceneIndex]!;
    const measure = (target: string, ms: number, what: string): ShotTargetBox => {
      const landed = Math.max(0, Math.min(frames - 1, Math.round((ms * timeline.fps) / 1000)));
      const at = { sceneIndex, sceneId: id, localFrame: landed, sceneFrames: frames, progress: frames === 1 ? 1 : landed / (frames - 1) };
      const box = readTarget(stageScene(at, "wide"), target);
      if (box === undefined) {
        flushSync(() => stageRoot.render(null));
        throw new Error(`scene "${scene.id}": ${what} target "${target}" is not drawn in the scene`);
      }
      return box;
    };
    const boxes = (scene.shots ?? []).map((shot): ShotTargetBox | undefined => {
      if (typeof shot.target !== "string" || shot.target === WIDE_SHOT) return undefined;
      return measure(shot.target, shot.atMs + (shot.durationMs ?? theme.motion.shot.ms), "shot");
    });
    const words = wordsOf(theme, scene, frames, timeline.fps, narration);
    const effectBoxes = (scene.effects ?? []).map((effect): ShotTargetBox | undefined =>
      drawsOverTarget(effect.kind) ? measure(effect.target, resolveCue(effect.at, words) + effectDrawMs(effect.kind), "effect") : undefined,
    );
    targets.set(sceneIndex, boxes);
    effectTargets.set(sceneIndex, effectBoxes);
    if ([...boxes, ...effectBoxes].every((box) => box === undefined)) return;
    flushSync(() => stageRoot.render(null));
    if (!fontsLoaded) provisionalTargets.add(sceneIndex);
  };

  const sharedFor = (frame: number): SharedMeasurements => {
    const info = frameAt(timeline, frame);
    if (info.pair === undefined) return measured;
    const boundary = info.sceneIndex - 1;
    if (measured.has(boundary)) return measured;
    const [from, to] = morphEndpoints(timeline, boundary);
    // Measured through each scene's camera, as drawn: the morph runs on screen, above both.
    const measurement = { from: readSharedBoxes(stageScene(from, "live")), to: readSharedBoxes(stageScene(to, "live")) };
    flushSync(() => stageRoot.render(null));
    if (fontsLoaded) return measured.set(boundary, measurement);
    provisional = true;
    return new Map([...measured, [boundary, measurement]]);
  };

  let current = 0;
  let shared: SharedMeasurements = measured;
  // Commits synchronously, so the DOM shows the frame when this returns.
  const draw = (camera: Exclude<CameraMode, "wide">) => {
    flushSync(() => {
      root.render(<Frame storyboard={storyboard} theme={theme} timeline={timeline} frame={current} shared={shared} targets={targets} effectTargets={effectTargets} camera={camera} narration={narration} />);
    });
    if (renderError !== undefined) throw renderError;
  };
  const renderFrame = (frame: number) => {
    renderError = undefined;
    current = frame;
    provisional = false;
    if (fontsLoaded) {
      for (const index of provisionalTargets) {
        targets.delete(index);
        effectTargets.delete(index);
      }
      provisionalTargets.clear();
    }
    for (const scene of scenesOnScreen(frameAt(timeline, frame))) measureTargets(scene.sceneIndex);
    shared = sharedFor(frame);
    if (provisionalTargets.size > 0) provisional = true;
    draw("live");
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
      if (!container.firstElementChild) throw new Error("motioncraft page: no frame rendered yet");
      if (!theme.motion.breathe.on) return measureFrame(container.firstElementChild);
      // The checks judge the frame with the breathing held still: it moves nothing far, and it is not layout. Shots stay.
      draw("steady");
      try {
        return measureFrame(container.firstElementChild!);
      } finally {
        draw("live");
      }
    },
    encoder: createPageEncoder(),
    mixAndEncodeAudio,
  };
}
