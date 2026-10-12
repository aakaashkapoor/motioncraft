// A donut chart (ported from HyperFrames `chart-story`, donut mode): a ring of
// arcs, one per item, a small gap between them, that sweeps clockwise from 12
// o'clock segment by segment over about 1.2 s. The emphasized item is in the
// accent and lifts out a little as it lands; the others are steps of the ink.
// The center number counts up with the sweep and pops as it lands, and a
// legend (swatch, label, value) cascades in beside the ring in 16:9 and below
// it in tall aspects (9:16, 4:5). "Acme 42% of the market".

import { contentArea } from "../layout/caption";
import { isTall, type Rect } from "../layout/frame";
import { blockCenterY, placeBlock } from "../layout/block";
import { safeZones } from "../layout/safe";
import { AVG_CHAR_EM } from "../layout/textFit";
import { TYPE_FIT_ATTRIBUTE, glyphPad, textBoxHeight, typeCss } from "../layout/type";
import { mixColors, withAlpha } from "../theme/color";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { chartErrors, emphasisIndex, formatChartValue, type ChartDatum, type ChartValueFormat } from "./chart";
import { entering, useSceneTime } from "./frameContext";
import { arrive, cascadeStep, exitOpacity, fade, pulse, tween } from "./motion";
import type { KitProps } from "./types";

export interface DonutChartProps extends KitProps, ChartValueFormat {
  /** A title above the chart. */
  title?: string;
  /** 1-8 items, clockwise from 12 o'clock. The one with `emphasis` (else the largest) takes the accent. */
  data: ChartDatum[];
  /** The ring's center. Default: the emphasized item's share as a whole percent, and its label. */
  center?: { value: string; label?: string };
}

export const DONUT_CHART_MAX_ITEMS = 8;

/** When the sweep starts and how long it takes to go round, in ms. */
const SWEEP_AT_MS = 300;
const SWEEP_MS = 1200;
/** When the legend's first row starts in, in ms (the source's labels follow the build by 300 ms). */
const LEGEND_AT_MS = 600;
/** The ring's stroke, as a share of its diameter. */
const STROKE_SHARE = 0.14;
/** How far the emphasized segment lifts out, as a share of the radius. */
const LIFT_SHARE = 0.02;
/** The other segments: the ink mixed into the surface at these shares, in order. */
const INK_STEPS = [0.78, 0.6, 0.46, 0.35, 0.27, 0.2, 0.15];
/** The faint track the ring sweeps over (it fades as the ring lands, so the gaps show the ground): the ink at this opacity. */
const TRACK_OPACITY = 0.07;
/** Ramp steps the center value may take, largest first. */
const CENTER_ROLES: TypeRole[] = ["hero", "display", "headline", "title", "subtitle"];
/** Share of the hole's diameter the center value and label may be wide and tall. */
const HOLE_WIDTH_SHARE = 0.76;
const HOLE_HEIGHT_SHARE = 0.7;
/** Share of the area's height the ring may take when the legend is beside it. Below it (tall aspects) the ring may take the primary width. */
const BESIDE_RING_SHARE = 0.85;

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places || 0;

/** What is wrong with DonutChart props; empty when they are fine. */
export function donutChartErrors(props: Record<string, unknown>): string[] {
  const { data, center, title } = props;
  const errors = chartErrors(data);
  if (Array.isArray(data) && data.length > DONUT_CHART_MAX_ITEMS) errors.push(`a donut takes at most ${DONUT_CHART_MAX_ITEMS} items, got ${data.length}`);
  if (errors.length === 0 && (data as ChartDatum[]).every((d) => d.value === 0)) errors.push("data must have a value above 0");
  if (title !== undefined && typeof title !== "string") errors.push("`title` must be a string");
  if (center !== undefined) {
    const c = (center ?? {}) as Record<string, unknown>;
    if (typeof center !== "object" || typeof c.value !== "string" || c.value.trim() === "") errors.push("`center.value` must be a non-empty string");
    if (c.label !== undefined && typeof c.label !== "string") errors.push("`center.label` must be a string");
  }
  return errors;
}

