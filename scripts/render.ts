// Renders a storyboard to an MP4 in the installed Chrome or Edge. The narration
// is spoken locally first (cached beside the storyboard) and mixed in as the
// audio track; --no-narration renders without a voice, with estimated timings.
//   npx tsx scripts/render.ts <storyboard.json> --out <file.mp4> [--no-narration]

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { validateStoryboard } from "../src/storyboard/validate";
import { parseRenderArgs } from "../src/render/args";
import { kokoroSynthesizer } from "../src/narration/kokoro";
import { narrateStoryboard, narrationDir } from "../src/narration/narrate";
import { planRender } from "../src/render/renderPlan";
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

/** "narrating 3/8" on one updating line in a terminal, one line per scene otherwise. */
function narrationProgress(): (done: number, total: number) => void {
  return (done, total) => {
    const line = `narrating ${done}/${total}`;
    if (process.stdout.isTTY) process.stdout.write(`\r${line}${done === total ? "\n" : ""}`);
    else console.log(line);
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

  const theme = resolveTheme(storyboard);
  const mediaDir = dirname(args.storyboard);
  const plan = await planRender({
    storyboard,
    theme,
    mediaDir,
    narrate: args.narration
      ? (board) =>
          narrateStoryboard(board, {
            synthesizer: kokoroSynthesizer(),
            outDir: narrationDir(args.storyboard),
            onProgress: narrationProgress(),
          })
      : null,
  });
  if (!plan.ok) {
    throw new Error(`${args.storyboard} has errors; nothing was rendered:\n${plan.errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  for (const warning of plan.warnings) console.log(warning);

  const result = await renderVideo({
    storyboard,
    theme,
    durations: plan.durations,
    mediaDir,
    out: args.out,
    ...(plan.narration === undefined ? {} : { narration: plan.narration }),
    onProgress: progressPrinter(),
  });

  console.log(resolve(result.path));
  console.log(
    `${result.width}x${result.height}, ${result.fps} fps, ${result.frames} frames, ` +
      `${(result.durationMs / 1000).toFixed(2)} s, ${formatBytes(result.bytes)} (${result.codec}, ${result.audioCodec === undefined ? "no audio" : result.audioCodec})`,
  );
  if (result.audioSkipped !== undefined && result.audioSkipped.length > 0) console.log(`audio skipped: ${result.audioSkipped.join(", ")}`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
