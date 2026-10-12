// A line chart (ported from HyperFrames `chart-story`, line mode): one series
// of points, evenly spaced along a baseline, that a line draws through left to
// right over about 1.2 s, the area under it following the front. Each point
// pops as the line reaches it; the emphasized one is in the accent and gets a
// value callout once the line has passed it. The last point shows its value;
// category labels sit under the baseline. "Signups peaked in April".

import { contentArea, textColumn } from "../layout/caption";
import { isTall, type Rect } from "../layout/frame";
import { blockCenterY, placeBlock } from "../layout/block";
import { safeZones } from "../layout/safe";
import { AVG_CHAR_EM } from "../layout/textFit";
import { TYPE_FIT_ATTRIBUTE, glyphPad, textBoxHeight, typeCss } from "../layout/type";
import { easeInOutCubic } from "../engine/easing";
import { withAlpha } from "../theme/color";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeSpec } from "../theme/types";
import { chartErrors, emphasisIndex, formatChartValue, niceMax, type ChartDatum, type ChartValueFormat } from "./chart";
import { entering, useSceneTime } from "./frameContext";
import { arrive, cascadeStep, exitOpacity, fade, tween } from "./motion";
import type { KitProps } from "./types";

export interface LineChartProps extends KitProps, ChartValueFormat {
  /** A title above the chart. */
  title?: string;
  /** 2-12 points, left to right. The one with `emphasis` (else the largest) takes the accent and the callout. */
  data: ChartDatum[];
  /**
   * Fill the area under the line (the ink at a low alpha). Default true. Not
   * `area`: every kit component's `area` is its layout slot (`KitProps`).
   */
  areaFill?: boolean;
  /** The value at the top of the plot. Default: `niceMax` of the largest value. */
  max?: number;
}

/** How long the line takes to draw, in ms; it starts on the theme's lead (150 ms). */
const DRAW_MS = 1200;
/** How long the baseline takes to draw, in ms (the source's axis draw). */
const AXIS_MS = 500;
/** When the category labels start in, in ms. */
const LABELS_AT_MS = 300;
/** How long after the line reaches a point its value (callout or label) starts in, in ms. */
const VALUE_DELAY_MS = 100;
/** The callout starts at this share of its size and pops to full. */
const CALLOUT_FROM_SCALE = 0.6;
/** The area under the line: the ink at this opacity. */
const AREA_ALPHA = 0.08;
/** Point radius, line width and emphasized point radius, as shares of the label size (the source's 7, 6 and 11 px on 26 px labels). */
const DOT_SHARE = 0.28;
const STROKE_SHARE = 0.22;
const EMPHASIS_DOT_SHARE = 0.42;
/** The plot's height at most this share of its width in 9:16, so a tall slot does not stretch the line. */
const TALL_PLOT_SHARE = 1;
/**
 * In tall aspects the outer category labels may sit up to this share of the
 * widest label's width inward of their points, so the plot can run wider than
 * the text column while the labels stay inside it.
 */
const TALL_LABEL_SHIFT = 0.15;

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places || 0;

/** Estimated one-line width of `text` in `spec`, in px. */
const textWidth = (text: string, spec: TypeSpec) => Math.ceil(text.length * (AVG_CHAR_EM + spec.tracking) * spec.size);
const lineHeight = (spec: TypeSpec) => Math.ceil(spec.size * spec.lineHeight);

/** What is wrong with LineChart props; empty when they are fine. */
export function lineChartErrors(props: Record<string, unknown>): string[] {
  const { data, title, areaFill, max } = props;
  const errors = chartErrors(data);
  if (Array.isArray(data) && data.length < 2) errors.push(`a line takes at least 2 points, got ${data.length}`);
  if (title !== undefined && typeof title !== "string") errors.push("`title` must be a string");
  if (areaFill !== undefined && typeof areaFill !== "boolean") errors.push("`areaFill` must be a boolean");
  if (max !== undefined) {
    if (typeof max !== "number" || !Number.isFinite(max) || max <= 0) errors.push("`max` must be a number above 0");
    else if (errors.length === 0 && (data as ChartDatum[]).some((d) => d.value > max)) errors.push(`\`max\` (${max}) must be at least the largest value`);
  }
  return errors;
}

