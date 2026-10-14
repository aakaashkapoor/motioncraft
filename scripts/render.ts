// Renders a storyboard to an MP4 in the installed Chrome or Edge. The narration
// is spoken locally first (cached beside the storyboard) and mixed in as the
// audio track; a scene's own `audio` file is used instead of the voice;
// --no-narration renders without a voice, with estimated timings.
// The video bitrate is chosen so the MP4 fits --max-mb (default 9.5, GitHub's
// 10 MB limit with margin); over budget, it exits 1 and keeps the file.
//   npx tsx scripts/render.ts <storyboard.json> --out <file.mp4> [--no-narration] [--max-mb <n>]

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { validateStoryboard } from "../src/storyboard/validate";
import { formatIssue } from "../src/checks";
import { checkSceneAudio } from "../src/checks/sceneAudio";
import { parseRenderArgs } from "../src/render/args";
import { voiceSynthesizer } from "../src/narration/synthesizer";
import { narrateStoryboard, narrationDir } from "../src/narration/narrate";
import { planRender } from "../src/render/renderPlan";
import { resolveTheme } from "../src/render/themes";
import { describeMp4Color, readMp4Color } from "../src/render/mp4Color";
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

function formatBitrate(bitsPerSecond: number): string {
  return bitsPerSecond >= 1_000_000 ? `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps` : `${Math.round(bitsPerSecond / 1000)} kbps`;
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
  // A scene's own audio file that is missing or unusable stops the render before anything is spoken.
  const audioIssues = args.narration ? await checkSceneAudio(storyboard, mediaDir) : [];
  const audioErrors = audioIssues.filter((issue) => issue.severity === "error").map(formatIssue);
  if (audioErrors.length > 0) {
    throw new Error(`${args.storyboard} has errors; nothing was rendered:\n${audioErrors.map((e) => `  - ${e}`).join("\n")}`);
  }
  for (const issue of audioIssues) console.log(formatIssue(issue));
  const plan = await planRender({
    storyboard,
    theme,
    mediaDir,
    narrate: args.narration
      ? (board) =>
          narrateStoryboard(board, {
            synthesizer: voiceSynthesizer(),
            outDir: narrationDir(args.storyboard),
            mediaDir,
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
    maxMb: args.maxMb,
    ...(plan.narration === undefined ? {} : { narration: plan.narration }),
    onProgress: progressPrinter(),
    onWarning: (message) => console.log(message),
  });

  const budget = args.maxMb > 0 ? `budget ${args.maxMb} MB, ` : "";
  console.log(resolve(result.path));
  console.log(
    `${result.width}x${result.height}, ${result.fps} fps, ${result.frames} frames, ` +
      `${(result.durationMs / 1000).toFixed(2)} s, ${formatBytes(result.bytes)} (${budget}video ${formatBitrate(result.videoBitrate)}, ${result.codec}, ${describeMp4Color(await readMp4Color(result.path))}, ${result.audioCodec === undefined ? "no audio" : result.audioCodec})`,
  );
  if (result.audioSkipped !== undefined && result.audioSkipped.length > 0) console.log(`audio skipped: ${result.audioSkipped.join(", ")}`);
  if (args.maxMb > 0 && result.bytes > args.maxMb * 1024 * 1024) {
    console.error(`${formatBytes(result.bytes)} is over the ${args.maxMb} MB budget (kept the file); raise --max-mb, or 0 for no budget`);
    process.exitCode = 1;
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
