// ThreeStage draws a three.js scene on the scene clock: one render per frame,
// the same pixels for the same frame, no requestAnimationFrame. useThreeAsset
// holds the readiness gate until its asset is loaded and on screen.

import { join } from "node:path";
import type { Page } from "playwright-core";
import { describe, expect, it } from "vitest";
import { bundleBrowserEntry, withOfflinePage } from "./browserPage";

const ENTRY = join(import.meta.dirname, "threeStage.entry.tsx");

interface Drawn {
  canvasCount: number;
  contexts: number;
  cameraAspect: number;
  image: string;
  opaque: number;
  width: number;
  height: number;
  cssWidth: string;
  cssHeight: string;
  left: number;
  top: number;
}

interface ProbeState {
  pending: string[];
  loads?: number;
  text?: string | null;
  error?: string | null;
}

interface ThreeTest {
  renderAt(frame: number, areaIndex?: number): Drawn;
  updates(): number[];
  clearUpdates(): void;
  rafCalls(): number;
  renders(): number;
  builds(): number;
  unmountStage(): { canvasesLeft: number; lost: boolean[] };
  mountProbe(throwing?: boolean): ProbeState;
  unmountProbe(): string[];
  resolveProbe(value: string): Promise<ProbeState>;
  rejectProbe(message: string): Promise<ProbeState>;
  pending(): string[];
}

/** Calls `window.threeTest[name](...args)` in the page. */
function call<K extends keyof ThreeTest>(page: Page, name: K, ...args: Parameters<ThreeTest[K]>): Promise<Awaited<ReturnType<ThreeTest[K]>>> {
  return page.evaluate(
    ([name, args]) => {
      const api = (window as unknown as { threeTest: Record<string, (...a: unknown[]) => unknown> }).threeTest;
      return api[name]!(...args);
    },
    [name, args] as const,
  ) as Promise<Awaited<ReturnType<ThreeTest[K]>>>;
}

const ms = (frame: number) => (frame * 1000) / 30;

// React's production build, and its development build under StrictMode, which
// mounts the stage, unmounts it and mounts it again.
const MODES = [
  { name: "production", development: false, mounts: 1 },
  { name: "StrictMode", development: true, mounts: 2 },
];

describe.each(MODES)("ThreeStage ($name)", ({ development, mounts }) => {
  it("renders once per frame on the scene clock, deterministically and without requestAnimationFrame", { timeout: 90_000 }, async (ctx) => {
    const js = await bundleBrowserEntry(ENTRY, { development });
    await withOfflinePage(ctx, js, async ({ page }) => {
      const first = await call(page, "renderAt", 15);
      // Each mount builds a scene on a fresh canvas and draws it once.
      expect(await call(page, "updates")).toEqual(Array(mounts).fill(500));
      expect([await call(page, "renders"), await call(page, "builds"), first.contexts]).toEqual([mounts, mounts, mounts]);
      await call(page, "clearUpdates");

      const between = await call(page, "renderAt", 40);
      const again = await call(page, "renderAt", 15);
      const other = await call(page, "renderAt", 16);

      // Sized to its area, positioned in it, one canvas.
      expect([first.width, first.height, first.cssWidth, first.cssHeight]).toEqual([160, 90, "160px", "90px"]);
      expect([first.left, first.top]).toEqual([20, 10]);
      expect([first.canvasCount, between.canvasCount, other.canvasCount]).toEqual([1, 1, 1]);
      expect(first.cameraAspect).toBeCloseTo(160 / 90);

      expect(first.opaque).toBeGreaterThan(160 * 90 * 0.05);
      expect(again.image).toBe(first.image);
      expect(other.image).not.toBe(first.image);

      // One update and one render per frame, with the frame's ms.
      expect(await call(page, "updates")).toEqual([ms(40), 500, ms(16)]);
      expect(await call(page, "renders")).toBe(mounts + 3);

      // A new box resizes the canvas and refits the camera, without rebuilding.
      const tall = await call(page, "renderAt", 16, 1);
      expect([tall.width, tall.height, tall.cssWidth, tall.cssHeight, tall.left, tall.top]).toEqual([90, 160, "90px", "160px", 0, 0]);
      expect(tall.cameraAspect).toBeCloseTo(90 / 160);
      expect(tall.image).not.toBe(other.image);
      expect(tall.opaque).toBeGreaterThan(90 * 160 * 0.05);
      expect(await call(page, "renders")).toBe(mounts + 4);
      expect(await call(page, "builds")).toBe(mounts);

      // The same ms at the same size draws nothing new.
      await call(page, "renderAt", 16, 1);
      expect(await call(page, "renders")).toBe(mounts + 4);
      expect(await call(page, "updates")).toEqual([ms(40), 500, ms(16), ms(16)]);

      expect(await call(page, "rafCalls")).toBe(0);

      // Unmounting removes every canvas and loses every WebGL context it made.
      expect(await call(page, "unmountStage")).toEqual({ canvasesLeft: 0, lost: Array(mounts).fill(true) });
      expect(await call(page, "rafCalls")).toBe(0);
    });
  });
});

describe("useThreeAsset", () => {
  it.for(MODES)("holds the gate until the asset is loaded and drawn, then releases it once ($name)", { timeout: 90_000 }, async ({ development }, ctx) => {
    const js = await bundleBrowserEntry(ENTRY, { development });
    await withOfflinePage(ctx, js, async ({ page }) => {
      const mounted = await call(page, "mountProbe");
      expect(mounted).toEqual({ pending: ["three: probe"], loads: 1, text: "loading" });

      const resolved = await call(page, "resolveProbe", "mesh");
      // The frame the gate releases already shows the asset.
      expect(resolved).toEqual({ pending: [], loads: 1, text: "mesh" });

      // Unmounting releases nothing twice (continueRender throws on a released handle).
      expect(await call(page, "unmountProbe")).toEqual([]);
    });
  });

  it("fails the render when the load rejects, and releases its handle on unmount", { timeout: 90_000 }, async (ctx) => {
    const js = await bundleBrowserEntry(ENTRY);
    await withOfflinePage(ctx, js, async ({ page }) => {
      await call(page, "mountProbe");
      const failed = await call(page, "rejectProbe", "no such model");
      expect(failed.error).toBe("no such model");
      expect(await call(page, "unmountProbe")).toEqual([]);
    });
  });

  it("fails the render when the load throws instead of rejecting", { timeout: 90_000 }, async (ctx) => {
    const js = await bundleBrowserEntry(ENTRY);
    await withOfflinePage(ctx, js, async ({ page }) => {
      expect(await call(page, "mountProbe", true)).toEqual({ pending: ["three: probe"], loads: 1, text: "loading" });
      // The real error, not a readiness timeout.
      const failed = await call(page, "rejectProbe", "unused");
      expect(failed.error).toBe("load threw");
      expect(await call(page, "unmountProbe")).toEqual([]);
    });
  });

  it("releases its handle when unmounted mid-load", { timeout: 90_000 }, async (ctx) => {
    const js = await bundleBrowserEntry(ENTRY);
    await withOfflinePage(ctx, js, async ({ page }) => {
      await call(page, "mountProbe");
      expect(await call(page, "unmountProbe")).toEqual([]);
      // A load that finishes after unmount neither sets state nor touches the gate.
      const late = await call(page, "resolveProbe", "late");
      expect(late).toEqual({ pending: [], loads: 1, text: null });
    });
  });
});
