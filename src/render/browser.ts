// Launches the user's installed Chrome, or Edge if Chrome is missing.
// playwright-core never downloads a browser, and neither do we.

import { chromium, type Browser } from "playwright-core";

const CHANNELS = ["chrome", "msedge"] as const;

const CHANNEL_NAMES: Record<(typeof CHANNELS)[number], string> = {
  chrome: "Google Chrome",
  msedge: "Microsoft Edge",
};

/**
 * Chromium flags for every render.
 * - No font hinting and an sRGB color profile: same pixels on every machine.
 * - `--enable-unsafe-swiftshader`: on a machine without a usable GPU, current
 *   Chrome refuses WebGL's software fallback (SwiftShader) unless this is set,
 *   and 3D scenes (`src/kit/three/`) would get no WebGL context. It only
 *   allows the fallback; a machine with a GPU still uses the GPU.
 */
export const BROWSER_ARGS: readonly string[] = [
  "--font-render-hinting=none",
  "--force-color-profile=srgb",
  "--enable-unsafe-swiftshader",
];

export interface LaunchOptions {
  /** Flags added after `BROWSER_ARGS`, e.g. to force SwiftShader in a benchmark (scripts/bench-three.ts). */
  extraArgs?: readonly string[];
}

const labels = new WeakMap<Browser, string>();

/** The browser's product name and version, e.g. "Google Chrome 154.0.8037.99", for messages. */
export function browserLabel(browser: Browser): string {
  return `${labels.get(browser) ?? "browser"} ${browser.version()}`;
}

export class BrowserNotFoundError extends Error {
  constructor(public readonly causes: string[]) {
    super(
      "motioncraft renders in your installed Google Chrome or Microsoft Edge, and found neither. " +
        "Install one of them (https://www.google.com/chrome/ or https://www.microsoft.com/edge) and try again.\n" +
        causes.map((cause) => `  - ${cause}`).join("\n"),
    );
    this.name = "BrowserNotFoundError";
  }
}

export async function launchBrowser({ extraArgs = [] }: LaunchOptions = {}): Promise<Browser> {
  const causes: string[] = [];
  for (const channel of CHANNELS) {
    try {
      const browser = await chromium.launch({
        channel,
        headless: true,
        args: [...BROWSER_ARGS, ...extraArgs],
      });
      labels.set(browser, CHANNEL_NAMES[channel]);
      return browser;
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      causes.push(`${channel}: ${message}`);
    }
  }
  throw new BrowserNotFoundError(causes);
}
