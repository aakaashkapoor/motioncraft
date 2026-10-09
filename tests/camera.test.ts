// Design v3, life #1 and #12: the camera rig. Pure transforms at given ms:
// breathing over a scene, a shot pushing in to an element and back to wide,
// and parallax layers following the camera at their depth.

import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  cameraAt,
  cameraAtDepth,
  cameraTransform,
  CAMERA_DEPTHS,
  contentArea,
  deepMerge,
  frameSize,
  layerPoint,
  layerTransform,
  lightTheme,
  OVERSCAN,
  overscanRect,
  pinnedLayout,
  projectRect,
  shotFraming,
  wideCamera,
  type Aspect,
  type Camera,
  type Rect,
  type SceneShot,
  type Theme,
} from "../src/index";

/** The light theme with breathing switched on, as a storyboard opts in. */
const breathing: Theme = deepMerge(lightTheme, { motion: { breathe: { on: true } } });
const SIZE = frameSize("9:16");
const CENTER = { x: SIZE.width / 2, y: SIZE.height / 2 };

const at = (theme: Theme, ms: number, progress: number, options: { sceneIndex?: number; shots?: SceneShot[]; targets?: Parameters<typeof cameraAt>[0]["targets"]; aspect?: Aspect } = {}) =>
  cameraAt({ theme, aspect: options.aspect ?? "9:16", sceneIndex: options.sceneIndex ?? 0, ms, progress, shots: options.shots, targets: options.targets });

const center = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

describe("camera tokens", () => {
  it("breathes 1.00 -> 1.02 with sine in-out and drifts at most 16 px, off in the light theme", () => {
    expect(lightTheme.motion.breathe).toEqual({ on: false, scale: 1.02, curve: "sineInOut", driftPx: 16 });
  });

  it("pushes in with the shot token, filling 0.6-0.85 of the frame by default", () => {
    expect(lightTheme.motion.shot.curve).toEqual([0.65, 0, 0.35, 1]);
    expect(lightTheme.motion.shot.fill).toBeGreaterThanOrEqual(0.6);
    expect(lightTheme.motion.shot.fill).toBeLessThanOrEqual(0.85);
  });

  it("names three parallax depths: background 0.5x, foreground 1.0x, floating 1.15x", () => {
    expect(CAMERA_DEPTHS).toEqual({ background: 0.5, foreground: 1, floating: 1.15 });
  });

  it("gives the world an overscan about 8% larger than the frame, centered on it", () => {
    expect(OVERSCAN).toBeCloseTo(0.08);
    const world = overscanRect(SIZE);
    expect(world.width).toBeCloseTo(SIZE.width * 1.08);
    expect(world.height).toBeCloseTo(SIZE.height * 1.08);
    expect(center(world)).toEqual(CENTER);
  });
});

describe("breathing", () => {
  it("holds the camera wide in the light theme", () => {
    for (const progress of [0, 0.3, 1]) {
      const view = at(lightTheme, progress * 5000, progress);
      expect(view.camera).toEqual(wideCamera(SIZE));
      expect(view.live).toBe(false);
    }
  });

  it("scales 1.00 -> 1.02 over a scene, sine in-out", () => {
    const scale = (progress: number) => at(breathing, progress * 5000, progress).camera.scale;
    expect(scale(0)).toBeCloseTo(1, 6);
    expect(scale(0.5)).toBeCloseTo(1.01, 6);
    expect(scale(1)).toBeCloseTo(1.02, 6);
    // Sine in-out: slow at both ends, fastest in the middle.
    expect(scale(0.1) - scale(0)).toBeLessThan(scale(0.55) - scale(0.45));
    expect(at(breathing, 0, 0).live).toBe(true);
  });

  it("alternates direction scene by scene, so consecutive scenes chain without a jump", () => {
    const even = (p: number) => at(breathing, p * 5000, p, { sceneIndex: 2 }).camera;
    const odd = (p: number) => at(breathing, p * 5000, p, { sceneIndex: 3 }).camera;
    expect(odd(0).scale).toBeCloseTo(1.02, 6);
    expect(odd(1).scale).toBeCloseTo(1, 6);
    expect(odd(0)).toEqual(even(1));
    expect(odd(1)).toEqual(even(0));
  });

  it("drifts its focus by at most 16 px", () => {
    let furthest = 0;
    for (let k = 0; k <= 20; k++) {
      const { camera } = at(breathing, k * 250, k / 20);
      furthest = Math.max(furthest, Math.hypot(camera.x - CENTER.x, camera.y - CENTER.y));
    }
    expect(furthest).toBeGreaterThan(8);
    expect(furthest).toBeLessThanOrEqual(16 + 1e-9);
  });

  it("drifts up and down only, so a centered block stays centered on x = 540", () => {
    expect(at(breathing, 2500, 0.5).camera.x).toBe(CENTER.x);
  });
});