export interface LineChartLayout {
  /** The whole block, in frame px. */
  box: Rect;
  /** The title's box, inside `box`; height 0 without a title. */
  title: Rect;
  titleSpec: TypeSpec;
  /**
   * The chart under the title, in x inside `box`. In 16:9 the text column; in
   * tall aspects (9:16, 4:5) the primary width, the line and area running a
   * little wider than the text.
   */
  chart: { x: number; width: number };
  /** Where labels and values stay, in x inside `box`: clear of the 9:16 right rail. */
  text: { x: number; width: number };
  /** Whether each category label is a box its text's width, kept inside `text` (tall aspects), rather than a box the points' pitch wide. */
  clampLabels: boolean;
  /** The plot, inside `box`: its bottom edge is the baseline, its top the value `max`. */
  plot: Rect;
  max: number;
  /** The baseline's ends in x, inside `box`. */
  axis: { x0: number; x1: number };
  /** Category labels: their top, spec, and whether they were shrunk below the label step to fit. */
  labelTop: number;
  labelSpec: TypeSpec;
  labelFitted: boolean;
  /** The last point's value label and the callout's text. */
  valueSpec: TypeSpec;
  calloutSpec: TypeSpec;
  calloutPad: { x: number; y: number };
  dot: number;
  emphasisDot: number;
  stroke: number;
  gap: number;
}

type LayoutInput = Pick<LineChartProps, "title" | "data" | "max" | "prefix" | "suffix" | "decimals">;

/** Where the title, plot and labels go: the plot fills the area under the title, with headroom for the callout. */
export function lineChartLayout(theme: Theme, aspect: Aspect, input: LayoutInput, slot?: Rect): LineChartLayout {
  const { spacing } = theme;
  const area = slot ?? contentArea(theme, aspect);
  const format = { prefix: input.prefix, suffix: input.suffix, decimals: input.decimals };
  const { data } = input;
  const n = data.length;
  const max = input.max ?? niceMax(Math.max(...data.map((d) => d.value)));

  const titleSpec = theme.type.title[aspect];
  const titleWidth = input.title ? Math.min(area.width, textWidth(input.title, titleSpec)) : 0;
  const titleHeight = input.title ? textBoxHeight(input.title, titleWidth, titleSpec) : 0;
  const titleGap = input.title ? spacing.md : 0;

  const tall = isTall(aspect);
  const baseLabel = theme.type.label[aspect];
  const valueSpec = { ...baseLabel };
  const calloutSpec = theme.type.body[aspect];
  const dot = Math.max(3, Math.round(baseLabel.size * DOT_SHARE));
  const emphasisDot = Math.max(dot + 2, Math.round(baseLabel.size * EMPHASIS_DOT_SHARE));
  const stroke = Math.max(2, Math.round(baseLabel.size * STROKE_SHARE));
  const gap = spacing.xs;
  const calloutPad = { x: spacing.sm, y: Math.round(spacing.xs / 2) };

  const lastValue = formatChartValue(data[n - 1]!.value, format);
  const calloutHeight = lineHeight(calloutSpec) + 2 * calloutPad.y;
  // Above the highest possible point: the callout, or the last point's value.
  const headroom = Math.max(calloutHeight + gap + emphasisDot, lineHeight(valueSpec) + gap + dot);

  // Labels and values run the full width, so they keep to the text column (clear of the 9:16 right rail).
  // The title sits above the rail, so it may be wider; the chart centers under it.
  const column = textColumn(theme, aspect).width;
  // In tall aspects the line and its area take the primary width (not text, so the rail does not limit them).
  const chartWidth = tall ? Math.min(area.width, Math.max(column, safeZones(aspect, theme.safe).primaryWidth)) : Math.min(area.width, column);
  const textSpan = Math.min(chartWidth, column);
  const margin = (chartWidth - textSpan) / 2;
  const width = Math.min(area.width, Math.max(chartWidth, titleWidth));
  const left = round((width - chartWidth) / 2);
  const widest = (spec: TypeSpec) => Math.max(...data.map((d) => textWidth(d.label, spec)));
  const lastWidth = textWidth(lastValue, valueSpec);
  // How far the outer points sit in from the chart's edges.
  const insetFor = (spec: TypeSpec) =>
    tall
      ? // The outer labels shift inward up to a share of their width to stay in the text column; the last value is kept inside it.
        Math.ceil(Math.max(margin + widest(spec) * (0.5 - TALL_LABEL_SHIFT), emphasisDot + stroke))
      : // Labels are centered under their points; the points are inset so the outer labels and the last value stay inside.
        Math.ceil(Math.max(widest(spec) / 2, lastWidth / 2, emphasisDot + stroke));
  const pitchFor = (spec: TypeSpec) => Math.max(1, chartWidth - 2 * insetFor(spec)) / (n - 1);
  // How much of the widest label's width a pair of neighbours may lose to the
  // outer labels' inward shift (tall aspects): one shifted label per pair, or
  // both when there are only two points.
  const shift = tall ? TALL_LABEL_SHIFT * (n === 2 ? 2 : 1) : 0;
  // The room a set of labels `w` wide at most needs between points: their width plus the shift.
  const needs = (w: number) => w * (1 + shift);
  // Tall aspects set the labels at the body step when they fit between the points, else the label step.
  const body = theme.type.body[aspect];
  const stepSpec = tall && needs(widest(body)) <= pitchFor(body) - spacing.xs ? body : baseLabel;
  const inset = insetFor(stepSpec);
  const spanX = Math.max(1, chartWidth - 2 * inset);
  const pitch = spanX / (n - 1);
  const labelRoom = pitch - spacing.xs;
  const widestLabel = widest(stepSpec);
  const labelFitted = needs(widestLabel) > labelRoom;
  const labelSpec = labelFitted ? { ...stepSpec, size: Math.max(1, Math.floor(stepSpec.size * (labelRoom / needs(widestLabel)))) } : stepSpec;
  const below = spacing.sm + lineHeight(labelSpec);

  const room = area.height - titleHeight - titleGap - headroom - below;
  const plotHeight = Math.max(0, Math.floor(isTall(aspect) ? Math.min(room, chartWidth * TALL_PLOT_SHARE) : room));
  const height = titleHeight + titleGap + headroom + plotHeight + below;
  const box = placeBlock(area, { width, height }, blockCenterY(theme, aspect, slot));
  const plotTop = titleHeight + titleGap + headroom;

  return {
    box,
    title: { x: 0, y: 0, width, height: titleHeight },
    titleSpec,
    chart: { x: left, width: chartWidth },
    text: { x: round(left + margin), width: textSpan },
    clampLabels: tall,
    plot: { x: left + inset, y: plotTop, width: round(spanX), height: plotHeight },
    max,
    axis: { x0: left + Math.max(0, inset - emphasisDot - stroke), x1: left + Math.min(chartWidth, inset + spanX + emphasisDot + stroke) },
    labelTop: plotTop + plotHeight + spacing.sm,
    labelSpec,
    labelFitted,
    valueSpec,
    calloutSpec,
    calloutPad,
    dot,
    emphasisDot,
    stroke,
    gap,
  };
}

