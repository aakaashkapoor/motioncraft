// A connector that draws itself: a straight or curved line from one point or
// anchored element to another, revealed with `drawPath` in a `mark` sweep from
// the scene's lead. The arrowhead appears as the line completes; an optional
// label sits at the curve's midpoint. Once drawn, an accent dot flows along it
// every 1.4 s (`flow`, design v3 life #11), so the arrow keeps moving through
// the hold. The whole arrow exits fast at the end of the scene.
// Points are always frame px. Standalone, the arrow's box is the whole frame;
// given an `area` (a Section slot), its box is the slot and anchored ends are
// kept inside it.

import { createContext, useContext } from "react";
import { drawPath } from "../engine/choreography";
import { frameSize, type Rect } from "../layout/frame";
import { typeCss } from "../layout/type";
import type { ColorRole, Theme } from "../theme/types";
import { arrowGeometry, pointAlong, resolveArrowEnds, type AnchorBoxes, type ArrowEnd, type Point } from "./arrowGeometry";
import { FlowDotMark, flowDot } from "./flow";
import { useSceneTime } from "./frameContext";
import { exitOpacity, fade, tween } from "./motion";
import type { KitProps } from "./types";

export { ARROW_SIDES, anchorPoint, arrowGeometry, pointAlong, resolveArrowEnds } from "./arrowGeometry";
export type { AnchorBoxes, ArrowAnchor, ArrowEnd, ArrowGeometry, ArrowSide, Point } from "./arrowGeometry";

export interface ArrowProps extends KitProps {
  from: ArrowEnd;
  to: ArrowEnd;
  /** 0 is straight; positive bends left of travel, negative right (see `arrowGeometry`). Default 0. */
  curve?: number;
  /**
   * When the line draws, as [start, end] fractions of the scene (v2
   * storyboards). Default: a `mark` sweep from the scene's lead.
   */
  window?: readonly [number, number];
  /** Stroke color, by theme role. Default "accent". */
  color?: ColorRole;
  /** A short label at the midpoint. */
  label?: string;
  /** Anchor boxes by `shareId`, over any the scene provides (see `AnchorProvider`). */
  anchors?: AnchorBoxes;
}

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

/**
 * Where the arrow is `elapsedMs` after it starts drawing, over `durationMs`
 * (the `mark` sweep by default): the line sweeps in on `mark`'s curve, the
 * head fades in (`fx.fast`) as it completes, the label (`fx`) from halfway.
 */
export function arrowTiming(theme: Theme, elapsedMs: number, durationMs = theme.motion.mark.ms): ArrowTiming {
  const fast = theme.motion["fx.fast"];
  return {
    drawn: tween({ ms: durationMs, curve: theme.motion.mark.curve }, elapsedMs),
    head: fade(fast, elapsedMs - (durationMs - fast.ms)),
    label: fade(theme.motion.fx, elapsedMs - durationMs / 2),
  };
}

/** A v2 `window` ([start, end] fractions of the scene) as a start and a duration in ms. */
function windowMs(window: readonly [number, number], endMs: number): [number, number] {
  const [start, end] = window;
  if (!(Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end <= 1 && start < end)) {
    throw new Error(`Arrow: window must be [start, end] with 0 <= start < end <= 1, got ${JSON.stringify(window)}`);
  }
  return [start * endMs, (end - start) * endMs];
}

const round = (n: number) => Math.round(n * 100) / 100;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** `point`, moved into `box` if it lies outside. */
function clampInto(point: Point, box: Rect): Point {
  return { x: clamp(point.x, box.x, box.x + box.width), y: clamp(point.y, box.y, box.y + box.height) };
}

const isAnchored = (end: ArrowEnd) => typeof (end as { anchor?: unknown }).anchor === "string";

export function Arrow({ progress, theme, aspect, area, from, to, curve = 0, window, color = "accent", label, anchors }: ArrowProps) {
  const sceneAnchors = useContext(SceneAnchors);
  if (!COLOR_ROLES.includes(color)) throw new Error(`Arrow: color must be a theme color role (${COLOR_ROLES.join(", ")}), got "${color}"`);
  const { colors, spacing, fonts, radius, hairline } = theme;
  const time = useSceneTime(progress);
  const { width, height } = frameSize(aspect);
  const box = area ?? { x: 0, y: 0, width, height };

  const stroke = spacing.xxs;
  const headSize = spacing.md * 0.75;
  const ends = resolveArrowEnds(from, to, { ...sceneAnchors, ...anchors }, spacing.xs);
  const start = isAnchored(from) ? clampInto(ends.start, box) : ends.start;
  const end = isAnchored(to) ? clampInto(ends.end, box) : ends.end;
  const geometry = arrowGeometry(start, end, curve, headSize);
  const [startMs, durationMs] = window === undefined ? [theme.motion.leadMs, theme.motion.mark.ms] : windowMs(window, time.endMs);
  const timing = arrowTiming(theme, time.ms - startMs, durationMs);
  const dash = drawPath(timing.drawn, round(geometry.length));
  const dot = flowDot(theme, time.ms - startMs - durationMs);
  const opacity = exitOpacity(theme, time, durationMs);
  const strokeColor = colors[color];

  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height, opacity, pointerEvents: "none" }}>
      {/* The drawing spans the whole frame, offset back to its origin, so points stay in frame px. */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", left: -box.x, top: -box.y, overflow: "visible" }}
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
        {dot !== undefined && <FlowDotMark theme={theme} at={pointAlong(geometry, dot.along)} opacity={dot.opacity} />}
      </svg>
      {label !== undefined && (
        <div
          data-arrow-label=""
          style={{
            position: "absolute",
            left: round(geometry.mid.x - box.x),
            top: round(geometry.mid.y - box.y),
            transform: "translate(-50%, -50%)",
            opacity: round(timing.label),
            padding: `${spacing.xxs}px ${spacing.xs}px`,
            backgroundColor: colors.surface,
            border: `${hairline}px solid ${colors.border}`,
            borderRadius: radius.pill,
            fontFamily: fonts.body,
            ...typeCss(theme.type.label[aspect]),
            fontWeight: theme.weights.semibold,
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
