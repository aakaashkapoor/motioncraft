// A three.js scene on the scene clock: one <canvas> sized to its box, one
// WebGLRenderer, and exactly one render per React frame. `build` makes the
// scene and camera when the stage mounts; `update(ctx, ms)` poses them for the
// frame's scene-clock time before the render. Nothing here reads a wall clock
// or asks for animation frames (no requestAnimationFrame, setAnimationLoop or
// THREE.Clock), so the same ms always draws the same pixels.
//
// The canvas is made by the mount effect, not rendered by React, so that
// unmounting can lose its WebGL context and drop it: the render page mounts
// scenes again on a hidden measuring stage, and Chrome keeps only about 16
// live contexts before it drops the oldest (possibly the one on screen).
// StrictMode's effect replay therefore gets a fresh canvas, renderer and scene.
//
// The `keys` that `build` returns are shown to the layer-1 checks: after each
// render, an invisible box per key is placed over the canvas at the key's
// projected rect (see `keyBoxes.ts`).

import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import type { Rect } from "../../layout/frame";
import type { Aspect } from "../../storyboard/types";
import { useSceneTime, useVisibleRect } from "../frameContext";
import { disposeScene } from "./disposeScene";
import { studioEnvironment } from "./environment";
import { createKeyLayer, type KeyLayer } from "./keyBoxes";

export interface ThreeStageSize {
  width: number;
  height: number;
}

/**
 * A named object in the scene, for checks that need to see into 3D: the
 * safe-area check judges its projected bounding box, named by `label`.
 */
export interface ThreeKey {
  label: string;
  object: THREE.Object3D;
  /** The text the object shows, if it draws any. */
  text?: string;
  /**
   * For 3D text: the CSS colour of the text's material (the theme colour it
   * takes, e.g. `theme.colors.text`). With it, the checks measure the text
   * as text (contrast, readability, overflow...); without, only as a key
   * element (see `keyBoxes.ts`).
   */
  color?: string;
}

/** What `build` returns: the scene and the camera that films it. */
export interface ThreeBuilt<S = unknown> {
  scene: THREE.Scene;
  camera: THREE.Camera;
  keys?: ThreeKey[];
  /** Anything `update` needs between frames (meshes, materials, ...). */
  state?: S;
}

/** What `update` receives each frame. */
export interface ThreeContext<S = unknown> extends ThreeBuilt<S> {
  renderer: THREE.WebGLRenderer;
  size: ThreeStageSize;
}

export interface ThreeStageProps<S = unknown> {
  /** The box to draw in, in frame px. Without one the stage fills what is visible (the frame, or its slot). */
  area?: Rect;
  /** Locates the visible rect when there is no `area`. */
  aspect: Aspect;
  /** How far into the scene we are (see `useSceneTime`). */
  progress: number;
  /**
   * Creates the scene and camera. Runs once when the stage mounts and never
   * again (a new `build` function does not rebuild), so mount the stage only
   * once its assets are loaded (see `useThreeAsset`).
   */
  build: (size: ThreeStageSize) => ThreeBuilt<S>;
  /**
   * Poses the scene for the frame, with the scene-clock ms; called once
   * before each render. The stage redraws only when `ms` or its size
   * changes: everything the picture shows must follow from those.
   */
  update?: (ctx: ThreeContext<S>, ms: number) => void;
  /**
   * Frees the scene's GPU resources on unmount. Default: dispose every
   * geometry, material and texture in the scene (`disposeScene`). Pass one
   * to keep shared assets alive.
   */
  dispose?: (ctx: ThreeContext<S>) => void;
  /** Names the stage in the markup. */
  label?: string;
  /**
   * "studio": light the scene with a studio environment map (see
   * `studioEnvironment`) for reflective materials like chrome and glass,
   * unless `build` set `scene.environment` itself. Made once at mount.
   */
  environment?: "studio";
}

/** Points a perspective camera at the stage's shape; other cameras are left as built. */
function fitCamera(camera: THREE.Camera, size: ThreeStageSize): void {
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
  }
}

export function ThreeStage<S = unknown>({ area, aspect, progress, build, update, dispose, label, environment }: ThreeStageProps<S>) {
  const visible = useVisibleRect(aspect);
  const box = area ?? visible;
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));
  const { ms } = useSceneTime(progress);

  const holder = useRef<HTMLDivElement>(null);
  const live = useRef<ThreeContext<S> | undefined>(undefined);
  const keyLayer = useRef<KeyLayer | undefined>(undefined);

  // Mount: canvas, renderer and scene; unmount: all three freed.
  useLayoutEffect(() => {
    const size = { width, height };
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%";
    holder.current!.append(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    const built = build(size);
    fitCamera(built.camera, size);
    const env = environment === "studio" && built.scene.environment === null ? studioEnvironment(renderer) : undefined;
    if (env !== undefined) built.scene.environment = env.texture;
    const ctx = { ...built, renderer, size };
    live.current = ctx;
    const layer = createKeyLayer(built.keys ?? [], label);
    holder.current!.append(layer.element);
    keyLayer.current = layer;
    // role="img" makes everything inside presentational, hiding the key boxes' own labels: a stage with keys drops it.
    const wrapper = holder.current!;
    const role = wrapper.getAttribute("role");
    if ((built.keys ?? []).length > 0) wrapper.removeAttribute("role");
    return () => {
      live.current = undefined;
      keyLayer.current = undefined;
      layer.element.remove();
      if (role !== null) wrapper.setAttribute("role", role);
      // The studio map is freed once, by `env.dispose()` (its render target), not again by `disposeScene`.
      if (env !== undefined && ctx.scene.environment === env.texture) ctx.scene.environment = null;
      if (dispose === undefined) disposeScene(ctx.scene);
      else dispose(ctx);
      env?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
    // Built once per mount: see `build`.
  }, []);

  // Each frame: resize if the box changed, pose, render once.
  useLayoutEffect(() => {
    let ctx = live.current!;
    if (ctx.size.width !== width || ctx.size.height !== height) {
      const size = { width, height };
      ctx.renderer.setSize(width, height, false);
      fitCamera(ctx.camera, size);
      ctx = { ...ctx, size };
      live.current = ctx;
    }
    update?.(ctx, ms);
    ctx.renderer.render(ctx.scene, ctx.camera);
    keyLayer.current!.place(ctx.camera, ctx.size);
    // `update` is read for the frame being drawn; a new identity alone redraws nothing.
  }, [ms, width, height]);

  return (
    <div
      ref={holder}
      data-three-stage={label ?? ""}
      {...(label === undefined ? {} : { role: "img", "aria-label": label })}
      style={{ position: "absolute", left: box.x, top: box.y, width, height }}
    />
  );
}