export interface LinePoint {
  x: number;
  y: number;
  /** The line's length from the first point to this one. */
  along: number;
}

/** Each point in box px, evenly spaced in x and at value/max of the plot's height, with its length along the line. */
export function lineChartPoints(layout: Pick<LineChartLayout, "plot" | "max">, data: ChartDatum[]): LinePoint[] {
  const { plot, max } = layout;
  const n = data.length;
  let along = 0;
  return data.map((d, i) => {
    const x = round(plot.x + (plot.width * i) / (n - 1));
    const y = round(plot.y + plot.height * (1 - d.value / max));
    if (i > 0) {
      const prev = data[i - 1]!;
      along += Math.hypot(plot.width / (n - 1), (plot.height * (d.value - prev.value)) / max);
    }
    return { x, y, along };
  });
}

/** The share of the line drawn `elapsedMs` into the draw: ease-in-out (the source's power2.inOut). */
export function lineDrawn(elapsedMs: number): number {
  return elapsedMs <= 0 ? 0 : elapsedMs >= DRAW_MS ? 1 : easeInOutCubic(elapsedMs / DRAW_MS);
}

/** The ms into the draw at which `share` of the line is drawn: `lineDrawn` inverted. */
export function lineReachMs(share: number): number {
  if (share <= 0) return 0;
  if (share >= 1) return DRAW_MS;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (easeInOutCubic(mid) < share) lo = mid;
    else hi = mid;
  }
  return round(hi * DRAW_MS, 3);
}

/** The point `length` along the line. */
function pointAlong(points: LinePoint[], length: number): { x: number; y: number } {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (length <= b.along) {
      const k = b.along === a.along ? 1 : (length - a.along) / (b.along - a.along);
      return { x: round(a.x + (b.x - a.x) * k), y: round(a.y + (b.y - a.y) * k) };
    }
  }
  return points.at(-1)!;
}

/** The area under the line up to `length` along it, down to `base`: empty before the line starts. */
export function lineAreaPath(points: LinePoint[], length: number, base: number): string {
  if (length <= 0) return "";
  const front = pointAlong(points, length);
  const drawn = points.filter((p) => p.along < length);
  const top = [...drawn, front].map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  return `${top} L ${front.x} ${base} L ${points[0]!.x} ${base} Z`;
}

/** A value's text and its box, inside the chart's box. */
export interface LineValueBox extends Rect {
  text: string;
}

