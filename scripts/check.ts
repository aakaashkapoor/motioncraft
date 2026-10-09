// Layer-1 checks: the storyboard checks (transitions, theme colors, media files),
// then the start, middle and end frame of every scene. Prints the problems and
// exits non-zero on any error or frame problem; warnings alone pass.
//   npx tsx scripts/check.ts <storyboard.json>

import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { checkStoryboard, formatIssue, formatProblem, runChecks } from "../src/checks";
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
  const theme = resolveTheme(storyboard);
  const mediaDir = dirname(file);

  const issues = await checkStoryboard(storyboard, { theme, mediaDir });
  for (const issue of issues) console.log(formatIssue(issue));
  const errors = issues.filter((issue) => issue.severity === "error").length;
  if (errors > 0) {
    console.log(`${file}: ${errors} storyboard error${errors === 1 ? "" : "s"}; fix them before the frames can be checked`);
    process.exitCode = 1;
    return;
  }

  const result = await runChecks({ storyboard, theme, durations: estimateDurations(storyboard), mediaDir });
  if (result.passed) {
    console.log(`${file}: all layer-1 checks passed${issues.length > 0 ? ` (${issues.length} warning${issues.length === 1 ? "" : "s"})` : ""}`);
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
