// Real media for the renderer: finds the VideoClip and Image files a storyboard
// uses, checks them before any browser starts (clear errors for missing or
// unsupported files and bad props), resolves `durationMs: "clip"`, serves the
// files to the render page (byte ranges, so the page can seek; never the
// network), and lays out the clips' audio on the timeline for the future mix.

import { constants } from "node:fs";
import { access, open, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { Page } from "playwright-core";
import type { Timeline } from "../engine/timeline";
import { MEDIA_URL_PREFIX, mediaSrc } from "../kit/mediaSource";
import { sceneComponents } from "../storyboard/components";
import type { Storyboard } from "../storyboard/types";
import { readMp4DurationMs } from "./mp4Probe";
import type { PageInput } from "./page";

/** Video files the browser plays, by extension, with the type they are served as. */
export const VIDEO_TYPES: Readonly<Record<string, string>> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/mp4",
  ".webm": "video/webm",
};

export const IMAGE_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

/** Files whose duration `readMp4DurationMs` can read. */
const MP4_FAMILY = new Set([".mp4", ".m4v", ".mov"]);

const MEDIA_COMPONENTS = { VideoClip: VIDEO_TYPES, Image: IMAGE_TYPES } as const;
type MediaComponent = keyof typeof MEDIA_COMPONENTS;

/** One VideoClip or Image in a scene. */
export interface MediaUse {
  sceneId: string;
  component: MediaComponent;
  props: Record<string, unknown>;
  /** The `src` prop as written, or undefined if missing. */
  src: string | undefined;
  /** `src` resolved against the media directory. */
  path: string | undefined;
}