/** The emphasized item's share of the total, as a whole percent. */
export function donutDefaultCenter(data: ChartDatum[]): { value: string; label: string } {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const item = data[emphasisIndex(data)]!;
  return { value: `${Math.round((item.value / total) * 100)}%`, label: item.label };
}

/** An arc of the ring, as shares of the circumference clockwise from 12 o'clock. */
export interface DonutArc {
  start: number;
  length: number;
}

/**
 * Each item's arc: a gap of `gapShare` after every non-zero item (centered on
 * 12 o'clock for the first) and the rest of the ring shared in proportion to
 * the values. A lone non-zero item takes the whole ring.
 */
export function donutArcs(data: ChartDatum[], gapShare: number): DonutArc[] {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const filled = data.filter((d) => d.value > 0).length;
  const gap = filled > 1 ? gapShare : 0;
  const room = 1 - filled * gap;
  let cursor = gap / 2;
  return data.map((d) => {
    const length = (d.value / total) * room;
    const arc = { start: cursor, length };
    if (d.value > 0) cursor += length + gap;
    return arc;
  });
}

/** `value` counted up to `k` (0..1) of its first number, keeping its decimals, grouping and the text around it. */
export function countUpText(value: string, k: number): string {
  const m = /^(.*?)(\d[\d,]*(?:\.\d+)?)(.*)$/s.exec(value);
  if (m === null || k >= 1) return value;
  const digits = m[2]!;
  const decimals = digits.split(".")[1]?.length ?? 0;
  const n = Number(digits.replace(/,/g, "")) * Math.max(0, k);
  const body = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: digits.includes(",") });
  return `${m[1]}${body}${m[3]}`;
}

/** Estimated one-line width of `text` in `spec`, in px. */
const textWidth = (text: string, spec: TypeSpec) => Math.ceil(text.length * (AVG_CHAR_EM + spec.tracking) * spec.size);

export interface DonutChartLayout {
  /** The whole block, in frame px. */
  box: Rect;
  arrangement: "beside" | "below";
  /** The title's box, inside `box`; height 0 without a title. */
  title: Rect;
  titleSpec: TypeSpec;
  /** The ring's square, inside `box`. */
  ring: Rect;
  /** The ring's centerline radius and stroke width. */
  radius: number;
  stroke: number;
  /** The legend's box, inside `box`. */
  legend: Rect;
  legendSpec: TypeSpec;
  columns: number;
  columnWidth: number;
  rowHeight: number;
  swatch: number;
  /** The center value's and label's specs, and whether each was shrunk below its step to fit the hole. */
  valueSpec: TypeSpec;
  valueFitted: boolean;
  labelSpec: TypeSpec;
  labelFitted: boolean;
}

type LayoutInput = Pick<DonutChartProps, "title" | "data" | "center" | "prefix" | "suffix" | "decimals">;

/** The largest step in `roles` whose `text` fits `width`, else the last shrunk to fit. */
function fitStep(theme: Theme, aspect: Aspect, roles: TypeRole[], text: string, width: number, height = Infinity): { spec: TypeSpec; fitted: boolean } {
  for (const role of roles) {
    const spec = theme.type[role][aspect];
    if (textWidth(text, spec) <= width && spec.size * spec.lineHeight <= height) return { spec, fitted: false };
  }
  const last = theme.type[roles.at(-1)!][aspect];
  const size = Math.floor(Math.min(last.size * (width / Math.max(1, textWidth(text, last))), height / last.lineHeight));
  return { spec: { ...last, size: Math.min(last.size, Math.max(1, size)) }, fitted: true };
}

