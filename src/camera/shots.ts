// Where the camera is at a given ms of a scene (design v3, life #1): wide,
// pushed in on a shot, or on its way between, with an optional breath over
// the whole scene on top. Pure; the page measures element targets (see
// `./measure`) and passes their boxes in.

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea } from "../layout/caption";
import { frameSize, type Rect } from "../layout/frame";
import { curveEasing, tween } from "../kit/motion";
import { WIDE_SHOT, type Aspect, type SceneShot } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { cameraAtDepth, lerpCamera, overscanRect, projectRect, wideCamera, type Camera } from "./rig";

/** A shot's target as laid out in the world: its box in frame px and the depth of the layer it is on. */
export interface ShotTargetBox {
  rect: Rect;
  depth: number;
}

/** A scene's measured element targets, by shot index (undefined for a rect, "wide", or not measured). */
export type SceneTargets = readonly (ShotTargetBox | undefined)[];

/** Measured targets by scene index. */
export type CameraTargets = ReadonlyMap<number, SceneTargets>;

/**
 * How the camera is drawn: `live` with its shots and breathing, `steady` with
 * the breathing held still (what the checks judge), `wide` not at all (what
 * shot targets are measured on).
 */
export type CameraMode = "live" | "steady" | "wide";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The camera that frames `target`: zoomed until the target fills `fill` of
 * the frame (never past the content area, never wider than wide), centered
 * where the scene's main block goes (see `blockCenterY`), and kept inside
 * the world. A target on a parallax layer is framed as that layer sees it.
 */
export function shotFraming(theme: Theme, aspect: Aspect, target: ShotTargetBox, fill: number): Camera {
  const size = frameSize(aspect);
  const area = contentArea(theme, aspect);
  const { rect, depth } = target;
  const zoom = Math.max(1, Math.min(fill * Math.min(size.width / rect.width, size.height / rect.height), area.width / rect.width, area.height / rect.height));
  const placed = placeBlock(area, { width: rect.width * zoom, height: rect.height * zoom }, blockCenterY(theme, aspect));
  // The layer's focus: the world point that puts the target's center on the placed box's center.
  const world = overscanRect(size);
  const halfWidth = size.width / (2 * zoom);
  const halfHeight = size.height / (2 * zoom);
  const x = clamp(rect.x + rect.width / 2 - (placed.x + placed.width / 2 - size.width / 2) / zoom, world.x + halfWidth, world.x + world.width - halfWidth);
  const y = clamp(rect.y + rect.height / 2 - (placed.y + placed.height / 2 - size.height / 2) / zoom, world.y + halfHeight, world.y + world.height - halfHeight);
  // The world camera whose share at `depth` is that view (see `cameraAtDepth`).
  return { scale: 1 + (zoom - 1) / depth, x: size.width / 2 + (x - size.width / 2) / depth, y: size.height / 2 + (y - size.height / 2) / depth };
}

/**
 * The breath at `progress` through scene `sceneIndex`: a zoom factor and the
 * focus's drift in screen px (upward, so the world sinks as it grows). Even
 * scenes breathe in, odd ones out, so consecutive scenes chain without a jump.
 */
export function breathing(theme: Theme, sceneIndex: number, progress: number): { scale: number; drift: number } {
  const { on, scale, curve, driftPx } = theme.motion.breathe;
  if (!on) return { scale: 1, drift: 0 };
  const eased = curveEasing(curve)(clamp(progress, 0, 1));
  const amount = sceneIndex % 2 === 0 ? eased : 1 - eased;
  return { scale: 1 + (scale - 1) * amount, drift: driftPx * amount };
}

export interface CameraInput {
  theme: Theme;
  aspect: Aspect;
  sceneIndex: number;
  /** Milliseconds into the scene. */
  ms: number;
  /** How far through the scene, 0..1: what breathing follows. */
  progress: number;
  shots?: readonly SceneShot[];
  /** Measured boxes of element targets. A shot onto an element without one is skipped. */
  targets?: SceneTargets;
  /** Default `live`. */
  mode?: CameraMode;
}

export interface CameraView {
  camera: Camera;
  /** The camera moves in this scene at all (it breathes or has shots), whatever the mode. */
  live: boolean;
  /**
   * While the camera is on a shot (pushing in, holding, pulling back until it
   * lands wide): the target's box on screen.
   */
  shot?: Rect;
}

/** A shot's target: its box, "wide", or undefined when an element's box is not measured. */
function targetOf(shot: SceneShot, index: number, targets: SceneTargets | undefined): ShotTargetBox | typeof WIDE_SHOT | undefined {
  if (shot.target === WIDE_SHOT) return WIDE_SHOT;
  if (typeof shot.target !== "string") return { rect: shot.target, depth: 1 };
  return targets?.[index];
}

interface Move {
  from: Camera;
  to: Camera;
  atMs: number;
  ms: number;
  /** The target this move frames, or the one it leaves when it pulls back to wide. */
  focus?: ShotTargetBox;
  wide: boolean;
}

/** The target a move keeps in view at `t`: its own, until a pull back to wide has landed. */
function focusAt(move: Move | undefined, t: number): ShotTargetBox | undefined {
  return move === undefined || (move.wide && t - move.atMs >= move.ms) ? undefined : move.focus;
}

/** The camera `ms` into a scene (see `CameraInput`). */
export function cameraAt({ theme, aspect, sceneIndex, ms, progress, shots = [], targets, mode = "live" }: CameraInput): CameraView {
  const size = frameSize(aspect);
  const live = theme.motion.breathe.on || shots.length > 0;
  if (mode === "wide") return { camera: wideCamera(size), live };

  const curve = theme.motion.shot.curve;
  const at = (move: Move, t: number) => lerpCamera(move.from, move.to, tween({ ms: move.ms, curve }, t - move.atMs));
  let move: Move | undefined;
  for (const [i, shot] of shots.entries()) {
    if (shot.atMs > ms) break;
    const target = targetOf(shot, i, targets);
    if (target === undefined) continue;
    const from = move === undefined ? wideCamera(size) : at(move, shot.atMs);
    const duration = shot.durationMs ?? theme.motion.shot.ms;
    move =
      target === WIDE_SHOT
        ? { from, to: wideCamera(size), atMs: shot.atMs, ms: duration, focus: focusAt(move, shot.atMs), wide: true }
        : { from, to: shotFraming(theme, aspect, target, shot.fill ?? theme.motion.shot.fill), atMs: shot.atMs, ms: duration, focus: target, wide: false };
  }

  let camera = move === undefined ? wideCamera(size) : at(move, ms);
  const focus = focusAt(move, ms);
  const shot = focus === undefined ? undefined : projectRect(cameraAtDepth(camera, focus.depth, size), size, focus.rect);
  if (mode === "live") {
    const breath = breathing(theme, sceneIndex, progress);
    // The drift is measured on screen, so a shot pushed in does not magnify it.
    if (breath.scale !== 1 || breath.drift !== 0) camera = { scale: camera.scale * breath.scale, x: camera.x, y: camera.y - breath.drift / camera.scale };
  }
  return { camera, live, ...(shot === undefined ? {} : { shot }) };
}
