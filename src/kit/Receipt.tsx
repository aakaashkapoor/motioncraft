// A receipt for any price, bill, order or cost breakdown: a paper card in the
// theme's mono font, torn top and bottom and tilted a touch. Items sit left
// with their amounts right-aligned in tabular digits; a dashed divider comes
// before the summary (subtotal, tax, tip) and before the bold total. The card
// arrives on `enter`, then its lines print top to bottom about 90 ms apart,
// each fed out by a clip from its top like paper from a till, not faded; a
// highlighted item gets the accent's marker band once it is out, and the total
// prints last and pops as it lands.

import { contentArea } from "../layout/caption";
import { TYPE_FIT_ATTRIBUTE, typeCss } from "../layout/type";
import { mixColors, withAlpha } from "../theme/color";
import type { Theme, TypeSpec } from "../theme/types";
import { cardEntrance } from "./Card";
import { formatChartValue } from "./chart";
import { entering, useSceneTime } from "./frameContext";
import { arrive, exitOpacity, fade, pulse } from "./motion";
import { receiptFit } from "./receiptFit";
import { fitsOneLine, receiptErrors, rowLabelWidth, receiptLines, receiptTiming, type ReceiptData, type ReceiptLine } from "./receiptPlan";
import type { KitProps } from "./types";

export interface ReceiptProps extends KitProps, ReceiptData {}

/** Paper is the surface warmed this far toward a cream. */
const PAPER_WARMTH = 0.06;
const CREAM = "#f4e6c8";

const round = (n: number, places = 3) => Math.round(n * 10 ** places) / 10 ** places || 0;

/** A torn edge: a row of teeth `tooth` tall across `width`, pointing up (top) or down (bottom). */
function TornEdge({ width, tooth, color, side }: { width: number; tooth: number; color: string; side: "top" | "bottom" }) {
  const count = Math.max(1, Math.round(width / (tooth * 1.5)));
  const pitch = width / count;
  const points = [side === "top" ? `0,${tooth}` : "0,0"];
  for (let i = 0; i < count; i++) {
    const tip = side === "top" ? 0 : tooth;
    const base = side === "top" ? tooth : 0;
    points.push(`${round((i + 0.5) * pitch, 2)},${tip}`, `${round((i + 1) * pitch, 2)},${base}`);
  }
  points.push(side === "top" ? `${width},${tooth}` : `${width},0`);
  return (
    <svg width={width} height={tooth} viewBox={`0 0 ${width} ${tooth}`} aria-hidden="true" style={{ display: "block" }}>
      <polygon points={points.join(" ")} fill={color} />
    </svg>
  );
}

/**
 * One line, never wrapped. Text that would not fit `width` is cut with an
 * ellipsis; text that fits is left unclipped, as a clipping box shorter than
 * the glyphs (a tight line height) would cut their descenders.
 */
