// The ground behind every frame, in the theme's ground style: solid, vignette
// (a soft radial gradient), grid (a faint dot grid) or noise (seeded grain).
// The frame itself is painted `colors.ground`; this layer draws the style on
// top with a transparent background, so contrast checks still see the ground.

import type { CSSProperties } from "react";
import { frameSize } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import { mixColors, withAlpha } from "../theme/color";
import type { Theme } from "../theme/types";

export interface GroundProps {
  theme: Theme;
  aspect: Aspect;
}

/** Dot diameter of the grid, in px. */
const GRID_DOT = 4;
/** Opacity of the grain over the ground. */
const NOISE_OPACITY = 0.07;

/** The CSS that draws the theme's ground style (empty for `solid`). Pure. */
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
      return {};
  }
}

export function Ground({ theme, aspect }: GroundProps) {
  const { width, height } = frameSize(aspect);
  const { style, seed } = theme.ground;
  const filterId = `motioncraft-ground-noise-${seed}`;
  return (
    <div
      data-ground={style}
      style={{ position: "absolute", left: 0, top: 0, width, height, pointerEvents: "none", ...groundStyle(theme) }}
    >
      {style === "noise" && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", left: 0, top: 0 }}>
          <filter id={filterId} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} seed={seed} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width={width} height={height} filter={`url(#${filterId})`} opacity={NOISE_OPACITY} />
        </svg>
      )}
    </div>
  );
}
