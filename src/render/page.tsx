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
import { buildTimeline, frameAt, scenesOnScreen, type ActiveScene, type FrameInfo, type SceneDurations, type Timeline } from "../engine/timeline";
import { Caption } from "../kit";
import { sceneComponent } from "../kit/internal";
import type { PageNarration } from "../narration/types";
import { SceneClockContext, SceneWordsContext } from "../kit/frameContext";
import { resolveCue } from "../kit/cues";
import { sceneWords } from "../kit/sceneWords";
import { Ground } from "../kit/Ground";
import { captionsShown, withCaptionsShown } from "../layout/caption";
import { frameSize } from "../layout/frame";
import { Overlays } from "../overlays/Overlays";
import { sceneAreaUnderOverlays } from "../overlays/sceneHeaders";
import { storyboardViewfinderLayout, Viewfinder } from "../overlays/Viewfinder";
import { FULL_BLEED_COMPONENTS } from "../kit/media";
import { WIDE_SHOT, opensSettled, type Storyboard, type StoryboardScene } from "../storyboard/types";
import { sceneTheme } from "../theme/field";
import type { Theme } from "../theme/types";
import { transitionOverlay } from "../transitions";
import { morphEndpoints, morphProgress, sharedIds, type BoundaryMeasurement, type SharedMeasurements } from "../transitions/shared";
import { mixAndEncodeAudio, type EncodedAudio } from "./audioEncode";
import type { AudioPlan } from "./audioPlan";
import { createPageEncoder, type PageEncoder } from "./encode";
import { cutsAtMidpoint, sceneGround } from "./fieldCut";
import { fieldTransitionStyle } from "./fieldWipe";
import { fontLoadRequests } from "./fontFaces";
import { domImages, loadFonts, pageGate, READY_TIMEOUT_MS, waitUntilReady } from "./ready";
import { startPlayer } from "./player";
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
  /** An exported web page (scripts/page.ts): scale to the window and answer `motioncraft:*` messages (see `startPlayer`). A render leaves it unset. */
  player?: boolean;
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
  /** Paint the scene's own opaque field (its ground colour and ground style) beneath it: on during a transition between scenes on different grounds. */
  field?: boolean;
  /** Milliseconds into the video, for the field's moving ground style. */
  ms?: number;
}

/** A scene's narration words on its clock, for word cues: the voice's words, or an even estimate without cached audio. */
function wordsOf(theme: Theme, scene: StoryboardScene, sceneFrames: number, fps: number, narration: PageInput["narration"]) {
  return scene.narration === undefined ? [] : sceneWords(theme, scene.narration, ((sceneFrames - 1) * 1000) / fps, narration?.[scene.id]?.words);
}

/**
 * One scene's component, in its camera's world, and its caption, which stays
 * fixed, all in the scene's field theme (see `sceneTheme`). With `field`, on
 * its own opaque field. During a transition, wrapped in its presentation's
 * style, with the presentation's overlay (iris's ring) drawn above it.
 */