describe("a shot in and out", () => {
  const target: Rect = { x: 324, y: 240, width: 432, height: 389 };
  const shots: SceneShot[] = [
    { atMs: 1000, target },
    { atMs: 3000, target: "wide" },
  ];
  const ms = lightTheme.motion.shot.ms;
  const view = (t: number) => at(lightTheme, t, t / 5000, { shots });

  it("stays wide until the shot starts", () => {
    expect(view(0).camera).toEqual(wideCamera(SIZE));
    expect(view(1000).camera).toEqual(wideCamera(SIZE));
    expect(view(0).live).toBe(true);
    expect(view(0).shot).toBeUndefined();
  });

  it("lands on the target over the shot token's duration, filling its share of the frame", () => {
    const landed = view(1000 + ms).camera;
    const onScreen = projectRect(landed, SIZE, target);
    expect(onScreen.width).toBeCloseTo(lightTheme.motion.shot.fill * SIZE.width, 6);
    // Centered on the frame's center line, inside the content area.
    expect(center(onScreen).x).toBeCloseTo(CENTER.x, 6);
    const area = contentArea(lightTheme, "9:16");
    expect(onScreen.y).toBeGreaterThanOrEqual(area.y - 1e-6);
    expect(onScreen.y + onScreen.height).toBeLessThanOrEqual(area.y + area.height + 1e-6);
    expect(view(2500).camera).toEqual(landed);
    expect(view(2500).shot).toEqual(onScreen);
  });

  it("moves on the shot curve: slow out of wide, fastest mid-move, no overshoot", () => {
    const zoom = (t: number) => view(t).camera.scale;
    const end = zoom(1000 + ms);
    expect(end).toBeGreaterThan(1.4);
    expect(end).toBeLessThan(2.2);
    const quarter = zoom(1000 + ms / 4);
    const half = zoom(1000 + ms / 2);
    expect(quarter - 1).toBeLessThan((end - 1) * 0.25);
    expect(half).toBeCloseTo(1 + (end - 1) / 2, 2);
    for (let t = 1000; t <= 1000 + ms; t += 25) expect(zoom(t)).toBeLessThanOrEqual(end + 1e-9);
  });

  it("pulls back to wide from where it is, and stays wide", () => {
    expect(view(3000).camera).toEqual(view(2900).camera);
    const back = view(3000 + ms / 2).camera.scale;
    expect(back).toBeGreaterThan(1);
    expect(back).toBeLessThan(view(2900).camera.scale);
    expect(view(3000 + ms).camera).toEqual(wideCamera(SIZE));
    expect(view(4900).camera).toEqual(wideCamera(SIZE));
    // The target is still in shot while the camera pulls back, then no longer.
    expect(view(3000 + ms / 2).shot).toBeDefined();
    expect(view(3000 + ms).shot).toBeUndefined();
  });

  it("takes a shot's own fill and duration", () => {
    const own: SceneShot[] = [{ atMs: 0, target, fill: 0.6, durationMs: 400 }];
    const landed = at(lightTheme, 400, 0.1, { shots: own }).camera;
    expect(projectRect(landed, SIZE, target).width).toBeCloseTo(0.6 * SIZE.width, 6);
    expect(at(lightTheme, 200, 0.05, { shots: own }).camera.scale).toBeLessThan(landed.scale);
  });

  it("frames an element target from its measured box, and ignores one not measured", () => {
    const byId: SceneShot[] = [{ atMs: 0, target: "chat" }];
    expect(at(lightTheme, 2000, 0.4, { shots: byId }).camera).toEqual(wideCamera(SIZE));
    const measured = at(lightTheme, 2000, 0.4, { shots: byId, targets: [{ rect: target, depth: 1 }] }).camera;
    expect(measured).toEqual(at(lightTheme, 2000, 0.4, { shots: [{ atMs: 0, target }] }).camera);
  });

  it("breathes on top of a shot when breathing is on, drifting at most 16 px on screen", () => {
    const still = at(lightTheme, 2500, 0.5, { shots }).camera;
    const breathed = at(breathing, 2500, 0.5, { shots }).camera;
    expect(breathed.scale).toBeCloseTo(still.scale * 1.01, 6);
    const end = at(breathing, 2900, 1, { shots }).camera;
    expect(Math.abs(end.y - at(lightTheme, 2900, 1, { shots }).camera.y) * end.scale).toBeLessThanOrEqual(16 * 1.02 + 1e-9);
  });

  it("forgets the target once it is back to wide, even after a second wide shot", () => {
    const again: SceneShot[] = [...shots, { atMs: 4000, target: "wide" }];
    expect(at(lightTheme, 4100, 0.82, { shots: again }).shot).toBeUndefined();
    expect(at(lightTheme, 4100, 0.82, { shots: again }).camera).toEqual(wideCamera(SIZE));
  });
});

