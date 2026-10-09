// Renders a storyboard to an MP4 in the installed Chrome or Edge (silent until
// narration lands; captions are burned in from the narration text).
//   npx tsx scripts/render.ts <storyboard.json> --out <file.mp4>

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { validateStoryboard } from "../src/storyboard/validate";
import { parseRenderArgs } from "../src/render/args";
import { estimateDurations } from "../src/render/durations";
import { resolveTheme } from "../src/render/themes";
import { renderVideo, type VideoProgress } from "../src/render/video";

/** Progress on one updating line in a terminal; every 10% otherwise (logs, CI). */
function progressPrinter(): (progress: VideoProgress) => void {
  let lastTenth = -1;
  return ({ frames, totalFrames }) => {
    const line = `frames ${frames} / ${totalFrames}`;
    if (process.stdout.isTTY) {
      process.stdout.write(`\r${line}${frames === totalFrames ? "\n" : ""}`);
      return;
    }
    const tenth = Math.floor((frames * 10) / totalFrames);
    if (tenth !== lastTenth) {
      lastTenth = tenth;
      console.log(line);
    }
  };
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

async function main(argv: string[]): Promise<void> {
  const args = parseRenderArgs(argv);

  const validation = validateStoryboard(JSON.parse(await readFile(args.storyboard, "utf8")));
  if (!validation.ok) {
    throw new Error(`${args.storyboard} is not a valid storyboard:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  const { storyboard } = validation;

  const result = await renderVideo({
    storyboard,
    theme: resolveTheme(storyboard),
    durations: estimateDurations(storyboard),
    mediaDir: dirname(args.storyboard),
    out: args.out,
    onProgress: progressPrinter(),
  });

  console.log(resolve(result.path));
  console.log(
    `${result.width}x${result.height}, ${result.fps} fps, ${result.frames} frames, ` +
      `${(result.durationMs / 1000).toFixed(2)} s, ${formatBytes(result.bytes)} (${result.codec})`,
  );
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
