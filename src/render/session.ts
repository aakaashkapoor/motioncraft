// Opens the render page in the installed browser and hands it to a callback.
// Stills and checks both go through here, so they see the same pixels.

import type { Page } from "playwright-core";
import { kit } from "../kit";
import { frameSize } from "../layout/frame";
import { launchBrowser } from "./browser";
import { bundlePage } from "./bundle";
import type { PageInput } from "./page";
import { READY_TIMEOUT_MS, RenderNotReadyError } from "./ready";

/** Throws if a scene names a component the kit does not have. */
export function checkComponents(input: PageInput): void {
  for (const scene of input.storyboard.scenes) {
    if (!Object.hasOwn(kit, scene.component)) {
      throw new Error(`scene "${scene.id}": unknown component "${scene.component}" (kit has: ${Object.keys(kit).join(", ")})`);
    }
  }
}

/**
 * Where the page is served from. Nothing listens here: Playwright answers the
 * request itself (see `withRenderPage`). An https origin makes the page a
 * secure context, which WebCodecs (`VideoEncoder`) requires; `setContent`
 * leaves the page on about:blank, where it is missing.
 */
const PAGE_URL = "https://motioncraft.localhost/render.html";

/** Loads the render page at the frame's size, runs `use`, then closes the browser. */
export async function withRenderPage<T>(input: PageInput, use: (page: Page) => Promise<T>): Promise<T> {
  const html = await bundlePage(input);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: frameSize(input.storyboard.aspect), deviceScaleFactor: 1 });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    await page.route(PAGE_URL, (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    await page.goto(PAGE_URL);
    if (pageErrors.length > 0) throw new Error(`render page failed to load: ${pageErrors[0]!.message}`);
    await page.waitForFunction(() => window.motioncraft !== undefined);
    return await use(page);
  } finally {
    await browser.close();
  }
}

/**
 * Shows `frame` on the page and waits until it is ready to capture or measure:
 * fonts loaded, images decoded, every `delayRender` released. Throws
 * `RenderNotReadyError` naming what was still pending after `timeoutMs`.
 */
export async function showFrame(page: Page, frame: number, timeoutMs = READY_TIMEOUT_MS): Promise<void> {
  await page.evaluate((n) => window.motioncraft!.renderFrame(n), frame);
  const failure = await page.evaluate(
    (t) =>
      window.motioncraft!.waitUntilReady(t).then(
        () => null,
        (error: unknown) => ({
          message: error instanceof Error ? error.message : String(error),
          pending: error instanceof Error && "pending" in error ? (error.pending as string[]) : null,
        }),
      ),
    timeoutMs,
  );
  if (failure === null) return;
  if (failure.pending !== null) throw new RenderNotReadyError(failure.pending, timeoutMs);
  throw new Error(`frame ${frame} could not be made ready: ${failure.message}`);
}