/** Where the title, ring and legend go: legend beside the ring in 16:9, below it in tall aspects (9:16, 4:5). */
export function donutChartLayout(theme: Theme, aspect: Aspect, input: LayoutInput, slot?: Rect): DonutChartLayout {
  const { spacing } = theme;
  const area = slot ?? contentArea(theme, aspect);
  const arrangement = !isTall(aspect) ? "beside" : "below";
  const format = { prefix: input.prefix, suffix: input.suffix, decimals: input.decimals };
  const n = input.data.length;

  const titleSpec = theme.type.title[aspect];
  const titleWidth = input.title ? Math.min(area.width, textWidth(input.title, titleSpec)) : 0;
  // Tall aspects wrap the title with the same glyph width that sized it, so a title that fits one line is given one line's height, and the ring the rest.
  const titleEm = isTall(aspect) ? AVG_CHAR_EM + titleSpec.tracking : undefined;
  const titleHeight = input.title ? textBoxHeight(input.title, titleWidth, titleSpec, titleEm) : 0;
  const titleGap = input.title ? spacing.md : 0;
  const room = area.height - titleHeight - titleGap;
  // Over the legend (tall aspects) the ring may take the primary width, keeping a margin inside a narrower slot; the height usually limits it first.
  const belowRing = Math.min(area.width - 2 * spacing.md, safeZones(aspect, theme.safe).primaryWidth);

  const columns = arrangement === "below" && n >= 4 ? 2 : 1;
  const rows = Math.ceil(n / columns);
  const legendFor = (role: TypeRole) => {
    const spec = theme.type[role][aspect];
    const swatch = Math.round(spec.size * 0.5);
    const rowWidth = Math.max(...input.data.map((d) => swatch + 2 * spacing.xs + textWidth(`${d.label} ${formatChartValue(d.value, format)}`, spec)));
    const rowHeight = Math.ceil(spec.size * spec.lineHeight);
    const width = columns * rowWidth + (columns - 1) * spacing.lg;
    const height = rows * rowHeight + (rows - 1) * spacing.xs;
    const ring =
      arrangement === "beside"
        ? Math.min(Math.floor(room * BESIDE_RING_SHARE), area.width - width - spacing.xl)
        : Math.min(Math.floor(belowRing), room - height - spacing.lg);
    return { spec, swatch, rowWidth, rowHeight, width, height, ring };
  };
  const roomy = legendFor("body");
  const legendLayout = roomy.width <= area.width && roomy.ring >= room * 0.5 ? roomy : legendFor("label");
  const ringSize = Math.max(0, Math.floor(legendLayout.ring));
  const legendWidth = Math.min(legendLayout.width, arrangement === "beside" ? area.width - ringSize - spacing.xl : area.width);
  const columnWidth = columns === 1 ? legendWidth : (legendWidth - spacing.lg) / 2;

  const chartWidth = arrangement === "beside" ? ringSize + spacing.xl + legendWidth : Math.max(ringSize, legendWidth);
  const chartHeight = arrangement === "beside" ? Math.max(ringSize, legendLayout.height) : ringSize + spacing.lg + legendLayout.height;
  const width = Math.min(area.width, Math.max(chartWidth, titleWidth));
  const height = titleHeight + titleGap + chartHeight;
  const box = placeBlock(area, { width, height }, blockCenterY(theme, aspect, slot));

  const top = titleHeight + titleGap;
  const left = (width - chartWidth) / 2;
  const ring =
    arrangement === "beside"
      ? { x: left, y: top + (chartHeight - ringSize) / 2, width: ringSize, height: ringSize }
      : { x: (width - ringSize) / 2, y: top, width: ringSize, height: ringSize };
  const legend =
    arrangement === "beside"
      ? { x: left + ringSize + spacing.xl, y: top + (chartHeight - legendLayout.height) / 2, width: legendWidth, height: legendLayout.height }
      : { x: (width - legendWidth) / 2, y: top + ringSize + spacing.lg, width: legendWidth, height: legendLayout.height };

  const stroke = Math.round(ringSize * STROKE_SHARE);
  // Room for the lift: the lifted segment's outer edge stays inside the square.
  const radius = Math.max(0, Math.floor((ringSize - stroke) / 2 / (1 + LIFT_SHARE)));
  const hole = Math.max(0, 2 * radius - stroke);
  const center = input.center ?? donutDefaultCenter(input.data);
  const label = fitStep(theme, aspect, ["label"], center.label ?? "", hole * HOLE_WIDTH_SHARE);
  const labelHeight = center.label ? Math.ceil(label.spec.size * label.spec.lineHeight) : 0;
  const value = fitStep(theme, aspect, CENTER_ROLES, center.value, hole * HOLE_WIDTH_SHARE, hole * HOLE_HEIGHT_SHARE - labelHeight);

  return {
    box,
    arrangement,
    title: { x: 0, y: 0, width, height: titleHeight },
    titleSpec,
    ring: { ...ring, x: round(ring.x), y: round(ring.y) },
    radius,
    stroke,
    legend: { x: round(legend.x), y: round(legend.y), width: round(legend.width), height: legend.height },
    legendSpec: legendLayout.spec,
    columns,
    columnWidth: round(columnWidth),
    rowHeight: legendLayout.rowHeight,
    swatch: legendLayout.swatch,
    valueSpec: value.spec,
    valueFitted: value.fitted,
    labelSpec: label.spec,
    labelFitted: label.fitted && center.label !== undefined,
  };
}

