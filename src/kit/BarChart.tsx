// A bar chart (ported from HyperFrames `chart-story`, bars and progress modes,
// with the bar build of `animated-bar-chart`): bars grow from the baseline in
// reading order, a cascade apart, each value counting up at its bar's end and
// landing on the exact supplied number. The emphasized bar is in the accent and
// its value pops once as it lands; the others are one step of the ink. Bars
// stand up in 16:9 and lie down in 9:16, over a few faint gridlines. As
// `progress`, each item is a labeled track filling left to right, its value at
// the track's right end. "Q3 revenue $1,250".

import { Fragment } from "react";
import { textColumn } from "../layout/caption";
import { isTall, type Rect } from "../layout/frame";
import { blockCenterY, placeBlock } from "../layout/block";
import { AVG_CHAR_EM } from "../layout/textFit";
import { TYPE_FIT_ATTRIBUTE, glyphPad, textBoxHeight, typeCss } from "../layout/type";
import { mixColors, withAlpha } from "../theme/color";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { chartErrors, emphasisIndex, formatChartValue, niceMax, type ChartDatum, type ChartValueFormat } from "./chart";
import { entering, useSceneTime } from "./frameContext";
import { arrive, cascadeStep, exitOpacity, fade, pulse, tween } from "./motion";
import type { KitProps } from "./types";

export interface BarChartProps extends KitProps, ChartValueFormat {
  /** A title above the chart. */
  title?: string;
  /** 1-12 items, in reading order. The one with `emphasis` (else the largest) takes the accent. */
  data: ChartDatum[];
  /** `bars` (default) or `progress`: one labeled track per item, filling left to right. */
  variant?: "bars" | "progress";
  /** Which way the bars grow. Default: vertical in 16:9, horizontal in tall aspects (9:16, 4:5). `progress` is always horizontal. */
  orientation?: "vertical" | "horizontal";
  /** The value a full-length bar stands for. Default: the nice max of the largest value; 100 for `progress`. */
  max?: number;
}

/** The bars that are not emphasized: the ink mixed into the ground at this share, opaque so no gridline shows through. */
const BAR_INK = 0.45;
/** The ink's opacity for the gridlines, the baseline and the progress tracks (the source's alpha steps). */
const GRID_OPACITY = 0.08;
const BASELINE_OPACITY = 0.18;
const TRACK_OPACITY = 0.08;
/** Gridlines at these shares of `max` (the baseline is the zero line). */
const GRID_STEPS = [0.25, 0.5, 0.75, 1];
/** A vertical bar's share of its band, and the widest a band and a bar may be, in px. */
const BAND_SHARE = 0.62;
const BAND_MAX_PX = 256;
const BAR_MAX_PX = 160;
/** The widest a horizontal chart may be, in px. */
const ROWS_MAX_PX = 1280;
/** A label column wider than this share of the chart puts the labels above their bars instead. */
const LABEL_COLUMN_SHARE = 0.3;

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places || 0;

/** What is wrong with BarChart props; empty when they are fine. */
export function barChartErrors(props: Record<string, unknown>): string[] {
  const { data, title, variant, orientation, max } = props;
  const errors = chartErrors(data);
  if (title !== undefined && typeof title !== "string") errors.push("`title` must be a string");
  if (variant !== undefined && variant !== "bars" && variant !== "progress") errors.push('`variant` must be "bars" or "progress"');
  if (orientation !== undefined && orientation !== "vertical" && orientation !== "horizontal") errors.push('`orientation` must be "vertical" or "horizontal"');
  if (max !== undefined && (typeof max !== "number" || !Number.isFinite(max) || max <= 0)) errors.push("`max` must be a finite number above 0");
  return errors;
}

/** The value a full-length bar stands for. */
export function barChartMax(input: Pick<BarChartProps, "data" | "variant" | "max">): number {
  if (input.max !== undefined) return input.max;
  if (input.variant === "progress") return 100;
  return niceMax(Math.max(...input.data.map((d) => d.value)));
}

/** Which way the bars grow: `orientation`, else vertical in 16:9 and horizontal in tall aspects (9:16, 4:5); `progress` always horizontal. */
export function barChartOrientation(aspect: Aspect, input: Pick<BarChartProps, "variant" | "orientation">): "vertical" | "horizontal" {
  if (input.variant === "progress") return "horizontal";
  return input.orientation ?? (!isTall(aspect) ? "vertical" : "horizontal");
}

