// The media components and their pure helpers, re-exported together.

export { VideoClip, type MediaFit, type VideoClipProps } from "./VideoClip";
export { Image, kenBurns, type FocusPoint, type ImageProps, type KenBurnsOptions, type KenBurnsPan, type KenBurnsTransform, type KenBurnsZoom } from "./Image";
export { clipMediaTime, mediaUrl, MEDIA_URL_PREFIX, SEEK_NUDGE_MS, type ClipTiming } from "./mediaSource";

/** Media fill whatever part of their frame is visible (see `useVisibleRect`) instead of laying out in an area. */
export const FULL_BLEED_COMPONENTS: ReadonlySet<string> = new Set(["Image", "VideoClip"]);
