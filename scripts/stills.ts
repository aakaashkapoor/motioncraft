// Renders chosen frames of a storyboard to PNG in the installed Chrome or Edge.
//   npx tsx scripts/stills.ts <storyboard.json> --out <dir> [--frames 0,15,30 | --per-scene]

import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildTimeline } from "../src/engine/timeline";
import { validateStoryboard } from "../src/storyboard/validate";
import { parseStillsArgs } from "../src/render/args";
import { loadCachedNarration, narrationDir } from "../src/narration/narrate";
import { sceneDurations } from "../src/render/durations";
import { perSceneFrames } from "../src/render/frames";
import { prepareMedia } from "../src/render/media";
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
  const mediaDir = dirname(args.storyboard);
  // Narration already spoken (scripts/narrate.ts) sets the scene lengths and caption timing; none is ever made here.
  const narration = await loadCachedNarration(storyboard, { outDir: narrationDir(args.storyboard) });
  const { input } = await prepareMedia({ storyboard, theme, durations: sceneDurations(storyboard, narration, theme), mediaDir, narration });
  const frames = args.frames === "per-scene" ? perSceneFrames(buildTimeline(storyboard, input.durations, theme)) : args.frames;

  const paths = await renderStills({ ...input, frames, outDir: args.out });
  for (const path of paths) console.log(path);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
