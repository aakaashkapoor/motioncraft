// The size budget: the video bitrate that makes a finished MP4 fit in a given
// number of bytes (GitHub takes at most 10 MB per video on free accounts).

import { VIDEO_BITRATE } from "./encode";

/** The default budget in MB: under GitHub's 10 MB, with margin. */
export const DEFAULT_MAX_MB = 9.5;

/** Below this, 1080p graphics break up; a budget that needs less is not met. */
export const MIN_VIDEO_BITRATE = 600_000;

/** Share of the budget left for the MP4 container and the encoder overshooting its bitrate. */
const HEADROOM = 0.92;

export interface BitrateBudget {
  durationSeconds: number;
  maxBytes: number;
  /** The audio track's bitrate, or 0 when the video has no audio. */
  audioBitrate: number;
}

/** The video bitrate that fits the budget, never above `VIDEO_BITRATE` nor below `MIN_VIDEO_BITRATE`. */
export function videoBitrateFor({ durationSeconds, maxBytes, audioBitrate }: BitrateBudget): number {
  const target = Math.floor((maxBytes * 8 * HEADROOM) / durationSeconds) - audioBitrate;
  return Math.max(MIN_VIDEO_BITRATE, Math.min(VIDEO_BITRATE, target));
}