/** Each bar's color: the accent on the emphasized one, one step of the ink on the rest. */
export function barColors(theme: Theme, data: ChartDatum[]): string[] {
  const emphasized = emphasisIndex(data);
  const other = mixColors(theme.colors.ground, theme.colors.text, BAR_INK);
  return data.map((_, i) => (i === emphasized ? theme.colors.accent : other));
}

/** Estimated one-line width of `text` in `spec`, in px. */
const textWidth = (text: string, spec: TypeSpec) => Math.ceil(text.length * (AVG_CHAR_EM + spec.tracking) * spec.size);
/** Height of a one-line text box in `spec`, with its glyph padding. */
const lineBox = (spec: TypeSpec) => Math.ceil(spec.size * spec.lineHeight) + 2 * glyphPad(spec);

/** The largest step in `roles` whose widest text fits `width`, else the last shrunk to fit. */
function fitStep(theme: Theme, aspect: Aspect, roles: TypeRole[], texts: string[], width: number): { spec: TypeSpec; fitted: boolean } {
  const widest = (spec: TypeSpec) => Math.max(0, ...texts.map((t) => textWidth(t, spec)));
  for (const role of roles) {
    const spec = theme.type[role][aspect];
    if (widest(spec) <= width) return { spec, fitted: false };
  }
  const last = theme.type[roles.at(-1)!][aspect];
  const size = Math.floor(last.size * (width / Math.max(1, widest(last))));
  return { spec: { ...last, size: Math.min(last.size, Math.max(1, size)) }, fitted: true };
}

/** One bar's place: its slot across the growth axis, where it starts along it, and its full length. */
export interface BarSlot {
  /** Vertical: the band's left edge and width. Horizontal: the row's top and height. */
  at: number;
  span: number;
  /** The bar's thickness across the growth axis, and its offset in the slot. */
  thickness: number;
  offset: number;
  /** The bar's length on the hold, in px. */
  length: number;
}

export interface BarChartLayout {
  /** The whole block, in frame px. */
  box: Rect;
  orientation: "vertical" | "horizontal";
  max: number;
  /** The title's box, inside `box`; height 0 without a title. */
  title: Rect;
  titleSpec: TypeSpec;
  /** The plot: bars grow from its left (horizontal) or bottom (vertical) edge across `length` px. Inside `box`. */
  plot: Rect;
  length: number;
  bars: BarSlot[];
  /** Category labels and values: their specs, whether each was shrunk to fit, and their line height. */
  labelSpec: TypeSpec;
  labelFitted: boolean;
  labelLine: number;
  valueSpec: TypeSpec;
  valueFitted: boolean;
  valueLine: number;
  /** Horizontal: the label column's width (0 with labels above the bars) and the value column's. */
  labelColumn: number;
  valueColumn: number;
  labelsAbove: boolean;
}

type LayoutInput = Pick<BarChartProps, "title" | "data" | "variant" | "orientation" | "max" | "prefix" | "suffix" | "decimals">;

