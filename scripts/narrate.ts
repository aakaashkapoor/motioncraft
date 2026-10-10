// Speaks a storyboard's narration locally (Kokoro) into <storyboard dir>/.motioncraft/narration/.
//   npx tsx scripts/narrate.ts <storyboard.json> [--voice name] [--offline]

import { readFile } from "node:fs/promises";
import { kokoroSynthesizer } from "../src/narration/kokoro";
import { narrateStoryboard, narrationDir } from "../src/narration/narrate";
import { parseNarrateArgs } from "../src/render/args";
import { validateStoryboard } from "../src/storyboard/validate";

async function main(argv: string[]): Promise<void> {
  const args = parseNarrateArgs(argv);

  const validation = validateStoryboard(JSON.parse(await readFile(args.storyboard, "utf8")));
  if (!validation.ok) {
    throw new Error(`${args.storyboard} is not a valid storyboard:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`);
  }

  const outDir = narrationDir(args.storyboard);
  const narrations = await narrateStoryboard(validation.storyboard, {
    synthesizer: kokoroSynthesizer({ offline: args.offline }),
    outDir,
    ...(args.voice === undefined ? {} : { voice: args.voice }),
  });
  for (const { sceneId, audioMs, words } of Object.values(narrations)) {
    console.log(`${sceneId}  ${(audioMs / 1000).toFixed(2)} s  ${words.length} words`);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
