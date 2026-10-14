// Exports a storyboard as one self-contained HTML page that plays it live in a
// browser: scaled to the window and driven by its host page with postMessage
// (`motioncraft:seek`, `play`, `pause`; it posts `motioncraft:ready`). No
// narration is spoken: scenes take their estimated durations, and the page has
// no audio. Local media files (images, clips, logos, scene audio) are refused.
//   npx tsx scripts/page.ts <storyboard.json> --out <file.html>

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildTimeline } from "../src/engine/timeline";
import { validateStoryboard } from "../src/storyboard/validate";
import { bundlePage } from "../src/render/bundle";
import { pageMediaProblems, parsePageArgs } from "../src/render/pageExport";
import { planRender } from "../src/render/renderPlan";
import { checkComponents } from "../src/render/session";
import { resolveTheme } from "../src/render/themes";

async function main(argv: string[]): Promise<void> {
  const args = parsePageArgs(argv);

  const validation = validateStoryboard(JSON.parse(await readFile(args.storyboard, "utf8")));
  if (!validation.ok) {
    throw new Error(`${args.storyboard} is not a valid storyboard:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  const { storyboard } = validation;
  const media = pageMediaProblems(storyboard);
  if (media.length > 0) throw new Error(`${args.storyboard} cannot be exported as a page:\n${media.map((p) => `  - ${p}`).join("\n")}`);

  const theme = resolveTheme(storyboard);
  const mediaDir = dirname(args.storyboard);
  const plan = await planRender({ storyboard, theme, mediaDir, narrate: null });
  if (!plan.ok) throw new Error(`${args.storyboard} has errors; nothing was written:\n${plan.errors.map((e) => `  - ${e}`).join("\n")}`);
  for (const warning of plan.warnings) console.log(warning);

  const input = { storyboard, theme, durations: plan.durations, mediaDir, player: true };
  checkComponents(input);
  const html = await bundlePage(input);
  const out = resolve(args.out);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html, "utf8");

  const timeline = buildTimeline(storyboard, plan.durations, theme);
  const seconds = timeline.totalFrames / timeline.fps;
  console.log(out);
  console.log(`${(Buffer.byteLength(html, "utf8") / 1024).toFixed(0)} KB, ${seconds.toFixed(1)} s (${timeline.totalFrames} frames at ${timeline.fps} fps)`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