describe("shotFraming", () => {
  it.each(ASPECTS)("%s: never zooms out past wide, and stops a tall target at the content area", (aspect) => {
    const size = frameSize(aspect);
    const whole = shotFraming(lightTheme, aspect, { rect: { x: 0, y: 0, ...size }, depth: 1 }, 0.75);
    expect(whole.scale).toBe(1);
    // Filling 85% of the frame would make it taller than the content area.
    const tall: Rect = { x: 400, y: 100, width: 200, height: 700 };
    const area = contentArea(lightTheme, aspect);
    const framed = projectRect(shotFraming(lightTheme, aspect, { rect: tall, depth: 1 }, 0.85), size, tall);
    expect(framed.height).toBeLessThanOrEqual(area.height + 1e-6);
  });

  it("frames a target on a parallax layer as that layer sees it", () => {
    const rect: Rect = { x: 324, y: 240, width: 432, height: 389 };
    for (const depth of [0.5, 1.15]) {
      const camera = shotFraming(lightTheme, "9:16", { rect, depth }, 0.75);
      const asLayer = projectRect(cameraAtDepth(camera, depth, SIZE), SIZE, rect);
      const asWorld = projectRect(shotFraming(lightTheme, "9:16", { rect, depth: 1 }, 0.75), SIZE, rect);
      for (const key of ["x", "y", "width", "height"] as const) expect(asLayer[key]).toBeCloseTo(asWorld[key], 6);
    }
  });

  it.each(ASPECTS)("%s: a shot onto a docked window makes its smallest text at least label size", (aspect) => {
    // Docked, a window is scaled down; its own text is never below `label` at full size.
    const layout = pinnedLayout(lightTheme, aspect);
    const camera = shotFraming(lightTheme, aspect, { rect: layout.pinned, depth: CAMERA_DEPTHS.background }, lightTheme.motion.shot.fill);
    const zoom = cameraAtDepth(camera, CAMERA_DEPTHS.background, frameSize(aspect)).scale;
    expect(zoom * layout.scale).toBeGreaterThanOrEqual(1 - 1e-9);
  });
});

describe("parallax", () => {
  const camera: Camera = { scale: 1.8, x: 600, y: 500 };

  it("moves a layer by its share of the camera's motion: none at 0, all of it at 1", () => {
    expect(cameraAtDepth(camera, 1, SIZE)).toEqual(camera);
    expect(cameraAtDepth(camera, 0, SIZE)).toEqual(wideCamera(SIZE));
    const background = cameraAtDepth(camera, 0.5, SIZE);
    expect(background.scale).toBeCloseTo(1.4);
    expect(background.x).toBeCloseTo((CENTER.x + 600) / 2);
    expect(background.y).toBeCloseTo((CENTER.y + 500) / 2);
    const floating = cameraAtDepth(camera, 1.15, SIZE);
    expect(floating.scale).toBeCloseTo(1 + 0.8 * 1.15);
  });

  it("maps a point on one layer to where it shows on another, so connectors stay attached", () => {
    const point = { x: 300, y: 900 };
    expect(layerPoint(camera, SIZE, point, 1.15, 1.15)).toEqual(point);
    const onFloating = projectRect(cameraAtDepth(camera, 1.15, SIZE), SIZE, { ...point, width: 0, height: 0 });
    const inWorld = layerPoint(camera, SIZE, point, 1.15, 1);
    const shown = projectRect(camera, SIZE, { ...inWorld, width: 0, height: 0 });
    expect(shown.x).toBeCloseTo(onFloating.x, 6);
    expect(shown.y).toBeCloseTo(onFloating.y, 6);
    expect(layerPoint(wideCamera(SIZE), SIZE, point, 1.15, 1)).toEqual(point);
  });

  it("draws the camera as a CSS transform that matches its projection", () => {
    const css = cameraTransform(camera, SIZE)!;
    const [, tx, ty, s] = /^translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)$/.exec(css)!.map(Number);
    const p = projectRect(camera, SIZE, { x: 100, y: 200, width: 10, height: 10 });
    expect(tx! + 100 * s!).toBeCloseTo(p.x, 1);
    expect(ty! + 200 * s!).toBeCloseTo(p.y, 1);
    expect(cameraTransform(wideCamera(SIZE), SIZE)).toBeUndefined();
  });

  it("draws a layer inside the camera relative to it, so it lands where its depth puts it", () => {
    const parse = (css: string) => /^translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)$/.exec(css)!.slice(1).map(Number) as [number, number, number];
    const [ox, oy, os] = parse(cameraTransform(camera, SIZE)!);
    const [lx, ly, ls] = parse(layerTransform(camera, 1, 0.5, SIZE)!);
    // The world's transform, then the layer's: a point lands where the background camera projects it.
    const point = { x: 300, y: 900 };
    const inWorld = { x: lx + point.x * ls, y: ly + point.y * ls };
    const onScreen = { x: ox + inWorld.x * os, y: oy + inWorld.y * os };
    const expected = projectRect(cameraAtDepth(camera, 0.5, SIZE), SIZE, { ...point, width: 0, height: 0 });
    expect(onScreen.x).toBeCloseTo(expected.x, 1);
    expect(onScreen.y).toBeCloseTo(expected.y, 1);
    expect(layerTransform(camera, 1, 1, SIZE)).toBeUndefined();
    expect(layerTransform(wideCamera(SIZE), 1, 0.5, SIZE)).toBeUndefined();
  });
});
