// Times how long a frame takes to render, the way the video render does it
// (show the frame, then a DevTools screenshot; encoding is not timed), and
// names the WebGL renderer the browser used. A dev tool for 3D (src/kit/three/).
//   npx tsx scripts/bench-three.ts <storyboard.json>... [--swiftshader] [--frames 30] [--warmup 5]
// --swiftshader forces WebGL onto the CPU (SwiftShader), as on a machine with no GPU.

import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Page } from "playwright-core";
import { buildTimeline } from "../src/engine/timeline";
import { sceneDurations } from "../src/render/durations";
import { prepareMedia } from "../src/render/media";
import { checkComponents, showFrame, withRenderPage } from "../src/render/session";
import { resolveTheme } from "../src/render/themes";
import { validateStoryboard } from "../src/storyboard/validate";

// `BROWSER_ARGS` already allows the software fallback; this forces it.
const SWIFTSHADER_ARGS = ["--use-angle=swiftshader"];

interface BenchArgs {
  storyboards: string[];
  swiftshader: boolean;
  frames: number;
  warmup: number;
}

function parseArgs(argv: string[]): BenchArgs {
  const args: BenchArgs = { storyboards: [], swiftshader: false, frames: 30, warmup: 5 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--swiftshader") args.swiftshader = true;
    else if (arg === "--frames" || arg === "--warmup") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < (arg === "--frames" ? 1 : 0)) throw new Error(`${arg} needs a whole number`);
      if (arg === "--frames") args.frames = value;
      else args.warmup = value;
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else args.storyboards.push(arg);
  }
  if (args.storyboards.length === 0) {
    throw new Error("usage: npx tsx scripts/bench-three.ts <storyboard.json>... [--swiftshader] [--frames 30] [--warmup 5]");
  }
  return args;
}

/** The value at fraction `q` (0..1) of the sorted samples. */
function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? Number.NaN;
}

/** The WebGL renderer string (e.g. "ANGLE (NVIDIA ...)" or "ANGLE (Google, Vulkan ... SwiftShader ...)"). */
function webglRenderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    if (gl === null) return "no WebGL context";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(info === null ? gl.RENDERER : info.UNMASKED_RENDERER_WEBGL));
  });
}

/** `count` distinct frames spread over `from`..`total - 1` (wrapping when the video is shorter). */
function spread(from: number, total: number, count: number): number[] {
  const span = Math.max(1, total - from);
  return Array.from({ length: count }, (_, i) => from + (Math.floor((i * span) / count) % span));
}

async function bench(path: string, args: BenchArgs): Promise<void> {
  const validation = validateStoryboard(JSON.parse(await readFile(path, "utf8")));
  if (!validation.ok) throw new Error(`${path} is not a valid storyboard:\n${validation.errors.join("\n")}`);
  const { storyboard } = validation;
  const theme = resolveTheme(storyboard);
  const { input } = await prepareMedia({ storyboard, theme, durations: sceneDurations(storyboard, {}, theme), mediaDir: dirname(path) });
  checkComponents(input);
  const total = buildTimeline(storyboard, input.durations, theme).totalFrames;
  const launch = args.swiftshader ? { extraArgs: SWIFTSHADER_ARGS } : undefined;

  await withRenderPage(
    input,
    async (page) => {
      const renderer = await webglRenderer(page);
      const cdp = await page.context().newCDPSession(page);
      for (let frame = 0; frame < Math.min(args.warmup, total); frame++) await showFrame(page, frame);
      const show: number[] = [];
      const full: number[] = [];
      for (const frame of spread(Math.min(args.warmup, total - 1), total, args.frames)) {
        const start = performance.now();
        await showFrame(page, frame);
        const shown = performance.now();
        await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
        const end = performance.now();
        show.push(shown - start);
        full.push(end - start);
      }
      const ms = (samples: number[]) => {
        const sorted = [...samples].sort((a, b) => a - b);
        return `median ${quantile(sorted, 0.5).toFixed(1)} ms, p95 ${quantile(sorted, 0.95).toFixed(1)} ms`;
      };
      console.log(`${path} (${storyboard.aspect}, ${args.frames} frames${args.swiftshader ? ", SwiftShader forced" : ""})`);
      console.log(`  renderer: ${renderer}`);
      console.log(`  show + capture: ${ms(full)}`);
      console.log(`  show only:      ${ms(show)}`);
    },
    undefined,
    launch,
  );
}

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  for (const path of args.storyboards) await bench(path, args);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
