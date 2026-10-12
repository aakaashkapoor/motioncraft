// Layer-1 checks: the storyboard checks (transitions, theme colors, media files,
// narration-fit when the narration is spoken, scene audio files (missing or
// unusable files are errors; no word times, or words that are not the
// narration's, are warnings), and narration-guess when the
// voice's dictionaries are already downloaded, and receipt-total when a
// Receipt's amounts do not add up to its total, and headline-lines when a
// line of a line-by-line headline is cued too late to land before the exit),
// then the start, middle and end frame of every scene (overflow, safe area,
// contrast, readability, and the type-scale warning). Prints the problems and
// warnings and exits non-zero on any error or frame problem; warnings alone pass.
//   npx tsx scripts/check.ts <storyboard.json>

import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { checkStoryboard, formatIssue, formatProblem, runChecks } from "../src/checks";
import { defaultCacheDir } from "../src/narration/assets";
import { narrationGuessWarnings } from "../src/narration/guesses";
import { headlineLineWarnings } from "../src/checks/headlineLines";
import { receiptTotalWarnings } from "../src/checks/receiptTotals";
import { checkSceneAudio } from "../src/checks/sceneAudio";
import { loadCachedNarration, missingNarrationNotice, narrationDir } from "../src/narration/narrate";
import { sceneDurations } from "../src/render/durations";
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

  // Scenes' own audio files first: one that is missing or unusable cannot be loaded as narration.
  const audioIssues = await checkSceneAudio(storyboard, mediaDir);
  const audioBroken = audioIssues.some((issue) => issue.severity === "error");
  // Narration already spoken (scripts/narrate.ts) sets the scene lengths and caption timing; none is ever made here.
  const cached = audioBroken ? { scenes: {}, missing: [] } : await loadCachedNarration(storyboard, { outDir: narrationDir(file), mediaDir });
  const notice = missingNarrationNotice(cached);
  if (notice !== undefined) console.log(notice);
  const narration = cached.scenes;
  const issues = [...audioIssues, ...(await checkStoryboard(storyboard, { theme, mediaDir, narration }))];
  for (const issue of issues) console.log(formatIssue(issue));
  // Words the voice will sound out; only from dictionaries already cached, so this never touches the network.
  // A scene with its own audio file is never spoken, so its words are not the voice's to guess.
  const spoken = { ...storyboard, scenes: storyboard.scenes.filter((scene) => scene.audio === undefined) };
  const guesses = await narrationGuessWarnings(spoken, defaultCacheDir());
  for (const guess of guesses) console.log(guess);
  const receipts = receiptTotalWarnings(storyboard);
  for (const receipt of receipts) console.log(receipt);
  const durations = sceneDurations(storyboard, narration, theme);
  const lateLines = headlineLineWarnings(storyboard, theme, durations, narration);
  for (const line of lateLines) console.log(line);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  if (errors > 0) {
    console.log(`${file}: ${errors} storyboard error${errors === 1 ? "" : "s"}; fix them before the frames can be checked`);
    process.exitCode = 1;
    return;
  }

  const result = await runChecks({ storyboard, theme, durations, mediaDir, narration });
  for (const warning of result.warnings) console.log(formatProblem(warning));
  const warnings = issues.length + guesses.length + receipts.length + lateLines.length + result.warnings.length;
  if (result.passed) {
    console.log(`${file}: all layer-1 checks passed${warnings > 0 ? ` (${warnings} warning${warnings === 1 ? "" : "s"})` : ""}`);
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