function SceneLayer({ storyboard, theme: frameTheme, fps, scene: active, hideShared = false, targets, effectTargets, camera, narration, effects = true, field = false, ms = 0 }: SceneLayerProps) {
  const scene = storyboard.scenes[active.sceneIndex]!;
  // Without captions the content takes the caption band too (see `contentArea`).
  const theme = sceneTheme(withCaptionsShown(frameTheme, captionsShown(storyboard)), scene);
  const Component = sceneComponent(scene.component);
  if (Component === undefined) {
    throw new Error(`scene "${scene.id}": unknown component "${scene.component}"`);
  }
  const { aspect } = storyboard;
  const common = { progress: active.progress, theme, aspect };
  // A viewfinder frame: the scene lays out between its rows and the caption lifts above its ruler.
  const framed = storyboard.frame === undefined ? undefined : storyboardViewfinderLayout(theme, storyboard.frame, storyboard.scenes, aspect, fps);
  // A top-corner overlay that would crowd this scene's eyebrow or headline: the scene lays out below it instead.
  const headerArea =
    framed !== undefined
      ? FULL_BLEED_COMPONENTS.has(scene.component)
        ? undefined
        : framed.contentArea(captionsShown(storyboard))
      : sceneAreaUnderOverlays(theme, aspect, scene, storyboard.overlays ?? []);
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
  const scenery = (
    <SceneClockContext.Provider value={{ fps, frame: active.localFrame, frames: active.sceneFrames, settled: opensSettled(storyboard, active.sceneIndex) }}>
      <SceneWordsContext.Provider value={words}>
        <CameraWorld view={view} aspect={aspect} {...(drawEffects ? { effects: scene.id } : {})}>
          <Component {...scene.props} {...common} {...(headerArea !== undefined && { area: headerArea })} />
          {drawEffects && <SceneEffects sceneId={scene.id} effects={scene.effects!} targets={effectTargets?.get(active.sceneIndex)} {...common} />}
        </CameraWorld>
      </SceneWordsContext.Provider>
      {scene.narration !== undefined && storyboard.captionStyle !== "off" && (
        <div {...{ [CAPTION_ATTRIBUTE]: "" }} {...(framed !== undefined && framed.captionLift > 0 && { style: { position: "absolute", inset: 0, transform: `translateY(${-framed.captionLift}px)` } })}>
          <Caption {...common} text={scene.narration} captionStyle={storyboard.captionStyle} words={narration?.[scene.id]?.words} />
        </div>
      )}
    </SceneClockContext.Provider>
  );
  // The field is opaque and full-frame and the text sits inside it, so the contrast check reads the field beneath the text.
  const content = field ? (
    <div data-field={scene.ground ?? "ground"} style={{ position: "absolute", inset: 0, backgroundColor: theme.colors.ground }}>
      <Ground theme={theme} aspect={aspect} ms={ms} />
      {scenery}
    </div>
  ) : (
    scenery
  );
  if (active.transition === undefined) return content;
  // Between two fields a wipe has a hard edge, so the swatches never blend.
  const style = fieldTransitionStyle(active.transition, frameSize(aspect), field);
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

/** Whether `info` is inside a transition between two fields that cuts at its midpoint (see `cutsAtMidpoint`). */
function cutsHere(storyboard: Storyboard, theme: Theme, info: FrameInfo): boolean {
  return info.pair !== undefined && cutsAtMidpoint(storyboard, info.sceneIndex - 1, theme);
}

/**
 * The scenes drawn at `info`: both during a transition, except across a
 * field-to-field crossfade (`cut`), which shows the outgoing scene alone
 * before its midpoint and the incoming one from there, neither styled by the
 * transition. The incoming scene's clock still runs from the transition's
 * start, so a cut skips the first half of its entrance.
 */
function scenesDrawn(info: FrameInfo, cut: boolean): ActiveScene[] {
  if (!cut) return scenesOnScreen(info);
  const [outgoing, incoming] = info.pair!;
  // The transition state is dropped: the shown scene is drawn as if no transition ran.
  const { transition: _discarded, ...shown } = outgoing.transition!.transitionProgress < 0.5 ? outgoing : incoming;
  return [shown];
}

/** The scene that reads as on screen: the one drawn, or during a transition the outgoing one until its midpoint, then the incoming one. */
function shownScene(drawn: readonly ActiveScene[]): ActiveScene {
  const [first, second] = drawn as [ActiveScene, ActiveScene?];
  if (second === undefined) return first;
  return first.transition!.transitionProgress < 0.5 ? first : second;
}

/**
 * Exactly what is on screen at `frame`: the ground, then each scene's
 * component and caption, then the viewfinder frame and the overlays above them all. During a transition both scenes are stacked, the
 * incoming one on top, over one shared ground; elements the two scenes share
 * (see `shared`) are drawn once, morphing, above both. The ground is the
 * shown scene's (its palette field, see `sceneTheme`). During a transition
 * between scenes on different grounds, each scene paints its own field
 * instead, and a crossfade between them cuts at its midpoint (see
 * `cutsAtMidpoint`).
 */
export function Frame({ storyboard, theme, timeline, frame, shared, targets, effectTargets, camera = "live", narration }: FrameProps) {
  const info = frameAt(timeline, frame);
  const size = frameSize(storyboard.aspect);
  const cut = cutsHere(storyboard, theme, info);
  const drawn = scenesDrawn(info, cut);
  const morph = cut ? undefined : morphAt(info, shared);
  const transition = morph === undefined ? undefined : timeline.transitions[morph.boundary]!;
  const ms = (frame * 1000) / timeline.fps;
  const grounds = drawn.map((scene) => sceneGround(storyboard.scenes[scene.sceneIndex]!));
  // Two scenes on different grounds: each brings its own field, so wipes and irises reveal one over the other.
  const field = new Set(grounds).size > 1;
  const layer = { storyboard, theme, fps: timeline.fps, targets, effectTargets, camera, narration, field, ms };
  // The ground, and the overlays above everything, take the shown scene's theme.
  const shownIndex = shownScene(drawn).sceneIndex;
  const shown = storyboard.scenes[shownIndex]!;
  const onScreen = sceneTheme(theme, shown);
  const rootField = !field && sceneGround(shown) !== "ground" ? { "data-frame-field": sceneGround(shown) } : {};

  return (
    <div
      {...rootField}
      style={{
        position: "relative",
        width: size.width,
        height: size.height,
        overflow: "hidden",
        backgroundColor: onScreen.colors.ground,
      }}
    >
      {!field && <Ground theme={onScreen} aspect={storyboard.aspect} ms={ms} />}
      {drawn.map((scene) => (
        <SceneLayer key={scene.sceneId} {...layer} scene={scene} hideShared={morph !== undefined} />
      ))}
      {morph !== undefined && (
        <SharedMorph
          ids={morph.ids}
          measurement={morph.measurement}
          t={morphProgress(info.transition!.transitionProgress, transition!.frames, timeline.fps)}
          endpoints={morphEndpoints(timeline, morph.boundary)}
          size={size}
          renderScene={(scene) => <SceneLayer {...layer} camera="live" scene={scene} field={false} />}
        />
      )}
      {storyboard.frame !== undefined && (
        <Viewfinder frameSpec={storyboard.frame} scenes={storyboard.scenes} sceneIndex={shownIndex} theme={onScreen} aspect={storyboard.aspect} timeline={timeline} frame={frame} />
      )}
      {storyboard.overlays !== undefined && (
        <Overlays overlays={storyboard.overlays} sceneIds={storyboard.scenes.map((scene) => scene.id)} theme={onScreen} aspect={storyboard.aspect} timeline={timeline} frame={frame} />
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

  const { storyboard, theme, durations, narration, player } = JSON.parse(json) as PageInput;
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
    // A field-to-field crossfade cuts at its midpoint: nothing morphs across it.
    if (info.pair === undefined || cutsAtMidpoint(storyboard, info.sceneIndex - 1, theme)) return measured;
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
  if (player !== true) return;
  const api = window.motioncraft;
  startPlayer({
    container,
    size: frameSize(storyboard.aspect),
    ground: sceneTheme(theme, storyboard.scenes[0]!).colors.ground,
    fps: timeline.fps,
    totalFrames: timeline.totalFrames,
    renderFrame,
    waitUntilReady: () => api.waitUntilReady(READY_TIMEOUT_MS),
  });
}
