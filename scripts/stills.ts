// Renders chosen frames of a storyboard to PNG in the installed Chrome or Edge.
//   npx tsx scripts/stills.ts <storyboard.json> --out <dir> [--frames 0,15,30 | --per-scene]

import { readFile } from "node:fs/promises";
import { buildTimeline } from "../src/engine/timeline";
import { validateStoryboard } from "../src/storyboard/validate";
import { parseStillsArgs } from "../src/render/args";
import { estimateDurations } from "../src/render/durations";
import { perSceneFrames } from "../src/render/frames";
import { renderStills } from "../src/render/stills";
import { resolveTheme } from "../src/render/themes";

async function main(argv: string[]): Promise<void> {
  const args = parseStillsArgs(argv);

  const validation = validateStoryboard(JSON.parse(await readFile(args.storyboard, "utf8")));
  if (!validation.ok) {
    throw new Error(`${args.storyboard} is not a valid storyboard:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  const { storyboard } = validation;
  const theme = resolveTheme(storyboard);
  const durations = estimateDurations(storyboard);
  const frames = args.frames === "per-scene" ? perSceneFrames(buildTimeline(storyboard, durations, theme)) : args.frames;

  const paths = await renderStills({ storyboard, theme, durations, frames, outDir: args.out });
  for (const path of paths) console.log(path);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
