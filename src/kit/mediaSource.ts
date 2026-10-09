// Where the render page finds local media, and which moment of a clip a frame
// shows. Pure, and safe to bundle into the page.

/**
 * Local media is served from this origin by the renderer (see
 * `render/media.ts`), the same origin as the render page: nothing is fetched
 * from the network.
 */
export const MEDIA_URL_PREFIX = "https://motioncraft.localhost/media/";

/** The page URL for a storyboard `src` (a local path, as written). */
export function mediaUrl(src: string): string {
  return MEDIA_URL_PREFIX + encodeURIComponent(src);
}

/** The `src` a media URL stands for, or undefined for any other URL. */
export function mediaSrc(url: string): string | undefined {
  if (!url.startsWith(MEDIA_URL_PREFIX)) return undefined;
  try {
    return decodeURIComponent(url.slice(MEDIA_URL_PREFIX.length).split(/[?#]/)[0]!);
  } catch {
    return undefined;
  }
}

export interface ClipTiming {
  /** Where the clip starts in the source, ms. Default 0. */
  trimStartMs?: number;
  /** Where it ends in the source, ms. Default: the end of the file. */
  trimEndMs?: number;
  /** Playback speed. Default 1. */
  rate?: number;
}

/**
 * How far past a frame's start time to seek. The browser shows the frame whose
 * time span contains the seek time; landing exactly on a boundary could round to
 * the previous frame. A tenth of a millisecond is far below any frame's length.
 */
export const SEEK_NUDGE_MS = 0.1;

/**
 * The source time in seconds to show `sceneMs` into the scene:
 * trimStart + sceneMs * rate, nudged inside its frame, and held on the last
 * frame before trimEnd.
 */
export function clipMediaTime(sceneMs: number, { trimStartMs = 0, trimEndMs, rate = 1 }: ClipTiming): number {
  let ms = trimStartMs + sceneMs * rate + SEEK_NUDGE_MS;
  if (trimEndMs !== undefined) ms = Math.min(ms, trimEndMs - SEEK_NUDGE_MS);
  return Math.max(0, ms) / 1000;
}
