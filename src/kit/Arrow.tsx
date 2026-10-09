// A connector that draws itself: a straight or curved line from one point or
// anchored element to another, revealed with `drawPath` over its window of the
// scene. The arrowhead appears as the line completes; an optional label sits
// at the curve's midpoint. The whole arrow fades out at the end of the scene.

import { createContext, useContext } from "react";
import { drawPath } from "../engine/choreography";
import { interpolate, type Easing } from "../engine/easing";
import { frameSize } from "../layout/frame";
import { fontSize } from "../layout/type";
import type { ColorRole } from "../theme/types";
import { arrowGeometry, resolveArrowEnds, type AnchorBoxes, type ArrowEnd } from "./arrowGeometry";
import { themeEasing } from "./motion";
import type { KitProps } from "./types";

export { ARROW_SIDES, anchorPoint, arrowGeometry, resolveArrowEnds } from "./arrowGeometry";
export type { AnchorBoxes, ArrowAnchor, ArrowEnd, ArrowGeometry, ArrowSide, Point } from "./arrowGeometry";

export interface ArrowProps extends KitProps {
  from: ArrowEnd;
  to: ArrowEnd;
  /** 0 is straight; positive bends left of travel, negative right (see `arrowGeometry`). Default 0. */
  curve?: number;
  /** When the line draws, as [start, end] fractions of the scene. Default [0.1, 0.4]. */
  window?: readonly [number, number];
  /** Stroke color, by theme role. Default "accent". */
  color?: ColorRole;
  /** A short label at the midpoint. */
  label?: string;
  /** Anchor boxes by `shareId`, over any the scene provides (see `AnchorProvider`). */
  anchors?: AnchorBoxes;
}

const DEFAULT_WINDOW: readonly [number, number] = [0.1, 0.4];
const EXIT = 0.1;
// Fractions of the window, in time (not eased): the head fades in over its
// last part, the label from about halfway.
const HEAD_FROM = 0.85;
const LABEL_FROM = 0.4;
const LABEL_TO = 0.7;
const COLOR_ROLES: readonly ColorRole[] = ["ground", "surface", "surfaceAlt", "text", "textMuted", "textSubtle", "accent", "accentText", "border", "shadow"];

const SceneAnchors = createContext<AnchorBoxes>({});

/** Gives arrows in a scene the boxes (frame px, by `shareId`) of its anchorable elements. */
export const AnchorProvider = SceneAnchors.Provider;

export interface ArrowTiming {
  /** How much of the line is drawn, 0..1, eased. */
  drawn: number;
  /** Opacity of the head, 0 until the line is nearly complete. */
  head: number;
  /** Opacity of the label. */
  label: number;
}

/** Where the arrow is at scene `progress`, drawing over `window`. */
export function arrowTiming(progress: number, window: readonly [number, number], easing: Easing): ArrowTiming {
  const [start, end] = window;
  if (!(Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end <= 1 && start < end)) {
    throw new Error(`Arrow: window must be [start, end] with 0 <= start < end <= 1, got ${JSON.stringify(window)}`);
  }
  const t = interpolate(progress, [start, end], [0, 1]);
  return {
    drawn: easing(t),
    head: interpolate(t, [HEAD_FROM, 1], [0, 1]),
    label: interpolate(t, [LABEL_FROM, LABEL_TO], [0, 1]),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

export function Arrow({ progress, theme, aspect, from, to, curve = 0, window = DEFAULT_WINDOW, color = "accent", label, anchors }: ArrowProps) {
  const sceneAnchors = useContext(SceneAnchors);
  if (!COLOR_ROLES.includes(color)) throw new Error(`Arrow: color must be a theme color role (${COLOR_ROLES.join(", ")}), got "${color}"`);
  const { colors, spacing, fonts, radius, hairline } = theme;
  const easing = themeEasing(theme);
  const { width, height } = frameSize(aspect);

  const stroke = spacing.xs;
  const headSize = spacing.md * 0.75;
  const { start, end } = resolveArrowEnds(from, to, { ...sceneAnchors, ...anchors }, spacing.sm);
  const geometry = arrowGeometry(start, end, curve, headSize);
  const timing = arrowTiming(progress, window, easing);
  const dash = drawPath(timing.drawn, round(geometry.length));
  const opacity = interpolate(progress, [1 - EXIT, 1], [1, 0], { easing });
  const strokeColor = colors[color];

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height, opacity, pointerEvents: "none" }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
      >
        <g data-key-element="arrow" fill="none" stroke={strokeColor} strokeWidth={stroke} strokeLinejoin="round">
          <path
            data-arrow-line=""
            d={geometry.d}
            // A butt cap, so a line not yet drawn leaves no dot behind.
            strokeLinecap="butt"
            strokeDasharray={dash.strokeDasharray}
            strokeDashoffset={round(dash.strokeDashoffset)}
          />
          <polyline
            data-arrow-head=""
            points={geometry.head.map((p) => `${round(p.x)},${round(p.y)}`).join(" ")}
            strokeLinecap="round"
            opacity={round(timing.head)}
          />
        </g>
      </svg>
      {label !== undefined && (
        <div
          data-arrow-label=""
          style={{
            position: "absolute",
            left: round(geometry.mid.x),
            top: round(geometry.mid.y),
            transform: "translate(-50%, -50%)",
            opacity: round(timing.label),
            padding: `${spacing.xs}px ${spacing.sm}px`,
            backgroundColor: colors.surface,
            border: `${hairline}px solid ${colors.border}`,
            borderRadius: radius.pill,
            fontFamily: fonts.body,
            fontSize: fontSize(theme, "caption", aspect),
            fontWeight: 600,
            lineHeight: 1.2,
            color: colors.text,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
