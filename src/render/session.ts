// Opens the render page in the installed browser and hands it to a callback.
// Stills and checks both go through here, so they see the same pixels.

import type { Page } from "playwright-core";
import { kit } from "../kit";
import { frameSize } from "../layout/frame";
import { launchBrowser } from "./browser";
import { bundlePage } from "./bundle";
import type { PageInput } from "./page";

/** Throws if a scene names a component the kit does not have. */
export function checkComponents(input: PageInput): void {
  for (const scene of input.storyboard.scenes) {
    if (!Object.hasOwn(kit, scene.component)) {
      throw new Error(`scene "${scene.id}": unknown component "${scene.component}" (kit has: ${Object.keys(kit).join(", ")})`);
    }
  }
}

/** Loads the render page at the frame's size, runs `use`, then closes the browser. */
export async function withRenderPage<T>(input: PageInput, use: (page: Page) => Promise<T>): Promise<T> {
  const html = await bundlePage(input);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: frameSize(input.storyboard.aspect), deviceScaleFactor: 1 });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    await page.setContent(html);
    if (pageErrors.length > 0) throw new Error(`render page failed to load: ${pageErrors[0]!.message}`);
    await page.waitForFunction(() => window.motioncraft !== undefined);
    return await use(page);
  } finally {
    await browser.close();
  }
}

/** Shows `frame` on the page and waits for fonts, so it is ready to capture or measure. */
export async function showFrame(page: Page, frame: number): Promise<void> {
  await page.evaluate((n) => window.motioncraft!.renderFrame(n), frame);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