export class MediaError extends Error {
  constructor(public readonly problems: readonly string[]) {
    super(`media problem${problems.length === 1 ? "" : "s"}:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "MediaError";
  }
}

/** Every VideoClip and Image in the storyboard, scene by scene. */
export function mediaUses(storyboard: Storyboard, mediaDir = process.cwd()): MediaUse[] {
  return storyboard.scenes.flatMap((scene) =>
    sceneComponents(scene)
      .filter((use): use is { component: MediaComponent; props: Record<string, unknown> } => Object.hasOwn(MEDIA_COMPONENTS, use.component))
      .map(({ component, props }) => {
        const src = typeof props.src === "string" && props.src.trim() !== "" ? props.src : undefined;
        return { sceneId: scene.id, component, props, src, path: src === undefined ? undefined : resolve(mediaDir, src) };
      }),
  );
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function fitError(fit: unknown): string[] {
  return fit === undefined || fit === "cover" || fit === "contain" ? [] : [`fit must be "cover" or "contain" (got ${JSON.stringify(fit)})`];
}

function videoPropErrors(props: Record<string, unknown>): string[] {
  const { trimStartMs, trimEndMs, rate, muted } = props;
  const errors = fitError(props.fit);
  if (trimStartMs !== undefined && !(isNumber(trimStartMs) && trimStartMs >= 0)) errors.push("trimStartMs must be a number of ms, 0 or more");
  if (trimEndMs !== undefined && !(isNumber(trimEndMs) && trimEndMs > (isNumber(trimStartMs) ? trimStartMs : 0))) {
    errors.push("trimEndMs must be a number of ms after trimStartMs");
  }
  if (rate !== undefined && !(isNumber(rate) && rate > 0)) errors.push(`rate must be a positive number (got ${JSON.stringify(rate)})`);
  if (muted !== undefined && typeof muted !== "boolean") errors.push("muted must be true or false");
  return errors;
}

function imagePropErrors(props: Record<string, unknown>): string[] {
  const { focus, zoom, pan } = props;
  const errors = fitError(props.fit);
  const unit = (v: unknown) => v === undefined || (isNumber(v) && v >= 0 && v <= 1);
  const point = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (focus !== undefined && !(point(focus) && isNumber(focus.x) && isNumber(focus.y) && unit(focus.x) && unit(focus.y))) {
    errors.push("focus must be { x, y } with each between 0 and 1");
  }
  const scale = (v: unknown) => v === undefined || (isNumber(v) && v > 0);
  if (zoom !== undefined && !(isNumber(zoom) ? zoom > 0 : point(zoom) && scale(zoom.from) && scale(zoom.to))) {
    errors.push("zoom must be a positive scale or { from, to }");
  }
  const drift = (v: unknown) => v === undefined || isNumber(v);
  if (pan !== undefined && !(point(pan) && drift(pan.x) && drift(pan.y))) errors.push("pan must be { x, y }, fractions of the box");
  return errors;
}

/** Problems with one use's props and file type; does not touch the disk. */
function useErrors(use: MediaUse): string[] {
  if (use.src === undefined) return ["src is required: the path to a local file"];
  const types = MEDIA_COMPONENTS[use.component];
  const ext = extname(use.src).toLowerCase();
  const errors = use.component === "VideoClip" ? videoPropErrors(use.props) : imagePropErrors(use.props);
  if (!Object.hasOwn(types, ext)) {
    const kind = use.component === "VideoClip" ? "video" : "image";
    errors.unshift(`unsupported ${kind} type "${ext || "(none)"}" for "${use.src}" (use ${Object.keys(types).join(", ")})`);
  }
  return errors;
}

/** Whether `path` is a readable file; otherwise the reason it is not. */
export async function fileProblem(path: string): Promise<string | undefined> {
  try {
    if (!(await stat(path)).isFile()) return "is not a file";
    await access(path, constants.R_OK);
    return undefined;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" ? "not found" : `cannot be read (${code ?? String(error)})`;
  }
}

export interface PreparedMedia {
  /** The input with every `durationMs: "clip"` resolved into `durations`. */
  input: PageInput;
  /** Source durations (ms) of the video files that could be read, by resolved path. */
  sourceDurationsMs: Record<string, number>;
}

/** How long a clip plays: from trimStart to trimEnd (or the end of the file), at its rate. */
function clipLengthMs(props: Record<string, unknown>, sourceMs: number | undefined): number | undefined {
  const start = isNumber(props.trimStartMs) ? props.trimStartMs : 0;
  const end = isNumber(props.trimEndMs) ? props.trimEndMs : sourceMs;
  const rate = isNumber(props.rate) ? props.rate : 1;
  return end === undefined ? undefined : (end - start) / rate;
}

/**
 * Checks every media file the storyboard uses and resolves scenes that take
 * their length from their clip. Throws a `MediaError` listing every problem.
 */
export async function prepareMedia(input: PageInput): Promise<PreparedMedia> {
  const uses = mediaUses(input.storyboard, input.mediaDir);
  const problems: string[] = [];
  const label = (use: MediaUse) => `scene "${use.sceneId}": ${use.component}`;

  for (const use of uses) {
    const errors = useErrors(use);
    problems.push(...errors.map((e) => `${label(use)} ${e}`));
    if (errors.length > 0 || use.path === undefined) continue;
    const problem = await fileProblem(use.path);
    if (problem !== undefined) problems.push(`${label(use)} src "${use.src}" ${problem} (looked for ${use.path})`);
  }
  if (problems.length > 0) throw new MediaError(problems);

  const sourceDurationsMs: Record<string, number> = {};
  const probeErrors = new Map<string, string>();
  for (const use of uses) {
    if (use.component !== "VideoClip" || use.path === undefined || !MP4_FAMILY.has(extname(use.path).toLowerCase())) continue;
    if (Object.hasOwn(sourceDurationsMs, use.path) || probeErrors.has(use.path)) continue;
    await readMp4DurationMs(use.path).then(
      (ms) => (sourceDurationsMs[use.path!] = ms),
      (error: unknown) => probeErrors.set(use.path!, error instanceof Error ? error.message : String(error)),
    );
  }

  const durations = { ...input.durations };
  for (const scene of input.storyboard.scenes) {
    if (scene.durationMs !== "clip") continue;
    const clip = uses.find((use) => use.sceneId === scene.id && use.component === "VideoClip");
    if (clip === undefined || clip.path === undefined) {
      problems.push(`scene "${scene.id}": durationMs "clip" needs a VideoClip in the scene`);
      continue;
    }
    const ms = clipLengthMs(clip.props, sourceDurationsMs[clip.path]);
    if (ms === undefined) {
      const why = probeErrors.get(clip.path) ?? `the length of "${clip.src}" cannot be read`;
      problems.push(`scene "${scene.id}": durationMs "clip": ${why}; set trimEndMs on the VideoClip`);
    } else if (ms <= 0) {
      problems.push(`scene "${scene.id}": durationMs "clip": the VideoClip starts (trimStartMs) after the end of "${clip.src}"`);
    } else {
      durations[scene.id] = ms;
    }
  }
  if (problems.length > 0) throw new MediaError(problems);

  const { storyboard, theme, mediaDir } = input;
  return { input: { storyboard, theme, durations, ...(mediaDir === undefined ? {} : { mediaDir }) }, sourceDurationsMs };
}

/** When and how a clip's audio plays in the output, for the future audio mix. */
export interface ClipAudio {
  sceneId: string;
  src: string;
  /** The file, resolved. */
  path: string;
  /** Where the clip starts on the output timeline, ms. */
  startMs: number;
  /** How long it plays in the output, ms: until the scene ends or the clip does. */
  durationMs: number;
  /** Where playback starts in the source, ms. */
  sourceStartMs: number;
  rate: number;
  muted: boolean;
}

/** The audio timing of every VideoClip on the timeline. Pure. */
export function clipAudioPlan(
  storyboard: Storyboard,
  timeline: Timeline,
  mediaDir?: string,
  sourceDurationsMs: Readonly<Record<string, number>> = {},
): ClipAudio[] {
  return mediaUses(storyboard, mediaDir).flatMap((use) => {
    if (use.component !== "VideoClip" || use.src === undefined || use.path === undefined) return [];
    const scene = timeline.scenes.find((s) => s.id === use.sceneId)!;
    const ms = (frames: number) => (frames * 1000) / timeline.fps;
    const sceneMs = ms(scene.frames);
    const length = clipLengthMs(use.props, sourceDurationsMs[use.path]) ?? Infinity;
    return [
      {
        sceneId: use.sceneId,
        src: use.src,
        path: use.path,
        startMs: ms(scene.startFrame),
        durationMs: Math.min(sceneMs, Math.max(0, length)),
        sourceStartMs: isNumber(use.props.trimStartMs) ? use.props.trimStartMs : 0,
        rate: isNumber(use.props.rate) ? use.props.rate : 1,
        muted: use.props.muted === true,
      },
    ];
  });
}

/**
 * A `Range: bytes=...` header as an inclusive byte range of a `size`-byte file.
 * Null to send the whole file (no header, or one we do not handle).
 */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | "unsatisfiable" {
  const match = header === undefined ? null : /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null) return null;
  const [, first, last] = match;
  if (first === "") {
    if (last === "") return null;
    const suffix = Number(last);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}

/** The most an open-ended range request gets in one response; the browser asks again for more. */
const MAX_CHUNK = 16 * 1024 * 1024;

/** Serves the storyboard's media files (and nothing else) to the page at `MEDIA_URL_PREFIX`. */
export async function routeMedia(page: Page, storyboard: Storyboard, mediaDir?: string): Promise<void> {
  const files = new Map<string, { path: string; type: string }>();
  for (const use of mediaUses(storyboard, mediaDir)) {
    if (use.src === undefined || use.path === undefined) continue;
    const type = MEDIA_COMPONENTS[use.component][extname(use.src).toLowerCase()];
    if (type !== undefined) files.set(use.src, { path: use.path, type });
  }

  await page.route(`${MEDIA_URL_PREFIX}**`, async (route) => {
    const src = mediaSrc(route.request().url());
    const file = src === undefined ? undefined : files.get(src);
    if (file === undefined) return route.fulfill({ status: 404, body: "not a media file of this storyboard" });

    const handle = await open(file.path, "r");
    try {
      const { size } = await handle.stat();
      const headers = { "accept-ranges": "bytes", "content-type": file.type };
      const range = parseRange(await route.request().headerValue("range") ?? undefined, size);
      if (range === "unsatisfiable") {
        return route.fulfill({ status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
      }
      const start = range?.start ?? 0;
      const end = range === null ? size - 1 : Math.min(range.end, start + MAX_CHUNK - 1);
      const body = Buffer.alloc(end - start + 1);
      await handle.read(body, 0, body.length, start);
      if (range === null) return route.fulfill({ status: 200, headers, body });
      return route.fulfill({ status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}` }, body });
    } finally {
      await handle.close();
    }
  });
}