/** Each item's color: the accent on the emphasized one, steps of the ink on the rest. */
export function donutColors(theme: Theme, data: ChartDatum[]): string[] {
  const { accent, surface, text } = theme.colors;
  const emphasized = emphasisIndex(data);
  let step = 0;
  return data.map((_, i) => (i === emphasized ? accent : mixColors(surface, text, INK_STEPS[step++ % INK_STEPS.length]!)));
}

export function DonutChart(props: DonutChartProps) {
  const errors = donutChartErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`DonutChart: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, title, data, prefix, suffix, decimals } = props;
  const { colors, fonts, spacing, motion, weights } = theme;
  const layout = donutChartLayout(theme, aspect, props, slot);
  const time = useSceneTime(progress);
  const { ms } = entering(time);

  const stage = arrive(theme, ms, motion.leadMs);
  const opacity = round(Math.min(stage.opacity, exitOpacity(theme, time, motion.enter.ms)), 3);
  const rise = round((1 - stage.move) * spacing.md);

  const { radius, stroke, ring } = layout;
  const c = ring.width / 2;
  const circumference = 2 * Math.PI * radius;
  const arcs = donutArcs(data, spacing.xs / Math.max(1, circumference));
  const palette = donutColors(theme, data);
  const emphasized = emphasisIndex(data);
  const front = Math.min(1, Math.max(0, (ms - SWEEP_AT_MS) / SWEEP_MS));
  const landed = SWEEP_AT_MS + SWEEP_MS;

  const center = props.center ?? donutDefaultCenter(data);
  const counted = countUpText(center.value, tween({ ms: SWEEP_MS, curve: motion.count.curve }, ms - SWEEP_AT_MS));
  const centerOpacity = round(fade(motion.fx, ms - SWEEP_AT_MS), 3);
  const centerScale = round(1 + (motion.pop.scale - 1) * pulse(motion.pop, ms - landed), 4);

  const step = cascadeStep(theme, data.length);
  const format = { prefix, suffix, decimals };

  return (
    <div data-block="DonutChart" style={{ position: "absolute", left: layout.box.x, top: layout.box.y, width: layout.box.width, height: layout.box.height, opacity, transform: `translateY(${rise}px)` }}>
      {title && (
        <div
          data-donut-title=""
          style={{ position: "absolute", left: 0, top: glyphPad(layout.titleSpec), width: layout.title.width, fontFamily: fonts.display, ...typeCss(layout.titleSpec), color: colors.text, textAlign: "center" }}
        >
          {title}
        </div>
      )}
      <div data-donut-ring="" style={{ position: "absolute", left: ring.x, top: ring.y, width: ring.width, height: ring.height }}>
        <svg width={ring.width} height={ring.height} viewBox={`0 0 ${ring.width} ${ring.height}`} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
          <circle cx={c} cy={c} r={radius} fill="none" stroke={withAlpha(colors.text, TRACK_OPACITY)} strokeWidth={stroke} opacity={round(fade(motion.fx, ms - motion.leadMs) * (1 - fade(motion.fx, ms - landed)), 3)} />
          {arcs.map((arc, i) => {
            const length = round(arc.length * circumference);
            const visible = front >= 1 ? length : round(Math.min(arc.length, Math.max(0, front - arc.start)) * circumference);
            let lift = "";
            if (i === emphasized) {
              const out = tween(motion.pop, ms - (SWEEP_AT_MS + (arc.start + arc.length) * SWEEP_MS)) * LIFT_SHARE * radius;
              const angle = (arc.start + arc.length / 2) * 2 * Math.PI - Math.PI / 2;
              if (out !== 0) lift = `translate(${round(Math.cos(angle) * out)} ${round(Math.sin(angle) * out)}) `;
            }
            return (
              <circle
                key={i}
                data-donut-arc={i}
                data-donut-length={length}
                cx={c}
                cy={c}
                r={radius}
                fill="none"
                stroke={palette[i]}
                strokeWidth={stroke}
                strokeDasharray={`${visible} ${round(circumference)}`}
                strokeDashoffset={round(-arc.start * circumference)}
                transform={`${lift}rotate(-90 ${c} ${c})`}
              />
            );
          })}
        </svg>
        <div
          data-donut-center=""
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            opacity: centerOpacity,
            transform: centerScale !== 1 ? `scale(${centerScale})` : undefined,
          }}
        >
          <span
            data-donut-value=""
            {...(layout.valueFitted && { [TYPE_FIT_ATTRIBUTE]: "" })}
            style={{ fontFamily: fonts.display, ...typeCss(layout.valueSpec), color: colors.text, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
          >
            {counted}
          </span>
          {center.label && (
            <span
              data-donut-label=""
              {...(layout.labelFitted && { [TYPE_FIT_ATTRIBUTE]: "" })}
              style={{ fontFamily: fonts.body, ...typeCss(layout.labelSpec), color: colors.textMuted, whiteSpace: "nowrap" }}
            >
              {center.label}
            </span>
          )}
        </div>
      </div>
      <div
        data-donut-legend=""
        style={{
          position: "absolute",
          left: layout.legend.x,
          top: layout.legend.y,
          width: layout.legend.width,
          height: layout.legend.height,
          display: "grid",
          gridTemplateColumns: `repeat(${layout.columns}, ${layout.columnWidth}px)`,
          columnGap: spacing.lg,
          rowGap: spacing.xs,
          fontFamily: fonts.body,
          ...typeCss(layout.legendSpec),
        }}
      >
        {data.map((d, i) => {
          const row = arrive(theme, ms, LEGEND_AT_MS + i * step);
          const value = formatChartValue(d.value, format);
          // Only a label too long for its column is cut; a clip on one that fits would cut its descenders.
          const cut = layout.swatch + 2 * spacing.xs + textWidth(`${d.label} ${value}`, layout.legendSpec) > layout.columnWidth;
          return (
            <div
              key={i}
              data-donut-row={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.xs,
                height: layout.rowHeight,
                minWidth: 0,
                opacity: round(row.opacity, 3),
                transform: `translateY(${round((1 - row.move) * spacing.sm)}px)`,
              }}
            >
              <span style={{ flex: "none", width: layout.swatch, height: layout.swatch, borderRadius: theme.radius.sm, background: palette[i] }} />
              <span style={{ flex: "0 1 auto", minWidth: 0, color: colors.textMuted, whiteSpace: "nowrap", ...(cut && { overflow: "hidden", textOverflow: "ellipsis" }) }}>{d.label}</span>
              <span style={{ flex: "none", color: colors.text, fontWeight: weights.semibold, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