/** Where the title, plot, bars and labels go. */
export function barChartLayout(theme: Theme, aspect: Aspect, input: LayoutInput, slot?: Rect): BarChartLayout {
  const { spacing } = theme;
  // Clear of the 9:16 button rail: values sit at the right end.
  const area = slot ?? textColumn(theme, aspect);
  const orientation = barChartOrientation(aspect, input);
  const max = barChartMax(input);
  const format = { prefix: input.prefix, suffix: input.suffix, decimals: input.decimals };
  const n = input.data.length;
  const labels = input.data.map((d) => d.label);
  const values = input.data.map((d) => formatChartValue(d.value, format));
  const share = (value: number) => Math.min(1, Math.max(0, value / max));

  const titleSpec = theme.type.title[aspect];
  const titleWidth = input.title ? Math.min(area.width, textWidth(input.title, titleSpec)) : 0;
  const titleHeight = input.title ? textBoxHeight(input.title, titleWidth, titleSpec) : 0;
  const titleGap = input.title ? spacing.lg : 0;
  const room = Math.max(0, area.height - titleHeight - titleGap);
  const top = titleHeight + titleGap;

  if (orientation === "vertical") {
    const chartWidth = Math.min(area.width, n * BAND_MAX_PX);
    const band = chartWidth / n;
    const label = fitStep(theme, aspect, ["body", "label"], labels, band - spacing.xs);
    const value = fitStep(theme, aspect, ["body", "label"], values, band - spacing.xs);
    const labelLine = lineBox(label.spec);
    const valueLine = lineBox(value.spec);
    const extras = valueLine + spacing.xs + spacing.sm + labelLine;
    const length = Math.max(0, Math.floor(Math.min(room - extras, chartWidth)));
    const thickness = Math.round(Math.min(band * BAND_SHARE, BAR_MAX_PX));
    const width = Math.min(area.width, Math.max(chartWidth, titleWidth));
    const height = top + extras + length;
    const box = placeBlock(area, { width, height }, blockCenterY(theme, aspect, slot));
    const left = (width - chartWidth) / 2;
    return {
      box,
      orientation,
      max,
      title: { x: 0, y: 0, width, height: titleHeight },
      titleSpec,
      plot: { x: round(left), y: top + valueLine + spacing.xs, width: chartWidth, height: length },
      length,
      bars: input.data.map((d, i) => ({ at: round(band * i), span: round(band), thickness, offset: round((band - thickness) / 2), length: round(share(d.value) * length) })),
      labelSpec: label.spec,
      labelFitted: label.fitted,
      labelLine,
      valueSpec: value.spec,
      valueFitted: value.fitted,
      valueLine,
      labelColumn: 0,
      valueColumn: 0,
      labelsAbove: false,
    };
  }

  const tracks = input.variant === "progress";
  const chartWidth = Math.min(area.width, ROWS_MAX_PX);
  // The body step, unless its rows would not fit the height even packed tight.
  const bodyLine = lineBox(theme.type.body[aspect]);
  const roles: TypeRole[] = n * bodyLine + (n - 1) * spacing.xxs > room ? ["label"] : ["body", "label"];
  const value = fitStep(theme, aspect, roles, values, chartWidth * LABEL_COLUMN_SHARE);
  const valueColumn = Math.max(...values.map((v) => textWidth(v, value.spec)));
  const besideLabel = fitStep(theme, aspect, roles, labels, chartWidth * LABEL_COLUMN_SHARE);
  const labelsAbove = besideLabel.fitted;
  const label = labelsAbove ? fitStep(theme, aspect, roles, labels, chartWidth) : besideLabel;
  const labelColumn = labelsAbove ? 0 : Math.max(...labels.map((l) => textWidth(l, label.spec)));
  const labelLine = lineBox(label.spec);
  const valueLine = lineBox(value.spec);
  const beside = chartWidth - (labelsAbove ? 0 : labelColumn + spacing.md);
  // The track (the value `max`) leaves room for a value after a full-length bar.
  let length = Math.max(0, Math.floor(beside - spacing.sm - valueColumn));
  const longest = Math.max(...input.data.map((d) => share(d.value)));
  if (isTall(aspect) && !tracks && longest > 0) {
    // In tall aspects (9:16, 4:5) the longest bar and its value reach the
    // column's right edge instead, so the block fills the narrow frame rather
    // than leaving the right of it empty: the track runs on under the values,
    // never past the chart.
    length = Math.max(length, Math.floor(Math.min(beside, (beside - spacing.sm - valueColumn) / longest)));
  }

  // Thickness and gaps at their natural size; when the rows would not fit, the gaps close up first, then the bars thin.
  const text = Math.max(labelsAbove ? 0 : labelLine, valueLine);
  const rowFor = (thickness: number) => (labelsAbove ? labelLine + spacing.xxs + Math.max(thickness, valueLine) : Math.max(thickness, text));
  let thickness = tracks ? spacing.md : spacing.xxl;
  let gap = spacing.lg;
  if (n * rowFor(thickness) + (n - 1) * gap > room && n > 1) gap = Math.max(spacing.xxs, Math.floor((room - n * rowFor(thickness)) / (n - 1)));
  if (n * rowFor(thickness) + (n - 1) * gap > room) {
    const rowRoom = Math.floor((room - (n - 1) * gap) / n);
    thickness = Math.max(spacing.xxs, Math.min(thickness, rowRoom - (labelsAbove ? labelLine + spacing.xxs : 0)));
  }
  const row = rowFor(thickness);
  const rowsHeight = n * row + (n - 1) * gap;

  const width = Math.min(area.width, Math.max(chartWidth, titleWidth));
  const height = top + rowsHeight;
  const box = placeBlock(area, { width, height }, blockCenterY(theme, aspect, slot));
  const left = (width - chartWidth) / 2;
  const plotX = left + (labelsAbove ? 0 : labelColumn + spacing.md);
  const barTop = labelsAbove ? labelLine + spacing.xxs + (Math.max(thickness, valueLine) - thickness) / 2 : (row - thickness) / 2;
  return {
    box,
    orientation,
    max,
    title: { x: 0, y: 0, width, height: titleHeight },
    titleSpec,
    plot: { x: round(plotX), y: top, width: length, height: rowsHeight },
    length,
    bars: input.data.map((d, i) => ({ at: round(i * (row + gap)), span: row, thickness, offset: round(barTop), length: round(share(d.value) * length) })),
    labelSpec: label.spec,
    labelFitted: label.fitted,
    labelLine,
    valueSpec: value.spec,
    valueFitted: value.fitted,
    valueLine,
    labelColumn: round(labelColumn),
    valueColumn,
    labelsAbove,
  };
}