const oneLine = (text: string, width: number, spec: TypeSpec) =>
  fitsOneLine(text, width, spec) ? ({ whiteSpace: "nowrap" } as const) : ({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as const);

/** A label left and its amount right in `width`, the label giving way (ellipsized) and the amount never wrapping. */
function Row({ theme, spec, label, amount, width }: { theme: Theme; spec: TypeSpec; label: string; amount: string; width: number }) {
  const { xxs, sm } = theme.spacing;
  const room = rowLabelWidth(theme, width, amount, spec);
  return (
    // Inset a little, so a marker band behind the row (inside the line's clip) clears the text.
    <div style={{ display: "flex", alignItems: "baseline", gap: sm, position: "relative", padding: `0 ${xxs}px`, ...typeCss(spec) }}>
      <span data-receipt-label="" style={{ flex: "1 1 auto", minWidth: 0, ...oneLine(label, room, spec) }}>
        {label}
      </span>
      <span data-receipt-amount="" style={{ flex: "none", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {amount}
      </span>
    </div>
  );
}

export function Receipt(props: ReceiptProps) {
  const errors = receiptErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`Receipt: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, tilt = -2, highlight, prefix = "$", suffix = "", decimals = 2 } = props;
  const area = slot ?? contentArea(theme, aspect);
  const layout = receiptFit(theme, aspect, props, slot, tilt);
  const { box, padX, padY, tooth, divider } = layout;
  const { colors, fonts, spacing, motion, hairline, cardShadow, radius } = theme;
  const lines = receiptLines(props);
  const timing = receiptTiming(theme, lines.length);
  const time = useSceneTime(progress);
  const { ms } = time;
  const entrance = cardEntrance(arrive(theme, entering(time).ms, timing.card), theme);
  const format = { prefix, suffix, decimals };
  const money = (amount: number) => formatChartValue(amount, format);
  /** The paper's width inside its padding. */
  const inner = box.width - 2 * padX;
  const paper = mixColors(colors.surface, CREAM, PAPER_WARMTH);
  const lift = Math.min(1, Math.max(0, entrance.lift));
  const shadow = `drop-shadow(0 ${round(cardShadow.y * lift, 2)}px ${round((cardShadow.blur / 2) * lift, 2)}px ${withAlpha(colors.shadow, cardShadow.opacity * 2)})`;

  const drawLine = (line: ReceiptLine, i: number) => {
    const start = timing.lines[i]!;
    const out = fade(motion.fx, ms - start);
    const clip = { clipPath: `inset(0 0 ${round((1 - out) * 100, 1)}% 0)` };
    if (line.kind === "divider") {
      return (
        <div key={i} data-receipt-line={i} style={{ height: divider, display: "flex", alignItems: "center", ...clip }}>
          <div style={{ flex: 1, borderTop: `${hairline}px dashed ${colors.textSubtle}` }} />
        </div>
      );
    }
    if (line.kind === "title") {
      return (
        <div key={i} data-receipt-line={i} style={{ textAlign: "center", marginBottom: spacing.xs, ...typeCss({ ...layout.row, weight: theme.weights.semibold }), ...oneLine(line.label, inner, layout.row), ...clip }}>
          {line.label}
        </div>
      );
    }
    if (line.kind === "total") {
      const scale = round(1 + (motion.pop.scale - 1) * pulse(motion.pop, ms - timing.landed), 4);
      return (
        // The pop scales outside the clip, so the clip never cuts it.
        <div key={i} data-receipt-total="" style={{ transform: `scale(${scale})`, transformOrigin: "center" }}>
          <div data-receipt-line={i} style={clip}>
            <Row theme={theme} spec={layout.total} label={line.label} amount={money(line.amount)} width={inner} />
          </div>
        </div>
      );
    }
    const marked = line.kind === "item" && line.index === highlight;
    const sweep = marked ? round(fade(motion.mark, ms - start - motion.fx.ms)) : 0;
    return (
      <div key={i} data-receipt-line={i} style={{ position: "relative", ...clip }}>
        {marked && (
          <div
            data-receipt-mark={line.index}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: layout.row.size * layout.row.lineHeight,
              borderRadius: radius.sm / 2,
              backgroundColor: withAlpha(colors.accent, motion.mark.opacity),
              transform: `scaleX(${sweep})`,
              transformOrigin: "left center",
            }}
          />
        )}
        <Row theme={theme} spec={layout.row} label={line.label} amount={money(line.amount)} width={inner} />
        {line.kind === "item" && line.note !== undefined && (
          <div data-receipt-note="" style={{ position: "relative", color: colors.textMuted, paddingLeft: spacing.xs + spacing.xxs, ...typeCss(layout.note), ...oneLine(line.note, inner - spacing.xs - spacing.xxs, layout.note) }}>
            {line.note}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ position: "absolute", left: area.x, top: area.y, width: area.width, height: area.height, opacity: exitOpacity(theme, time, motion.enter.ms) }}>
      <div
        data-block="Receipt"
        style={{
          position: "absolute",
          left: box.x - area.x,
          top: box.y - area.y,
          width: box.width,
          height: box.height,
          opacity: entrance.style.opacity,
          transform: `${entrance.style.transform} rotate(${tilt}deg)`,
          filter: shadow,
        }}
      >
        <TornEdge width={box.width} tooth={tooth} color={paper} side="top" />
        <div
          {...(layout.shrunk ? { [TYPE_FIT_ATTRIBUTE]: "" } : {})}
          style={{
            boxSizing: "border-box",
            height: box.height - 2 * tooth,
            padding: `${padY}px ${padX}px`,
            backgroundColor: paper,
            color: colors.text,
            fontFamily: fonts.mono,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          {lines.map(drawLine)}
        </div>
        <TornEdge width={box.width} tooth={tooth} color={paper} side="bottom" />
      </div>
    </div>
  );
}
