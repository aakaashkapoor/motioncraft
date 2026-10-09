// The ground behind every frame, in the theme's ground style: solid, vignette
// (a soft radial gradient), grid (a faint dot grid that breathes), noise
// (seeded grain) or mesh (soft accent blobs drifting, design v3 life #5), with
// optional film grain over any of them. The frame itself is painted
// `colors.ground`; this layer draws the style on top with a transparent
// background, so contrast checks still see the ground, and the mesh names the
// most tinted ground it can show (`groundTint`) for them. Moving styles are
// drawn at `ms` into the video, so the same frame always looks the same.

import type { CSSProperties } from "react";
import { GROUND_TINT_ATTRIBUTE } from "../checks/measure";
import { frameSize } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import { mixColors, withAlpha } from "../theme/color";
import { groundTint, MESH_STOPS, meshFalloff } from "../theme/mesh";
import type { Theme } from "../theme/types";
import { grainSeed, gridBreath, meshBlobs, type MeshBlob } from "./groundMotion";

export interface GroundProps {
  theme: Theme;
  aspect: Aspect;
  /** Milliseconds into the video, for the styles that move. Default 0. */
  ms?: number;
}

/** Dot diameter of the grid, in px. */
const GRID_DOT = 4;
/** Opacity of the grain over the ground. */
const NOISE_OPACITY = 0.07;
/** How much the grain's contrast is raised around mid grey. */
const GRAIN_CONTRAST = 3;
/**
 * Film grain as grey from the noise's luminance (Rec. 709 weights), its
 * contrast raised around mid grey, fully opaque. Blended with `overlay`, mid
 * grey leaves the ground as it is, so the grain moves the tone of no part of
 * the frame on average.
 */
const GRAIN_MATRIX = (() => {
  const grey = [...[0.2126, 0.7152, 0.0722].map((w) => w * GRAIN_CONTRAST), 0, 0.5 - 0.5 * GRAIN_CONTRAST];
  return [grey, grey, grey, [0, 0, 0, 0, 1]].flat().join(" ");
})();

/** The CSS that draws the theme's ground pattern (empty for styles drawn otherwise). Pure. */
export function groundStyle(theme: Theme): CSSProperties {
  const { colors, spacing } = theme;
  switch (theme.ground.style) {
    case "vignette": {
      const center = mixColors(colors.ground, colors.surface, 0.6);
      const edge = mixColors(colors.ground, colors.shadow, 0.08);
      return { backgroundImage: `radial-gradient(ellipse 120% 90% at 50% 40%, ${center} 0%, ${colors.ground} 55%, ${edge} 100%)` };
    }
    case "grid": {
      const step = spacing.lg;
      const r = GRID_DOT / 2;
      return {
        backgroundImage: `radial-gradient(circle at center, ${withAlpha(colors.text, 0.1)} ${r}px, transparent ${r + 0.5}px)`,
        backgroundSize: `${step}px ${step}px`,
        backgroundPosition: "center",
      };
    }
    case "solid":
    case "noise":
    case "mesh":
      return {};
  }
}

/** A blob as a radial gradient: full strength at the center, easing out to nothing at the rim, like a blurred disc (see `meshFalloff`). */
function blobGradient({ color, alpha }: MeshBlob): string {
  const stops = MESH_STOPS.map((r) => `${withAlpha(color, Math.round(alpha * meshFalloff(r) * 10_000) / 10_000)} ${r * 100}%`);
  return `radial-gradient(circle closest-side, ${stops.join(", ")})`;
}

/**
 * Draws the ground at `ms`. The layer itself must not form a stacking context
 * (no opacity, transform or filter on it), so the grain blends with the
 * frame's ground colour beneath it.
 */
export function Ground({ theme, aspect, ms = 0 }: GroundProps) {
  const { width, height } = frameSize(aspect);
  const { style, seed, grain } = theme.ground;
  const layer: CSSProperties = { position: "absolute", left: 0, top: 0, width, height };
  const tint = groundTint(theme, aspect);
  const breath = style === "grid" ? gridBreath(theme, ms) : undefined;
  const noiseId = `motioncraft-ground-noise-${seed}`;
  const grainId = `motioncraft-ground-grain-${seed}`;
  return (
    <div data-ground={style} {...(tint === undefined ? {} : { [GROUND_TINT_ATTRIBUTE]: tint })} style={{ ...layer, pointerEvents: "none" }}>
      {(style === "vignette" || style === "grid") && (
        <div style={{ ...layer, ...groundStyle(theme), ...(breath && { transform: `scale(${breath.scale})`, opacity: breath.opacity }) }} />
      )}
      {style === "mesh" &&
        meshBlobs(theme, aspect, ms).map((blob, i) => (
          <div
            key={i}
            data-mesh-blob=""
            style={{ position: "absolute", left: blob.x - blob.size / 2, top: blob.y - blob.size / 2, width: blob.size, height: blob.size, backgroundImage: blobGradient(blob) }}
          />
        ))}
      {style === "noise" && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", left: 0, top: 0 }}>
          <filter id={noiseId} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} seed={seed} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width={width} height={height} filter={`url(#${noiseId})`} opacity={NOISE_OPACITY} />
        </svg>
      )}
      {grain > 0 && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", left: 0, top: 0, mixBlendMode: "overlay" }}>
          <filter id={grainId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} seed={grainSeed(theme, ms)} stitchTiles="stitch" />
            <feColorMatrix type="matrix" values={GRAIN_MATRIX} />
          </filter>
          <rect width={width} height={height} filter={`url(#${grainId})`} opacity={grain} />
        </svg>
      )}
    </div>
  );
}
