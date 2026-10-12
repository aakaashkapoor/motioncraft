// Command-line arguments for scripts/stills.ts, scripts/render.ts and scripts/narrate.ts.

import { parseArgs } from "node:util";
import { isVoiceSpeed, MAX_VOICE_SPEED, MIN_VOICE_SPEED } from "../storyboard/validate";
import { DEFAULT_MAX_MB } from "./budget";
import { parseFrameList } from "./frames";

export const STILLS_USAGE =
  "usage: npx tsx scripts/stills.ts <storyboard.json> --out <dir> [--frames 0,15,30 | --per-scene | --slides [ids]]";

export interface StillsArgs {
  storyboard: string;
  out: string;
  /** Explicit frames, or "per-scene" for the start, middle and end of each scene. */
  frames: number[] | "per-scene";
  /** Render finished slides instead: every scene (true) or the listed scene ids. Never with `--frames`. */
  slides?: true | string[];
}

/** Parses the arguments. With neither `--frames` nor `--per-scene`, renders per scene. */
export function parseStillsArgs(argv: readonly string[]): StillsArgs {
  // A bare `--slides` means every scene: give it an empty value rather than the next option.
  const args = argv.map((arg, i) => (arg === "--slides" && (i + 1 === argv.length || argv[i + 1]!.startsWith("--")) ? "--slides=" : arg));
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      frames: { type: "string" },
      "per-scene": { type: "boolean" },
      slides: { type: "string" },
    },
  });

  if (positionals.length !== 1) throw new Error(`expected one storyboard file\n${STILLS_USAGE}`);
  if (values.out === undefined || values.out === "") throw new Error(`--out <dir> is required\n${STILLS_USAGE}`);
  if (values.frames !== undefined && values["per-scene"]) {
    throw new Error(`use either --frames or --per-scene, not both\n${STILLS_USAGE}`);
  }

  if (values.slides !== undefined && (values.frames !== undefined || values["per-scene"])) {
    throw new Error(`--slides cannot be combined with --frames or --per-scene\n${STILLS_USAGE}`);
  }
  const ids = values.slides?.split(",").map((id) => id.trim()).filter((id) => id !== "");
  const slides = ids === undefined ? undefined : ids.length === 0 ? true : ids;

  return {
    storyboard: positionals[0]!,
    out: values.out,
    frames: values.frames === undefined ? "per-scene" : parseFrameList(values.frames),
    ...(slides === undefined ? {} : { slides }),
  };
}

export const RENDER_USAGE = "usage: npx tsx scripts/render.ts <storyboard.json> --out <file.mp4> [--no-narration] [--max-mb <n>]";

export interface RenderArgs {
  storyboard: string;
  out: string;
  /** Speak the narration and mix it in (the default); false renders without a voice, with estimated timings. */
  narration: boolean;
  /** The size budget in MB (1024 * 1024 bytes); 0 means no budget, at the full fixed bitrate. */
  maxMb: number;
}

/** Runs `parse`, adding the usage line to whatever it throws (unknown options, missing values). */
function withUsage<T>(usage: string, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${usage}`);
  }
}

/** Parses the arguments for rendering a storyboard to MP4. */
export function parseRenderArgs(argv: readonly string[]): RenderArgs {
  const { values, positionals } = withUsage(RENDER_USAGE, () =>
    parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: { out: { type: "string" }, "no-narration": { type: "boolean" }, "max-mb": { type: "string" } },
    }),
  );

  if (positionals.length !== 1) throw new Error(`expected one storyboard file
${RENDER_USAGE}`);
  if (values.out === undefined || values.out === "") throw new Error(`--out <file.mp4> is required
${RENDER_USAGE}`);
  if (!values.out.toLowerCase().endsWith(".mp4")) throw new Error(`--out must name an .mp4 file
${RENDER_USAGE}`);
  const maxMbText = values["max-mb"];
  if (maxMbText !== undefined && !/^\d+(\.\d+)?$/.test(maxMbText)) {
    throw new Error(`--max-mb must be a number of megabytes, 0 or more
${RENDER_USAGE}`);
  }
  const maxMb = maxMbText === undefined ? DEFAULT_MAX_MB : Number(maxMbText);
  return { storyboard: positionals[0]!, out: values.out, narration: values["no-narration"] !== true, maxMb };
}

export const NARRATE_USAGE = "usage: npx tsx scripts/narrate.ts <storyboard.json> [--offline] [--speed 0.8-1.4]";

export interface NarrateArgs {
  storyboard: string;
  offline: boolean;
  /** Overrides the storyboard's `voiceSpeed`. */
  speed?: number;
}

/** Parses the arguments for speaking a storyboard's narration. */
export function parseNarrateArgs(argv: readonly string[]): NarrateArgs {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: { offline: { type: "boolean" }, speed: { type: "string" } },
  });

  if (positionals.length !== 1) throw new Error(`expected one storyboard file
${NARRATE_USAGE}`);
  const result: NarrateArgs = { storyboard: positionals[0]!, offline: values.offline === true };
  if (values.speed !== undefined) {
    const speed = Number(values.speed);
    if (values.speed.trim() === "" || !isVoiceSpeed(speed)) throw new Error(`--speed must be a number from ${MIN_VOICE_SPEED} to ${MAX_VOICE_SPEED} (got "${values.speed}")
${NARRATE_USAGE}`);
    result.speed = speed;
  }
  return result;
}
