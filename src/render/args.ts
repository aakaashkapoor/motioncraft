// Command-line arguments for scripts/stills.ts.

import { parseArgs } from "node:util";
import { parseFrameList } from "./frames";

export const STILLS_USAGE =
  "usage: npx tsx scripts/stills.ts <storyboard.json> --out <dir> [--frames 0,15,30 | --per-scene]";

export interface StillsArgs {
  storyboard: string;
  out: string;
  /** Explicit frames, or "per-scene" for the start, middle and end of each scene. */
  frames: number[] | "per-scene";
}

/** Parses the arguments. With neither `--frames` nor `--per-scene`, renders per scene. */
export function parseStillsArgs(argv: readonly string[]): StillsArgs {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      out: { type: "string" },
      frames: { type: "string" },
      "per-scene": { type: "boolean" },
    },
  });

  if (positionals.length !== 1) throw new Error(`expected one storyboard file\n${STILLS_USAGE}`);
  if (values.out === undefined || values.out === "") throw new Error(`--out <dir> is required\n${STILLS_USAGE}`);
  if (values.frames !== undefined && values["per-scene"]) {
    throw new Error(`use either --frames or --per-scene, not both\n${STILLS_USAGE}`);
  }

  return {
    storyboard: positionals[0]!,
    out: values.out,
    frames: values.frames === undefined ? "per-scene" : parseFrameList(values.frames),
  };
}
