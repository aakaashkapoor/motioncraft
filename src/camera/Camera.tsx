// The camera in the render path (design v3, life #1 and #12). Each scene's
// content sits in a `CameraWorld` that its camera moves; the caption is drawn
// outside it and stays fixed. Inside, a `CameraLayer` follows the camera at
// its own depth (background, foreground, floating), so a move shows depth.

import { createContext, useContext, type ReactNode } from "react";
import { VisibleRectContext } from "../kit/frameContext";
import { frameSize, type Rect, type Size } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import { CAMERA_ATTRIBUTE, DEPTH_ATTRIBUTE, SHOT_ATTRIBUTE } from "./attributes";
import { CAMERA_DEPTHS, cameraTransform, layerPoint, layerTransform, overscanRect, type Camera, type CameraDepth } from "./rig";
import type { CameraView } from "./shots";

/**
 * The camera a subtree is drawn by, and the depth it is drawn at. `free`
 * inside a frame of its own (a window's content slot, a docked frame): its
 * coordinates are no longer the scene's, so layers there stay put.
 */
type CameraFrame = { camera: Camera; size: Size; depth: number } | "free";

const CameraContext = createContext<CameraFrame | undefined>(undefined);

const round = (value: number) => Math.round(value * 10) / 10 || 0;

/** A rect as the `SHOT_ATTRIBUTE` value. */
export function formatShot(rect: Rect): string {
  return [rect.x, rect.y, rect.width, rect.height].map(round).join(" ");
}

/** A frame-sized box at the frame's origin, so what is inside lays out in frame px like a scene. */
const frameBox = (size: Size, transform: string | undefined) => ({
  position: "absolute" as const,
  left: 0,
  top: 0,
  width: size.width,
  height: size.height,
  ...(transform === undefined ? {} : { transform, transformOrigin: "0 0" }),
});

/**
 * A scene's world, moved by `view`'s camera. When the camera moves at all in
 * the scene, full-bleed media fill the world's overscan instead of the frame.
 */
export function CameraWorld({ view, aspect, children }: { view: CameraView; aspect: Aspect; children?: ReactNode }) {
  const size = frameSize(aspect);
  const shot = view.shot === undefined ? {} : { [SHOT_ATTRIBUTE]: formatShot(view.shot) };
  const inner = <CameraContext.Provider value={{ camera: view.camera, size, depth: 1 }}>{children}</CameraContext.Provider>;
  return (
    <div {...{ [CAMERA_ATTRIBUTE]: "" }} {...shot} style={frameBox(size, cameraTransform(view.camera, size))}>
      {view.live ? <VisibleRectContext.Provider value={overscanRect(size)}>{inner}</VisibleRectContext.Provider> : inner}
    </div>
  );
}

/**
 * A layer that follows the camera at `depth` (see `CAMERA_DEPTHS`): drawn on
 * a frame-sized box at the frame's origin, so its content stays in frame px.
 * Layers are drawn in the order given; put nearer ones last.
 */
export function CameraLayer({ depth, aspect, children }: { depth: CameraDepth; aspect: Aspect; children?: ReactNode }) {
  const frame = useContext(CameraContext);
  const factor = CAMERA_DEPTHS[depth];
  if (frame === "free") return <div style={frameBox(frameSize(aspect), undefined)}>{children}</div>;
  const transform = frame === undefined ? undefined : layerTransform(frame.camera, frame.depth, factor, frame.size);
  return (
    <div {...{ [DEPTH_ATTRIBUTE]: factor }} style={frameBox(frameSize(aspect), transform)}>
      <CameraContext.Provider value={frame === undefined ? undefined : { ...frame, depth: factor }}>{children}</CameraContext.Provider>
    </div>
  );
}

/**
 * Where `point`, drawn on a layer at `depth`, shows in the coordinates of the
 * layer this is called in: so a connector drawn here stays on an element over
 * there while the camera moves. The point itself without a moving camera.
 */
export function useLayerPoint(point: { x: number; y: number }, depth: CameraDepth): { x: number; y: number } {
  const frame = useContext(CameraContext);
  if (frame === undefined || frame === "free") return point;
  return layerPoint(frame.camera, frame.size, point, CAMERA_DEPTHS[depth], frame.depth);
}

/** Content drawn in a frame of its own (scaled, offset): its layers move with it, not on their own. */
export function CameraFree({ children }: { children?: ReactNode }) {
  return <CameraContext.Provider value="free">{children}</CameraContext.Provider>;
}
