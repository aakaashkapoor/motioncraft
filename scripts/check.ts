// Layer-1 checks on the start, middle and end frame of every scene. Prints the
// problems and exits non-zero if there are any.
//   npx tsx scripts/check.ts <storyboard.json>

import { readFile } from "node:fs/promises";
import { formatProblem, runChecks } from "../src/checks";
import { estimateDurations } from "../src/render/durations";
import { resolveTheme } from "../src/render/themes";
import { validateStoryboard } from "../src/storyboard/validate";

const USAGE = "usage: npx tsx scripts/check.ts <storyboard.json>";

async function main(argv: string[]): Promise<void> {
  if (argv.length !== 1 || argv[0]!.startsWith("-")) throw new Error(USAGE);
  const file = argv[0]!;

  const validation = validateStoryboard(JSON.parse(await readFile(file, "utf8")));
  if (!validation.ok) {
    throw new Error(`${file} is not a valid storyboard:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  const { storyboard } = validation;
  const result = await runChecks({ storyboard, theme: resolveTheme(storyboard.theme), durations: estimateDurations(storyboard) });

  if (result.passed) {
    console.log(`${file}: all layer-1 checks passed`);
    return;
  }
  for (const problem of result.problems) console.log(formatProblem(problem));
  console.log(`${file}: ${result.problems.length} problem${result.problems.length === 1 ? "" : "s"}`);
  process.exitCode = 1;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
