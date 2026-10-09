// A local video file, frame-accurate. It fills its frame (or the window it
// sits in), covered or contained. For every output frame the page seeks the
// <video> to trimStart + sceneTime * rate and holds capture, through the
// readiness gate, until the seek has finished and that frame is painted. The
// page never plays it and keeps it muted; `muted` only marks the clip's audio
// for the future mix (see `clipAudioPlan`).

import { useLayoutEffect, useRef, type RefObject } from "react";
import { cancelRender, continueRender, delayRender } from "../render/ready";
import { useSceneMs, useVisibleRect } from "./frameContext";
import { clipMediaTime, mediaUrl, SEEK_NUDGE_MS } from "./mediaSource";
import type { KitProps } from "./types";

export type MediaFit = "cover" | "contain";

export interface VideoClipProps extends KitProps {
  /** A local video file (.mp4, .m4v, .mov or .webm), relative to the storyboard. */
  src: string;
  /** Where the clip starts in the file, ms. Default 0. */
  trimStartMs?: number;
  /** Where it ends in the file, ms. Default: the end of the file. The last frame holds after it. */
  trimEndMs?: number;
  /** Default "cover". */
  fit?: MediaFit;
  /** Playback speed. Default 1. */
  rate?: number;
  /** Leaves the clip's audio out of the future mix. Default false. */
  muted?: boolean;
  shareId?: string;
}

const MEDIA_ERRORS: Record<number, string> = {
  1: "loading was aborted",
  2: "a read error occurred",
  3: "the browser could not decode it (corrupt file or unsupported codec)",
  4: "the browser cannot play this file (unsupported format or codec)",
};

/** Seeks `ref`'s video to `seconds` and holds the readiness gate until that frame is painted. */
function useVideoFrame(ref: RefObject<HTMLVideoElement | null>, src: string, seconds: number): void {
  // The time last painted, so a frame that shows the same moment again needs no seek.
  const shown = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    const video = ref.current;
    if (video === null) return;
    const handle = delayRender(`VideoClip "${src}" at ${seconds.toFixed(3)} s`);
    let released = false;
    const cleanups: (() => void)[] = [];
    const listen = (type: string, listener: () => void) => {
      video.addEventListener(type, listener, { once: true });
      cleanups.push(() => video.removeEventListener(type, listener));
    };
    const stopListening = () => {
      for (const cleanup of cleanups.splice(0)) cleanup();
    };
    const release = () => {
      if (released) return;
      released = true;
      stopListening();
      continueRender(handle);
    };
    // Keeps the handle until cleanup: releasing it now, before the driver waits,
    // would let the gate settle and forget the error.
    const fail = () => {
      stopListening();
      const reason = MEDIA_ERRORS[video.error?.code ?? 0] ?? video.error?.message ?? "unknown error";
      cancelRender(new Error(`VideoClip "${src}" cannot be played: ${reason}`));
    };

    const seek = () => {
      // Past the end of the file: hold its last frame.
      const target = Number.isFinite(video.duration) ? Math.min(seconds, Math.max(0, video.duration - SEEK_NUDGE_MS / 1000)) : seconds;
      if (shown.current === target && !video.seeking) return release();
      let seeked = false;
      let painted = false;
      const settle = () => {
        if (!seeked || !painted) return;
        shown.current = target;
        release();
      };
      video.requestVideoFrameCallback(() => {
        painted = true;
        settle();
      });
      listen("seeked", () => {
        seeked = true;
        settle();
      });
      video.currentTime = target;
    };

    listen("error", fail);
    if (video.error !== null) fail();
    else if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seek();
    else listen("loadedmetadata", seek);
    return release;
  }, [ref, src, seconds]);
}

export function VideoClip({ aspect, area, src, trimStartMs, trimEndMs, fit = "cover", rate, shareId }: VideoClipProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const seconds = clipMediaTime(useSceneMs(), { trimStartMs, trimEndMs, rate });
  useVideoFrame(ref, src, seconds);
  // Nested in a Section, fill its slot; otherwise the frame or the window it sits in.
  const visible = useVisibleRect(aspect);
  const rect = area ?? visible;

  return (
    <div
      data-media="video"
      {...(shareId === undefined ? {} : { "data-share-id": shareId })}
      style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.width, height: rect.height, overflow: "hidden" }}
    >
      <video
        ref={ref}
        data-media-element=""
        src={mediaUrl(src)}
        muted
        playsInline
        preload="auto"
        style={{ display: "block", width: "100%", height: "100%", objectFit: fit }}
      />
    </div>
  );
}
