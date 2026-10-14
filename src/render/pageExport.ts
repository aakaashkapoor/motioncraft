// Exporting a storyboard as a web page (scripts/page.ts): the arguments, and
// the media a page on disk cannot show. A render serves media files to its
// page through the browser driver (see `routeMedia`); `bundlePage` inlines only
// the fonts, so a page opened from disk would find no images, clips or audio.

import { parseArgs } from "node:util";
import type { Storyboard } from "../storyboard/types";
import { mediaUses } from "./media";

export const PAGE_USAGE = "usage: npx tsx scripts/page.ts <storyboard.json> --out <file.html>";

export interface PageArgs {
  storyboard: string;
  out: string;
}

/** Parses the arguments for exporting a storyboard as an interactive HTML page. */
export function parsePageArgs(argv: readonly string[]): PageArgs {
  let parsed;
  try {
    parsed = parseArgs({ args: [...argv], allowPositionals: true, options: { out: { type: "string" } } });
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${PAGE_USAGE}`);
  }
  const { values, positionals } = parsed;
  if (positionals.length !== 1) throw new Error(`expected one storyboard file\n${PAGE_USAGE}`);
  if (values.out === undefined || values.out === "") throw new Error(`--out <file.html> is required\n${PAGE_USAGE}`);
  if (!values.out.toLowerCase().endsWith(".html")) throw new Error(`--out must name an .html file\n${PAGE_USAGE}`);
  return { storyboard: positionals[0]!, out: values.out };
}

/** One problem per local media file a scene uses (images, clips, logos, its own audio); empty if the page can be exported. */
export function pageMediaProblems(storyboard: Storyboard): string[] {
  const NOT_YET = "page export does not support local media yet";
  const media = mediaUses(storyboard)
    .filter((use) => use.src !== undefined)
    .map((use) => `scene "${use.sceneId}": ${use.component} ${use.prop} "${use.src}": ${NOT_YET}`);
  const audio = storyboard.scenes.flatMap((scene) => (scene.audio === undefined ? [] : [`scene "${scene.id}": audio "${scene.audio.file}": ${NOT_YET}`]));
  return [...media, ...audio];
}