/**
 * Each category label's box in x, inside the chart's box: the points' pitch
 * wide and centered on its point, or in tall aspects its text's width, centered
 * on its point but kept inside the text column (the outer ones shift inward a little).
 */
export function lineChartLabels(layout: Pick<LineChartLayout, "plot" | "text" | "clampLabels" | "labelSpec">, points: LinePoint[], data: ChartDatum[]): Array<{ x: number; width: number }> {
  const pitch = layout.plot.width / (data.length - 1);
  const { text } = layout;
  return data.map((d, i) => {
    const at = points[i]!.x;
    if (!layout.clampLabels) return { x: round(at - pitch / 2), width: round(pitch) };
    const width = textWidth(d.label, layout.labelSpec);
    return { x: round(Math.min(Math.max(at - width / 2, text.x), text.x + text.width - width)), width };
  });
}

const overlap = (a: Rect, b: Rect, margin: number) =>
  a.x < b.x + b.width + margin && b.x < a.x + a.width + margin && a.y < b.y + b.height + margin && b.y < a.y + a.height + margin;

/**
 * Where the values go: the emphasized one in a callout above its point, and
 * the last one above its point, or below it when that would touch the callout
 * (none when below has no room above the baseline, or the last point is the
 * emphasized one).
 */
export function lineChartValues(layout: LineChartLayout, points: LinePoint[], data: ChartDatum[], format: ChartValueFormat): { callout: LineValueBox; lastValue?: LineValueBox } {
  const { text: span, gap, calloutPad, calloutSpec, valueSpec, emphasisDot, dot } = layout;
  const emphasized = emphasisIndex(data);
  const anchor = points[emphasized]!;
  const calloutText = formatChartValue(data[emphasized]!.value, format);
  const width = textWidth(calloutText, calloutSpec) + 2 * calloutPad.x;
  const height = lineHeight(calloutSpec) + 2 * calloutPad.y;
  const callout = {
    text: calloutText,
    x: round(Math.min(Math.max(anchor.x - width / 2, span.x), span.x + span.width - width)),
    y: round(anchor.y - emphasisDot - gap - height),
    width,
    height,
  };
  const last = points.length - 1;
  if (last === emphasized) return { callout };

  const point = points[last]!;
  const text = formatChartValue(data[last]!.value, format);
  const lastWidth = textWidth(text, valueSpec);
  const lastHeight = lineHeight(valueSpec);
  const x = round(Math.max(span.x, Math.min(point.x - lastWidth / 2, span.x + span.width - lastWidth)));
  const above = { text, x, y: round(point.y - dot - gap - lastHeight), width: lastWidth, height: lastHeight };
  if (!overlap(above, callout, gap)) return { callout, lastValue: above };
  const below = { ...above, y: round(point.y + dot + gap) };
  const base = layout.plot.y + layout.plot.height;
  return below.y + lastHeight + gap <= base && !overlap(below, callout, gap) ? { callout, lastValue: below } : { callout };
}