export function BarChart(props: BarChartProps) {
  const errors = barChartErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`BarChart: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, title, data, prefix, suffix, decimals } = props;
  const { colors, fonts, spacing, motion, weights } = theme;
  const layout = barChartLayout(theme, aspect, props, slot);
  const time = useSceneTime(progress);
  const { ms } = entering(time);
  const format = { prefix, suffix, decimals };
  const isTracks = props.variant === "progress";
  const vertical = layout.orientation === "vertical";

  const stage = arrive(theme, ms, motion.leadMs);
  const opacity = round(Math.min(stage.opacity, exitOpacity(theme, time, motion.enter.ms)), 3);
  const rise = round((1 - stage.move) * spacing.md);

  const palette = barColors(theme, data);
  const emphasized = emphasisIndex(data);
  const step = cascadeStep(theme, data.length);
  const { plot, length: full } = layout;
  const hairline = theme.hairline;

  const labelStyle = { fontFamily: fonts.body, ...typeCss(layout.labelSpec), color: colors.textMuted, whiteSpace: "nowrap" as const };
  const valueStyle = { fontFamily: fonts.body, ...typeCss(layout.valueSpec), fontWeight: weights.semibold, color: colors.text, whiteSpace: "nowrap" as const, fontVariantNumeric: "tabular-nums" };
  const labelFit = layout.labelFitted ? { [TYPE_FIT_ATTRIBUTE]: "" } : {};
  const valueFit = layout.valueFitted ? { [TYPE_FIT_ATTRIBUTE]: "" } : {};

  return (
    <div
      data-block="BarChart"
      data-bar-orientation={layout.orientation}
      data-bar-plot={full}
      style={{ position: "absolute", left: layout.box.x, top: layout.box.y, width: layout.box.width, height: layout.box.height, opacity, transform: `translateY(${rise}px)` }}
    >
      {title && (
        <div
          data-bar-title=""
          style={{ position: "absolute", left: 0, top: glyphPad(layout.titleSpec), width: layout.title.width, fontFamily: fonts.display, ...typeCss(layout.titleSpec), color: colors.text, textAlign: "center" }}
        >
          {title}
        </div>
      )}
      {!isTracks &&
        GRID_STEPS.map((k) => {
          const at = round(k * full);
          const line = vertical
            ? { left: plot.x, top: round(plot.y + full - at - hairline / 2), width: plot.width, height: hairline }
            : { left: round(plot.x + at - hairline / 2), top: plot.y, width: hairline, height: plot.height };
          return <div key={k} data-bar-grid="" style={{ position: "absolute", ...line, background: withAlpha(colors.text, GRID_OPACITY) }} />;
        })}
      {!isTracks && (
        <div
          data-bar-baseline=""
          style={{
            position: "absolute",
            ...(vertical
              ? { left: plot.x, top: round(plot.y + full - hairline / 2), width: plot.width, height: hairline }
              : { left: round(plot.x - hairline / 2), top: plot.y, width: hairline, height: plot.height }),
            background: withAlpha(colors.text, BASELINE_OPACITY),
          }}
        />
      )}
      {data.map((d, i) => {
        const bar = layout.bars[i]!;
        const startMs = motion.leadMs + i * step;
        const grow = tween(motion.enter, ms - startMs);
        const visible = round(Math.min(full, Math.max(0, bar.length * grow)));
        const count = tween({ ms: motion.enter.ms, curve: motion.count.curve }, ms - startMs);
        const shown = count >= 1 ? formatChartValue(d.value, format) : formatChartValue(d.value * count, format);
        const valueOpacity = round(fade(motion.fx, ms - startMs), 3);
        const label = arrive(theme, ms, startMs);
        const labelOpacity = round(label.opacity, 3);
        const labelRise = round((1 - label.move) * spacing.xs);
        const pop = i === emphasized ? round(1 + (motion.pop.scale - 1) * pulse(motion.pop, ms - (startMs + motion.enter.ms)), 4) : 1;
        const popTransform = pop !== 1 ? `scale(${pop})` : undefined;
        const radius = isTracks ? Math.min(bar.thickness / 2, visible / 2) : Math.min(theme.radius.sm, bar.thickness / 2, visible / 2);
        const r = round(radius);

        if (vertical) {
          const x = plot.x + bar.at;
          return (
            <Fragment key={i}>
              <div
                data-bar={i}
                data-bar-axis="y"
                data-bar-length={bar.length}
                style={{ position: "absolute", left: round(x + bar.offset), top: round(plot.y + full - visible), width: bar.thickness, height: visible, borderRadius: `${r}px ${r}px 0 0`, background: palette[i] }}
              />
              <div
                data-bar-value={i}
                {...valueFit}
                style={{
                  position: "absolute",
                  left: round(x),
                  top: round(plot.y + full - visible - spacing.xs - layout.valueLine + glyphPad(layout.valueSpec)),
                  width: bar.span,
                  textAlign: "center",
                  ...valueStyle,
                  opacity: valueOpacity,
                  transform: popTransform,
                  transformOrigin: "50% 100%",
                }}
              >
                {shown}
              </div>
              <div
                data-bar-label={i}
                {...labelFit}
                style={{
                  position: "absolute",
                  left: round(x),
                  top: round(plot.y + full + spacing.sm + glyphPad(layout.labelSpec)),
                  width: bar.span,
                  textAlign: "center",
                  ...labelStyle,
                  opacity: labelOpacity,
                  transform: `translateY(${labelRise}px)`,
                }}
              >
                {d.label}
              </div>
            </Fragment>
          );
        }

        const rowTop = plot.y + bar.at;
        const barTop = rowTop + bar.offset;
        const valueTop = barTop + bar.thickness / 2 - layout.valueLine / 2 + glyphPad(layout.valueSpec);
        const labelTop = layout.labelsAbove ? rowTop + glyphPad(layout.labelSpec) : rowTop + bar.span / 2 - layout.labelLine / 2 + glyphPad(layout.labelSpec);
        const labelLeft = layout.labelsAbove ? plot.x : plot.x - spacing.md - layout.labelColumn;
        const valueLeft = isTracks ? plot.x + full + spacing.sm : plot.x + visible + spacing.sm;
        return (
          <Fragment key={i}>
            {isTracks && (
              <div
                data-bar-track={i}
                style={{ position: "absolute", left: plot.x, top: round(barTop), width: full, height: bar.thickness, borderRadius: bar.thickness / 2, background: withAlpha(colors.text, TRACK_OPACITY), opacity: valueOpacity }}
              />
            )}
            <div
              data-bar={i}
              data-bar-axis="x"
              data-bar-length={bar.length}
              style={{
                position: "absolute",
                left: plot.x,
                top: round(barTop),
                width: visible,
                height: bar.thickness,
                borderRadius: isTracks ? r : `0 ${r}px ${r}px 0`,
                background: palette[i],
              }}
            />
            <div
              data-bar-label={i}
              {...labelFit}
              style={{
                position: "absolute",
                left: round(labelLeft),
                top: round(labelTop),
                width: layout.labelsAbove ? full + spacing.sm + layout.valueColumn : layout.labelColumn,
                ...labelStyle,
                opacity: labelOpacity,
                transform: `translateY(${labelRise}px)`,
              }}
            >
              {d.label}
            </div>
            <div
              data-bar-value={i}
              {...valueFit}
              style={{
                position: "absolute",
                left: round(valueLeft),
                top: round(valueTop),
                width: layout.valueColumn,
                ...valueStyle,
                opacity: valueOpacity,
                transform: popTransform,
                transformOrigin: "0% 50%",
              }}
            >
              {shown}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
