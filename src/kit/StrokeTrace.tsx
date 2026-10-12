// An icon or a hand-authored mark drawing itself (ported from HyperFrames
// `svg-stroke-trace` and `whiteboard-ink`): its paths draw one after another,
// each dashed by its measured length and given time in proportion to it, while
// a small accent nib rides the ink front and hops to the next stroke. Once the
// ink is complete the nib lifts away, closed paths fill with a light accent
// tint (with `fill`), and the label fades up underneath. Drawn large and
// centered in the ink colour, at the icon set's stroke weight.

import { ICON_NAMES, isIconName } from "../icons";
import { ICON_NODES } from "../icons/nodes";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { entering, useSceneTime } from "./frameContext";
import { arrive, exitOpacity, fade, tween } from "./motion";
import { isClosedPath, pathPointAt, shapePath, tracePath, type PathTrace, type Point } from "./pathLength";
import type { KitProps } from "./types";

export interface StrokeTraceProps extends KitProps {
  /** A name from the icon set (`ICON_NAMES`). Give this or `paths`, not both. */
  icon?: string;
  /** SVG path data in a 24x24 viewBox, 1-12 paths, drawn in order. Give this or `icon`, not both. */
  paths?: string[];
  /** A short line that fades in under the drawing once it is complete. */
  label?: string;
  /** Fill closed paths (ending in `Z`) with a light accent tint after drawing. Default false. */
  fill?: boolean;
  /** Show the pen nib riding the ink front. Default true. */
  nib?: boolean;
}

export const STROKE_TRACE_MAX_PATHS = 12;

/** The drawing takes this long, first stroke to last (the source's draw phase, tightened). */
const DRAW_MS = 1400;
/** Every stroke gets at least this long, however short it is. */
const MIN_STROKE_MS = 110;
/** The nib hops between strokes in this long. */
const HOP_MS = 60;
/** The drawing's side, as a share of the area's short side. */
const SIZE_SHARE = 0.4;
/** Stroke width in the 24-unit viewBox: the icon set's own. */
const STROKE_UNITS = 2;
/** The nib's radius in viewBox units: a dot a little wider than the ink. */
const NIB_UNITS = 1.4;
/** How high the nib arcs on a hop, and lifts as it leaves, in viewBox units. */
const LIFT_UNITS = 1;
/** The fill's tint over the accent (the source's 0.16). */
const FILL_OPACITY = 0.16;

const round = (n: number, places = 3) => Math.round(n * 10 ** places) / 10 ** places || 0;

/** What is wrong with StrokeTrace props; empty when they are fine. */
export function strokeTraceErrors(props: Record<string, unknown>): string[] {
  const { icon, paths, label, fill, nib } = props;
  const errors: string[] = [];
  if ((icon === undefined) === (paths === undefined)) errors.push("give exactly one of `icon` and `paths`");
  if (icon !== undefined && (typeof icon !== "string" || !isIconName(icon))) {
    errors.push(`unknown icon "${String(icon)}"; known icons: ${ICON_NAMES.join(", ")}`);
  }
  if (paths !== undefined) {
    if (!Array.isArray(paths) || paths.length < 1 || paths.length > STROKE_TRACE_MAX_PATHS) {
      errors.push(`\`paths\` must be 1-${STROKE_TRACE_MAX_PATHS} SVG path strings`);
    } else {
      paths.forEach((d, i) => {
        if (typeof d !== "string" || d.trim() === "") return errors.push(`paths[${i}] must be a non-empty string`);
        try {
          if (tracePath(d).length === 0) errors.push(`paths[${i}] draws nothing`);
        } catch (error) {
          errors.push(`paths[${i}]: ${(error as Error).message}`);
        }
      });
    }
  }
  if (label !== undefined && typeof label !== "string") errors.push("`label` must be a string");
  if (fill !== undefined && typeof fill !== "boolean") errors.push("`fill` must be true or false");
  if (nib !== undefined && typeof nib !== "boolean") errors.push("`nib` must be true or false");
  return errors;
}

/** The path data to draw, in order: `paths`, or the icon's shapes (circles and rects as paths). Props must be valid. */
export function strokeTracePaths({ icon, paths }: Pick<StrokeTraceProps, "icon" | "paths">): string[] {
  if (paths !== undefined) return paths;
  if (icon === undefined || !isIconName(icon)) throw new Error(`StrokeTrace: unknown icon "${icon}"`);
  return ICON_NODES[icon].map(([tag, attrs]) => (tag === "path" ? String(attrs.d) : shapePath(tag, attrs)));
}

/** When each stroke draws, in scene ms. */
export interface StrokeTraceTiming {
  paths: Array<{ startMs: number; endMs: number }>;
  /** The last stroke lands: the nib lifts, fills and the label fade in. */
  drawnMs: number;
}

/**
 * Strokes of `lengths` drawn one after another from the scene's lead, in about
 * `DRAW_MS` in all: each gets a floor plus a share in proportion to its length,
 * with a short hop between. Many strokes shrink the floors and hops together.
 */
export function strokeTraceTiming(theme: Theme, lengths: readonly number[]): StrokeTraceTiming {
  const count = lengths.length;
  const hops = Math.max(0, count - 1);
  const crowd = Math.min(1, DRAW_MS / (MIN_STROKE_MS * count + HOP_MS * hops));
  const floor = MIN_STROKE_MS * crowd;
  const hop = HOP_MS * crowd;
  const budget = Math.max(0, DRAW_MS - floor * count - hop * hops);
  const total = lengths.reduce((sum, l) => sum + l, 0);
  let cursor = theme.motion.leadMs;
  const paths = lengths.map((length) => {
    const startMs = cursor;
    const endMs = startMs + floor + budget * (total > 0 ? length / total : 1 / count);
    cursor = endMs + hop;
    return { startMs, endMs };
  });
  return { paths, drawnMs: paths.at(-1)?.endMs ?? theme.motion.leadMs };
}

