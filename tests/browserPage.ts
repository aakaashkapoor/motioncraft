// Test helper: bundles a browser entry with esbuild into one IIFE and runs it
// in the installed Chrome or Edge on a page that can make no request besides
// its own document. Skips the test when no browser is installed.

import { join } from "node:path";
import { build } from "esbuild";
import type { Page } from "playwright-core";
import type { TestContext } from "vitest";
import { BrowserNotFoundError, launchBrowser } from "../src/render/browser";

const ORIGIN = "https://motioncraft.test";
export const TEST_PAGE_URL = `${ORIGIN}/test.html`;

const ROOT = join(import.meta.dirname, "..");

/**
 * Bundles `entry`: a file path under the repo, or `{ contents }` (TSX) resolved
 * from the repo root. React's production build by default; `development: true`
 * bundles its development build (where StrictMode replays effects).
 */
export async function bundleBrowserEntry(entry: string | { contents: string }, { development = false } = {}): Promise<string> {
  const source =
    typeof entry === "string"
      ? { entryPoints: [entry] }
      : { stdin: { contents: entry.contents, loader: "tsx" as const, resolveDir: ROOT, sourcefile: "entry.tsx" } };
  const result = await build({
    ...source,
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    minify: true,
    legalComments: "none",
    logLevel: "silent",
    define: { "process.env.NODE_ENV": development ? '"development"' : '"production"' },
  });
  return result.outputFiles[0]!.text;
}

/** The URLs the page requested. */
export interface OfflinePage {
  page: Page;
  requests: string[];
}

/** Opens a page running `js` with every request but the document blocked, runs `use`, and closes the browser. */
export async function withOfflinePage(ctx: TestContext, js: string, use: (offline: OfflinePage) => Promise<void>): Promise<void> {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script>${js.replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;
  const browser = await launchBrowser().catch((error: unknown) => {
    if (error instanceof BrowserNotFoundError) {
      ctx.skip(`no Chrome or Edge installed, skipping browser test: ${error.message}`);
    }
    throw error;
  });
  try {
    const page = await browser.newPage();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.route("**/*", (route) =>
      route.request().url() === TEST_PAGE_URL ? route.fulfill({ status: 200, contentType: "text/html", body: html }) : route.abort(),
    );
    await page.goto(TEST_PAGE_URL);
    await use({ page, requests });
  } finally {
    await browser.close();
  }
}
