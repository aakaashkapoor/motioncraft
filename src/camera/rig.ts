// The camera rig's geometry (design v3, life #1 and #12). A camera is a zoom
// and the world point it centers in the frame; it projects the world (a scene
// laid out in frame px, as with the camera wide) onto the screen. A layer at
// another depth follows the camera's motion by its share: parallax. Pure.

import type { Rect, Size } from "../layout/frame";

export interface Camera {
  /** Zoom: 1 is wide. */
  scale: number;
  /** The world point at the frame's center, in frame px. */
  x: number;
  y: number;
}

/**
 * The world is about 8% larger than the frame, centered on it: full-bleed
 * media fill it, so a drifting camera never shows their edge.
 */
export const OVERSCAN = 0.08;

/**
 * How much of the camera's motion a layer follows (design v3, life #12):
 * background 0.5x, foreground windows 1.0x (the world itself), floating chips
 * 1.15x, so a camera move or breathing shows depth.
 */
export const CAMERA_DEPTHS = { background: 0.5, foreground: 1, floating: 1.15 } as const;
export type CameraDepth = keyof typeof CAMERA_DEPTHS;

const center = (size: Size) => ({ x: size.width / 2, y: size.height / 2 });

/** The camera at rest: the whole frame, as laid out. */
export function wideCamera(size: Size): Camera {
  return { scale: 1, ...center(size) };
}

/** The world's box: the frame grown by `OVERSCAN`, centered on it. */
export function overscanRect(size: Size): Rect {
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    x: round((-OVERSCAN / 2) * size.width),
    y: round((-OVERSCAN / 2) * size.height),
    width: round((1 + OVERSCAN) * size.width),
    height: round((1 + OVERSCAN) * size.height),
  };
}

/** The camera a layer at `depth` sees: that share of the camera's zoom and of its focus's move off center. */
export function cameraAtDepth(camera: Camera, depth: number, size: Size): Camera {
  if (depth === 1) return camera;
  const c = center(size);
  return { scale: 1 + (camera.scale - 1) * depth, x: c.x + (camera.x - c.x) * depth, y: c.y + (camera.y - c.y) * depth };
}

/** Where `rect` (world px) lands on screen through `camera`. */
export function projectRect(camera: Camera, size: Size, rect: Rect): Rect {
  const c = center(size);
  return {
    x: c.x + camera.scale * (rect.x - camera.x),
    y: c.y + camera.scale * (rect.y - camera.y),
    width: rect.width * camera.scale,
    height: rect.height * camera.scale,
  };
}

/**
 * Where a point drawn on a layer at depth `from` shows, in the coordinates of
 * a layer at depth `to`: what keeps a connector drawn on one layer attached to
 * an element on another as the camera moves.
 */
export function layerPoint(camera: Camera, size: Size, point: { x: number; y: number }, from: number, to: number): { x: number; y: number } {
  if (from === to) return point;
  const a = cameraAtDepth(camera, from, size);
  const b = cameraAtDepth(camera, to, size);
  return { x: b.x + (a.scale * (point.x - a.x)) / b.scale, y: b.y + (a.scale * (point.y - a.y)) / b.scale };
}

/** The camera `t` of the way from `a` to `b`: exactly `a` at 0 and `b` at 1. */
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  if (t <= 0) return a;
  if (t === 1) return b;
  const mix = (from: number, to: number) => from + (to - from) * t;
  return { scale: mix(a.scale, b.scale), x: mix(a.x, b.x), y: mix(a.y, b.y) };
}

// `|| 0` turns -0 into 0.
const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places || 0;

/** `p -> scale * p + (x, y)` as a CSS transform about the top-left corner, or undefined when it does nothing. */
function affine(scale: number, x: number, y: number): string | undefined {
  const s = round(scale, 5);
  const tx = round(x, 2);
  const ty = round(y, 2);
  return s === 1 && tx === 0 && ty === 0 ? undefined : `translate(${tx}px, ${ty}px) scale(${s})`;
}

/**
 * The world's CSS transform (origin `0 0`) for `camera`, or undefined when
 * the camera is wide.
 */
export function cameraTransform(camera: Camera, size: Size): string | undefined {
  const c = center(size);
  return affine(camera.scale, c.x - camera.scale * camera.x, c.y - camera.scale * camera.y);
}

/**
 * The CSS transform (origin `0 0`) of a layer at `depth` drawn inside one at
 * `parentDepth` (the world is depth 1), so the layer lands where `camera`
 * puts that depth; undefined when it moves with its parent.
 */
export function layerTransform(camera: Camera, parentDepth: number, depth: number, size: Size): string | undefined {
  const parent = cameraAtDepth(camera, parentDepth, size);
  const layer = cameraAtDepth(camera, depth, size);
  // Undo the parent's projection after applying the layer's: p -> (s_l p + c - s_l f_l - c + s_p f_p) / s_p.
  return affine(
    layer.scale / parent.scale,
    (parent.scale * parent.x - layer.scale * layer.x) / parent.scale,
    (parent.scale * parent.y - layer.scale * layer.y) / parent.scale,
  );
}