export function LineChart(props: LineChartProps) {
  const errors = lineChartErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`LineChart: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, title, data, prefix, suffix, decimals } = props;
  const showArea = props.areaFill ?? true;
  const { colors, fonts, spacing, motion, weights } = theme;
  const layout = lineChartLayout(theme, aspect, props, slot);
  const time = useSceneTime(progress);
  const { ms } = entering(time);

  const stage = arrive(theme, ms, motion.leadMs);
  const opacity = round(Math.min(stage.opacity, exitOpacity(theme, time, motion.enter.ms)), 3);
  const rise = round((1 - stage.move) * spacing.md);

  const format = { prefix, suffix, decimals };
  const points = lineChartPoints(layout, data);
  const total = points.at(-1)!.along;
  const drawAt = motion.leadMs;
  const drawn = lineDrawn(ms - drawAt);
  const length = round(total);
  const base = layout.plot.y + layout.plot.height;
  const reachMs = points.map((p) => drawAt + lineReachMs(total > 0 ? p.along / total : 1));
  const emphasized = emphasisIndex(data);
  const last = data.length - 1;

  const axisDrawn = lineDrawn(((ms - drawAt) * DRAW_MS) / AXIS_MS);
  const axisLength = round(layout.axis.x1 - layout.axis.x0);

  const anchor = points[emphasized]!;
  const calloutAt = reachMs[emphasized]! + VALUE_DELAY_MS;
  const calloutOpacity = round(fade(motion.fx, ms - calloutAt), 3);
  const calloutScale = round(CALLOUT_FROM_SCALE + (1 - CALLOUT_FROM_SCALE) * tween(motion.pop, ms - calloutAt), 4);
  const { callout, lastValue: lastBox } = lineChartValues(layout, points, data, format);
  const lastValue = arrive(theme, ms, reachMs[last]! + VALUE_DELAY_MS);

  const step = cascadeStep(theme, data.length);
  const labelBoxes = lineChartLabels(layout, points, data);

  return (
    <div data-block="LineChart" style={{ position: "absolute", left: layout.box.x, top: layout.box.y, width: layout.box.width, height: layout.box.height, opacity, transform: `translateY(${rise}px)` }}>
      {title && (
        <div
          data-line-title=""
          style={{
            position: "absolute",
            left: layout.title.x,
            top: 0,
            width: layout.title.width,
            height: layout.title.height,
            boxSizing: "border-box",
            paddingBottom: glyphPad(layout.titleSpec),
            // The height is a cautious estimate: a title that sets on fewer lines sits on the chart, the room going above it.
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          <div style={{ fontFamily: fonts.display, ...typeCss(layout.titleSpec), color: colors.text, textAlign: "center" }}>{title}</div>
        </div>
      )}
      <svg width={layout.box.width} height={layout.box.height} viewBox={`0 0 ${layout.box.width} ${layout.box.height}`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, display: "block", overflow: "visible" }}>
        <path
          data-line-axis=""
          d={`M ${layout.axis.x0} ${base} L ${layout.axis.x1} ${base}`}
          fill="none"
          stroke={colors.border}
          strokeWidth={Math.max(1, Math.round(layout.stroke / 2))}
          strokeLinecap="round"
          strokeDasharray={axisLength}
          strokeDashoffset={round(axisLength * (1 - axisDrawn))}
        />
        {showArea && drawn > 0 && <path data-line-area="" d={lineAreaPath(points, drawn * total, base)} fill={withAlpha(colors.text, AREA_ALPHA)} stroke="none" />}
        <path
          data-line-stroke=""
          data-line-length={length}
          d={points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
          fill="none"
          stroke={colors.text}
          strokeWidth={layout.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={length}
          strokeDashoffset={round(length * (1 - drawn))}
        />
        {points.map((p, i) => {
          const scale = round(tween(motion.pop, ms - reachMs[i]!), 4);
          return (
            <circle
              key={i}
              data-line-point={i}
              cx={p.x}
              cy={p.y}
              r={i === emphasized ? layout.emphasisDot : layout.dot}
              fill={i === emphasized ? colors.accent : colors.text}
              transform={`translate(${p.x} ${p.y}) scale(${scale}) translate(${-p.x} ${-p.y})`}
            />
          );
        })}
      </svg>
      {data.map((d, i) => {
        const label = arrive(theme, ms, LABELS_AT_MS + i * step);
        return (
          <div
            key={i}
            data-line-label={i}
            {...(layout.labelFitted && { [TYPE_FIT_ATTRIBUTE]: "" })}
            style={{
              position: "absolute",
              left: labelBoxes[i]!.x,
              top: layout.labelTop,
              width: labelBoxes[i]!.width,
              fontFamily: fonts.body,
              ...typeCss(layout.labelSpec),
              color: colors.textMuted,
              textAlign: "center",
              whiteSpace: "nowrap",
              opacity: round(label.opacity, 3),
              transform: `translateY(${round((1 - label.move) * spacing.xs)}px)`,
            }}
          >
            {d.label}
          </div>
        );
      })}
      {lastBox && (
        <div
          data-line-last-value=""
          style={{
            position: "absolute",
            left: lastBox.x,
            top: lastBox.y,
            width: lastBox.width,
            fontFamily: fonts.body,
            ...typeCss(layout.valueSpec),
            fontWeight: weights.semibold,
            color: colors.text,
            textAlign: "center",
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
            opacity: round(lastValue.opacity, 3),
            transform: `translateY(${round((1 - lastValue.move) * spacing.xs)}px)`,
          }}
        >
          {lastBox.text}
        </div>
      )}
      <div
        data-line-callout=""
        style={{
          position: "absolute",
          left: callout.x,
          top: callout.y,
          width: callout.width,
          height: callout.height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: theme.radius.sm,
          background: colors.accent,
          opacity: calloutOpacity,
          transform: `scale(${calloutScale})`,
          transformOrigin: `${round(anchor.x - callout.x)}px 100%`,
        }}
      >
        <span
          data-line-callout-value=""
          style={{ fontFamily: fonts.body, ...typeCss(layout.calloutSpec), fontWeight: weights.semibold, color: colors.accentText, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
        >
          {callout.text}
        </span>
      </div>
    </div>
  );
}
