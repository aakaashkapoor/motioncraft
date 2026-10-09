// A local image file. It fills its frame (or the window it sits in), covered or
// contained, around a focal point, with an optional slow Ken Burns zoom and
// pan. The readiness gate waits for it to decode before any frame is captured.

import { useVisibleRect } from "./frameContext";
import { mediaUrl } from "./mediaSource";
import type { KitProps } from "./types";
import type { MediaFit } from "./VideoClip";

export interface FocusPoint {
  /** 0 is the left edge, 1 the right. */
  x: number;
  /** 0 is the top edge, 1 the bottom. */
  y: number;
}

/** A zoom from one scale to another over the scene, or one fixed scale. */
export type KenBurnsZoom = number | { from?: number; to?: number };

/** Total drift over the scene, as fractions of the box (positive: right and down). */
export interface KenBurnsPan {
  x?: number;
  y?: number;
}

export interface KenBurnsOptions {
  zoom?: KenBurnsZoom;
  pan?: KenBurnsPan;
  /** Default the center. */
  focus?: FocusPoint;
}

export interface ImageProps extends KitProps, KenBurnsOptions {
  /** A local image file (.png, .jpg, .jpeg, .webp, .gif, .avif or .svg), relative to the storyboard. */
  src: string;
  /** Default "cover". */
  fit?: MediaFit;
  /** Describes the image for the markup. */
  alt?: string;
  shareId?: string;
}

const CENTER: FocusPoint = { x: 0.5, y: 0.5 };

export interface KenBurnsTransform {
  /** Scale about the focal point. */
  scale: number;
  /** Translation after scaling, as fractions of the box. */
  x: number;
  y: number;
}

/** Linear: Ken Burns is a slow, steady drift. */
function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Clamps a translation so the scaled image still covers the box on both sides. */
function clampShift(shift: number, scale: number, focus: number): number {
  const slack = Math.max(0, scale - 1);
  return Math.min(focus * slack, Math.max(-(1 - focus) * slack, shift));
}

/**
 * The Ken Burns transform at `progress`. The zoom runs from `from` to `to`; the
 * pan drifts from -pan/2 to +pan/2. Panning enlarges the image by the largest
 * drift so no edge of it ever shows. Pure.
 */
export function kenBurns(progress: number, { zoom, pan, focus = CENTER }: KenBurnsOptions): KenBurnsTransform {
  const p = Math.min(1, Math.max(0, progress));
  const { from = 1, to = from } = typeof zoom === "number" ? { from: zoom, to: zoom } : (zoom ?? {});
  const panX = pan?.x ?? 0;
  const panY = pan?.y ?? 0;
  const scale = lerp(from, to, p) * (1 + Math.max(Math.abs(panX), Math.abs(panY)));
  const x = clampShift(panX * (p - 0.5), scale, focus.x);
  const y = clampShift(panY * (p - 0.5), scale, focus.y);
  // Normalize -0 so the markup reads "0%".
  return { scale, x: x + 0, y: y + 0 };
}

const percent = (fraction: number) => `${Math.round(fraction * 1e6) / 1e4}%`;

export function Image({ progress, aspect, src, fit = "cover", focus = CENTER, zoom, pan, alt = "", shareId }: ImageProps) {
  const rect = useVisibleRect(aspect);
  const { scale, x, y } = kenBurns(progress, { zoom, pan, focus });
  const position = `${percent(focus.x)} ${percent(focus.y)}`;

  return (
    <div
      data-media="image"
      {...(shareId === undefined ? {} : { "data-share-id": shareId })}
      style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.width, height: rect.height, overflow: "hidden" }}
    >
      <div
        data-ken-burns=""
        style={{
          width: "100%",
          height: "100%",
          transform: `translate(${percent(x)}, ${percent(y)}) scale(${Math.round(scale * 1e6) / 1e6})`,
          transformOrigin: position,
        }}
      >
        <img
          data-media-element=""
          src={mediaUrl(src)}
          alt={alt}
          style={{ display: "block", width: "100%", height: "100%", objectFit: fit, objectPosition: position }}
        />
      </div>
    </div>
  );
}