export interface StrokeTraceLayout {
  /** The block: the drawing with the label under it, in frame px. */
  box: Rect;
  /** The drawing's side, in px. */
  size: number;
  gap: number;
  labelWidth: number;
}

/** The drawing about 40% of the area's short side, centered with its label; smaller when a slot is too short for both. */
export function strokeTraceLayout(theme: Theme, aspect: Aspect, label: string | undefined, slot?: Rect): StrokeTraceLayout {
  const area = slot ?? contentArea(theme, aspect);
  const labelWidth = Math.min(area.width, textColumn(theme, aspect).width);
  const gap = label === undefined ? 0 : theme.spacing.md;
  const labelHeight = label === undefined ? 0 : estimateTextHeight(label, labelWidth, theme.type.subtitle[aspect]);
  const size = Math.max(0, Math.round(Math.min(SIZE_SHARE * Math.min(area.width, area.height), area.height - gap - labelHeight)));
  const box = placeBlock(area, { width: area.width, height: size + gap + labelHeight }, blockCenterY(theme, aspect, slot));
  return { box, size, gap, labelWidth };
}

/** The sine in-out the source draws each stroke on. */
const STROKE_CURVE = "sineInOut" as const;

/** Where the nib is `ms` into the scene: on the active stroke's front, arcing over a hop, or lifting off at the end. */
function nibAt(traces: PathTrace[], timing: StrokeTraceTiming, ms: number): Point {
  const { paths } = timing;
  const ends = traces.map((t) => pathPointAt(t, t.length));
  const starts = traces.map((t) => pathPointAt(t, 0));
  for (let i = 0; i < paths.length; i++) {
    const { startMs, endMs } = paths[i]!;
    if (ms <= endMs || i === paths.length - 1) {
      if (ms < startMs && i > 0) {
        // Hopping from the last stroke's end to this one's start, arcing up.
        const prev = paths[i - 1]!.endMs;
        const t = fade({ ms: startMs - prev, curve: "expoOut" }, ms - prev);
        const a = ends[i - 1]!;
        const b = starts[i]!;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * LIFT_UNITS };
      }
      const drawn = tween({ ms: endMs - startMs, curve: STROKE_CURVE }, ms - startMs);
      return pathPointAt(traces[i]!, drawn * traces[i]!.length);
    }
  }
  return starts[0]!;
}

export function StrokeTrace(props: StrokeTraceProps) {
  const errors = strokeTraceErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`StrokeTrace: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, label, fill = false, nib = true } = props;
  const { colors, fonts, spacing, motion } = theme;
  const paths = strokeTracePaths(props);
  const traces = paths.map(tracePath);
  const timing = strokeTraceTiming(theme, traces.map((t) => t.length));
  const { box, size, gap, labelWidth } = strokeTraceLayout(theme, aspect, label, slot);
  const time = useSceneTime(progress);
  const { ms } = entering(time);
  const { move, opacity: fadeIn } = arrive(theme, ms, motion.leadMs);
  const opacity = Math.min(fadeIn, exitOpacity(theme, time, DRAW_MS));
  const rise = round((1 - move) * spacing.md, 2);
  const after = fade(motion.fx, ms - timing.drawnMs);
  const front = nibAt(traces, timing, ms);
  const lifted = { x: front.x, y: front.y - LIFT_UNITS * tween(motion.fx, ms - timing.drawnMs) };
  const labelSpec = theme.type.subtitle[aspect];

  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height, opacity }}>
      <div
        data-block="StrokeTrace"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap, transform: `translateY(${rise}px)` }}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
          {fill &&
            paths.map((d, i) =>
              isClosedPath(d) ? <path key={`f${i}`} data-stroke-trace-fill={i} d={d} fill={colors.accent} fillOpacity={round(FILL_OPACITY * after)} stroke="none" /> : null,
            )}
          {traces.map((trace, i) => {
            const { startMs, endMs } = timing.paths[i]!;
            const drawn = tween({ ms: endMs - startMs, curve: STROKE_CURVE }, ms - startMs);
            // Round the dash up, so a closed path's ends meet.
            const dash = Math.ceil(trace.length * 1000) / 1000;
            return (
              <path
                key={i}
                data-stroke-trace-path={i}
                d={paths[i]}
                fill="none"
                stroke={colors.text}
                strokeWidth={STROKE_UNITS}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${dash} ${dash}`}
                strokeDashoffset={round((1 - drawn) * dash)}
                // A round cap would show a dot where an undrawn stroke starts.
                visibility={drawn <= 0 ? "hidden" : undefined}
              />
            );
          })}
          {nib && after < 1 && (
            <circle data-stroke-trace-nib="" cx={round(lifted.x)} cy={round(lifted.y)} r={NIB_UNITS} fill={colors.accent} opacity={round(1 - after)} />
          )}
        </svg>
        {label !== undefined && (
          <p
            data-stroke-trace-label=""
            style={{
              margin: 0,
              maxWidth: labelWidth,
              fontFamily: fonts.body,
              ...typeCss(labelSpec),
              color: colors.textMuted,
              textAlign: "center",
              overflowWrap: "break-word",
              textWrap: "balance",
              opacity: round(after),
              transform: `translateY(${round((1 - tween(motion.fx, ms - timing.drawnMs)) * spacing.sm, 2)}px)`,
            }}
          >
            {label}
          </p>
        )}
      </div>
    </div>
  );
}
