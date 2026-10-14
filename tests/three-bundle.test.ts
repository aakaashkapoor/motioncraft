// three.js bundles into the render page and draws with WebGL in the installed
// browser, fully offline: esbuild inlines `three` into one IIFE, and the page
// makes no request besides its own document.

import { describe, expect, it } from "vitest";
import { pageScript } from "../src/render/bundle";
import { TEST_PAGE_URL, bundleBrowserEntry, withOfflinePage } from "./browserPage";

// A red cube on a black background, rendered once; the center pixel goes to window.__result.
const ENTRY = `
import * as THREE from "three";
const canvas = document.createElement("canvas");
canvas.width = 64;
canvas.height = 64;
document.body.appendChild(canvas);
try {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(64, 64, false);
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 4);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
  cube.rotation.set(0.4, 0.6, 0);
  scene.add(cube);
  scene.add(new THREE.AmbientLight(0xffffff, 1));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(2, 3, 4);
  scene.add(light);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  window.__result = { pixel: Array.from(pixel) };
} catch (error) {
  window.__result = { error: String(error) };
}
`;

describe("three.js in the render page", () => {
  it("bundles three into one self-contained script", { timeout: 60_000 }, async () => {
    const js = await bundleBrowserEntry({ contents: ENTRY });
    expect(js).toContain("WebGLRenderer");
    expect(js).not.toMatch(/\bimport\s*\(|\brequire\(/);
  });

  it("still builds the real render page bundle", { timeout: 60_000 }, async () => {
    expect((await pageScript()).length).toBeGreaterThan(1000);
  });

  it("renders a lit cube with WebGL and makes no network request", { timeout: 60_000 }, async (ctx) => {
    const js = await bundleBrowserEntry({ contents: ENTRY });
    await withOfflinePage(ctx, js, async ({ page, requests }) => {
      await page.waitForFunction(() => (window as unknown as { __result?: unknown }).__result !== undefined);
      const result = await page.evaluate(() => (window as unknown as { __result: { pixel?: number[]; error?: string } }).__result);

      expect(result.error).toBeUndefined();
      const [r, g, b, a] = result.pixel!;
      // The cube's red face, not the black clear color.
      expect(r).toBeGreaterThan(40);
      expect(r).toBeGreaterThan(g! + 20);
      expect(r).toBeGreaterThan(b! + 20);
      expect(a).toBe(255);
      expect(requests).toEqual([TEST_PAGE_URL]);
    });
  });
});
