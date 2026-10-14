// The exported page in a real browser: in an <iframe> on a host page, driven by
// `motioncraft:*` messages; and a page without `player` mounting as before.
// Skipped when no Chrome or Edge is installed.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, Frame, Page } from "playwright-core";
import { describe, expect, it, type TestContext } from "vitest";
import { validateStoryboard } from "../src/index";
import { BrowserNotFoundError, launchBrowser } from "../src/render/browser";
import { bundlePage } from "../src/render/bundle";
import { estimateDurations } from "../src/render/durations";
import type { PageInput } from "../src/render/page";
import { frameAtMs } from "../src/render/player";
import { resolveTheme } from "../src/render/themes";

const ORIGIN = "https://motioncraft.test";
const HOST_URL = `${ORIGIN}/host.html`;
const PLAYER_URL = `${ORIGIN}/player.html`;

async function fixtureInput(player?: boolean): Promise<PageInput> {
  const validation = validateStoryboard(JSON.parse(await readFile(join(import.meta.dirname, "fixtures", "headline-wide.json"), "utf8")));
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  const { storyboard } = validation;
  return { storyboard, theme: resolveTheme(storyboard), durations: estimateDurations(storyboard), ...(player === undefined ? {} : { player }) };
}

async function withBrowser(ctx: TestContext, use: (browser: Browser) => Promise<void>): Promise<void> {
  const browser = await launchBrowser().catch((error: unknown) => {
    if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed, skipping browser test: ${error.message}`);
    throw error;
  });
  try {
    await use(browser);
  } finally {
    await browser.close();
  }
}

/** Serves `pages` by URL and blocks every other request. */
async function serve(page: Page, pages: Record<string, string>): Promise<void> {
  await page.route("**/*", (route) => {
    const body = pages[route.request().url()];
    return body === undefined ? route.abort() : route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
  });
}

const HOST_HTML = `<!doctype html><html><body style="margin:0">
<iframe id="player" src="${PLAYER_URL}" style="width:960px;height:540px;border:0"></iframe>
<script>
  window.received = [];
  window.addEventListener("message", (event) => window.received.push(event.data));
  window.send = (message) => document.getElementById("player").contentWindow.postMessage(message, "*");
</script></body></html>`;

/** The frame's markup: what the page drew. */
const drawn = (frame: Frame) => frame.evaluate(() => document.getElementById("root")!.innerHTML);

describe("exported web player", () => {
  it("posts ready, seeks to the middle and plays when a host page drives it", { timeout: 60_000 }, async (ctx) => {
    const html = await bundlePage(await fixtureInput(true));
    await withBrowser(ctx, async (browser) => {
      const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
      const errors: Error[] = [];
      page.on("pageerror", (error) => errors.push(error));
      await serve(page, { [HOST_URL]: HOST_HTML, [PLAYER_URL]: html });
      await page.goto(HOST_URL);

      await page.waitForFunction(() => (window as unknown as { received: { type?: string }[] }).received.some((m) => m.type === "motioncraft:ready"), undefined, { timeout: 30_000 });
      const ready = await page.evaluate(() => (window as unknown as { received: { type?: string }[] }).received.find((m) => m.type === "motioncraft:ready"));
      expect(ready).toMatchObject({ type: "motioncraft:ready", fps: 30, width: 1920, height: 1080 });
      const { totalFrames, durationMs } = ready as unknown as { totalFrames: number; durationMs: number };
      expect(durationMs).toBe((totalFrames * 1000) / 30);

      const player = page.frame({ url: PLAYER_URL })!;
      // Scaled to fit the 960x540 iframe: half size, no offset.
      expect(await player.evaluate(() => document.getElementById("root")!.style.transform)).toBe("translate(0px, 0px) scale(0.5)");
      const first = await drawn(player);

      // A burst of seeks: only the last one is drawn.
      await page.evaluate((ms) => {
        const send = (window as unknown as { send: (m: unknown) => void }).send;
        for (let i = 1; i <= 20; i++) send({ type: "motioncraft:seek", ms: (ms * i) / 20 });
      }, durationMs / 2);
      await player.waitForFunction((before) => document.getElementById("root")!.innerHTML !== before, first);
      const middle = await drawn(player);
      expect(middle).not.toBe(first);
      // ...and it is the last seek's frame, not one of the earlier ones.
      const last = frameAtMs(durationMs / 2, 30, totalFrames);
      expect(await player.evaluate((n) => (window.motioncraft!.renderFrame(n), document.getElementById("root")!.innerHTML), last)).toBe(middle);

      // Bad messages are ignored.
      await page.evaluate(() => {
        const send = (window as unknown as { send: (m: unknown) => void }).send;
        send("motioncraft:seek");
        send({ type: "motioncraft:seek", ms: "0" });
      });

      await page.evaluate(() => (window as unknown as { send: (m: unknown) => void }).send({ type: "motioncraft:play", fromMs: 2800 }));
      // The first scene opens settled and holds; play across the fade into the second, which builds.
      const samples: string[] = [];
      for (let i = 0; i < 4; i++) {
        await page.waitForTimeout(250);
        samples.push(await drawn(player));
      }
      expect(new Set(samples).size).toBeGreaterThan(2);

      await page.evaluate(() => (window as unknown as { send: (m: unknown) => void }).send({ type: "motioncraft:pause" }));
      await page.waitForTimeout(100);
      const paused = await drawn(player);
      await page.waitForTimeout(300);
      expect(await drawn(player)).toBe(paused);
      expect(errors).toEqual([]);
    });
  });

  it("mounts a page without player exactly as before: no message listener, no scaling", { timeout: 60_000 }, async (ctx) => {
    const html = await bundlePage(await fixtureInput());
    await withBrowser(ctx, async (browser) => {
      const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
      await page.addInitScript(() => {
        const types: string[] = [];
        (window as unknown as { listenerTypes: string[] }).listenerTypes = types;
        const add = window.addEventListener.bind(window);
        window.addEventListener = ((type: string, ...rest: [EventListenerOrEventListenerObject, (boolean | AddEventListenerOptions)?]) => {
          types.push(type);
          add(type, ...rest);
        }) as typeof window.addEventListener;
      });
      await serve(page, { [PLAYER_URL]: html });
      await page.goto(PLAYER_URL);
      await page.waitForFunction(() => window.motioncraft !== undefined);
      await page.evaluate(() => window.motioncraft!.renderFrame(0));
      const state = await page.evaluate(() => ({
        listeners: (window as unknown as { listenerTypes: string[] }).listenerTypes,
        root: document.getElementById("root")!.getAttribute("style"),
        body: document.body.getAttribute("style"),
        html: document.documentElement.getAttribute("style"),
      }));
      expect(state.listeners).not.toContain("message");
      expect(state.listeners).not.toContain("resize");
      expect(state).toMatchObject({ root: null, body: null, html: null });
    });
  });
});
