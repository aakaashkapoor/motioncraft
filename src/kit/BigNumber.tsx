// A big stat as an odometer (design v3, life #7): the number's digits roll
// into place in columns, each a full turn and on to its digit on the `count`
// token, the rightmost first and each one to its left `staggerMs` later,
// blurred vertically while they move. An accent bar fills under the number in
// the same window. As the last digit lands the number pops (`pop`, out and
// back) and a shine crosses it once; its unit (the suffix) fades in a beat
// later. An optional prefix sits before it and a label below, and the block
// arrives as the scene's hero (`enter.hero`) on the frame's optical center,
// holds, then exits fast. Model: number-flow (MIT), its per-digit columns.
//
// Rolling digits are drawn by CSS (`content`), not set as text, so the page
// holds no half-rolled numbers: the number is its `aria-label` while it rolls
// and plain text once it has landed.

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import { AVG_CHAR_EM, estimateTextHeight } from "../layout/textFit";
import { fontSize, typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole } from "../theme/types";
import { headlineColor } from "../theme/roles";
import { useSceneTime } from "./frameContext";
import { arrive, exitOpacity, fade, pulse, tween } from "./motion";
import { shineText } from "./shine";
import type { KitProps } from "./types";

export interface BigNumberProps extends KitProps {
  value: number;
  /** Shown before the number, e.g. "$". */
  prefix?: string;
  /** The unit, shown after the number once it lands, e.g. "%" or "x". */
  suffix?: string;
  /** Text below the number. */
  label?: string;
  /** Digits after the decimal point. Default 0. */
  decimals?: number;
}

/** Separators and the decimal point are narrow: about half a digit. */
const NARROW_CHAR_EM = AVG_CHAR_EM / 2;
const NARROW = new Set([",", ".", " ", "'", ":"]);

/** Estimated width of `text` in em: digits and signs at the average glyph width, separators at half. */
function textEm(text: string): number {
  return [...text].reduce((sum, ch) => sum + (NARROW.has(ch) ? NARROW_CHAR_EM : AVG_CHAR_EM), 0);
}

/** Number steps to try, largest first: the ramp's `numeral`, then smaller steps for long numbers. */
const NUMBER_STEPS: readonly TypeRole[] = ["numeral", "hero", "display", "headline"];

/** `value` with thousands separators and exactly `decimals` digits after the point. */
export function formatBigNumber(value: number, decimals: number): string {
  const digits = Math.max(0, Math.min(20, Math.floor(decimals)));
  const text = value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  // Rounding a small negative to zero leaves a stray "-0".
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text;
}

/**
 * The largest step at which `text` fits on one line of `width` px (the content
 * area by default). If
 * none fits, the smallest step: the number then overflows visibly and the
 * layer-1 checks report it.
 */
export function bigNumberStep(theme: Theme, aspect: Aspect, text: string, width = contentArea(theme, aspect).width): TypeRole {
  const fits = NUMBER_STEPS.find((step) => textEm(text) * fontSize(theme, step, aspect) <= width);
  return fits ?? NUMBER_STEPS[NUMBER_STEPS.length - 1]!;
}

const isDigit = (ch: string) => ch >= "0" && ch <= "9";

/** When a number of `digits` digits rolls and lands, in scene ms. */
export interface BigNumberTiming {
  /** The rightmost digit starts to roll (and the bar to fill): the scene's lead. */
  startMs: number;
  /** The leftmost digit lands: the bar is full, the number pops and the shine sets off. */
  landMs: number;
  /** The unit starts to fade in. */
  unitMs: number;
}

export function bigNumberTiming(theme: Theme, digits: number): BigNumberTiming {
  const { leadMs, count } = theme.motion;
  const landMs = leadMs + Math.max(0, digits - 1) * count.staggerMs + count.ms;
  return { startMs: leadMs, landMs, unitMs: landMs + count.unitDelayMs };
}

/** One digit's column of the odometer. */
export interface OdometerColumn {
  /** The digit it lands on. */
  digit: number;
  /** How far it has rolled, in digits: from 0 at rest to a full turn and on to its digit (10 + `digit`) once landed. */
  roll: number;
  /** Vertical blur in px while it rolls: `blurMaxPx` as it sets off, easing to `blurMinPx` as it slows; 0 at rest. */
  blur: number;
}

/**
 * The columns of `text` (a formatted number), left to right, `ms` into the
 * scene. A full turn means every column moves, zeros too.
 */
export function odometerColumns(theme: Theme, ms: number, text: string): OdometerColumn[] {
  const { leadMs, count } = theme.motion;
  const digits = [...text].filter(isDigit).map(Number);
  return digits.map((digit, i) => {
    const place = digits.length - 1 - i;
    const elapsed = ms - leadMs - place * count.staggerMs;
    const rolled = tween(count, elapsed);
    // On the count's ease-out, the share of the roll still to go is the digit's speed.
    const speed = 1 - Math.min(1, Math.max(0, rolled));
    const moving = elapsed > 0 && elapsed < count.ms;
    return { digit, roll: (10 + digit) * rolled, blur: moving ? count.blurMinPx + (count.blurMaxPx - count.blurMinPx) * speed : 0 };
  });
}

/** The number as the odometer reads `ms` into the scene: each column's nearest digit, separators in place. */
export function odometerText(theme: Theme, ms: number, text: string): string {
  const columns = odometerColumns(theme, ms, text);
  let i = 0;
  return [...text].map((ch) => (isDigit(ch) ? String(Math.round(columns[i++]!.roll) % 10) : ch)).join("");
}

// `|| 0` turns -0 into 0.
const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places || 0;

/** Draws a glyph from its attribute, so a rolling digit is not text on the page. */
const GLYPH_CSS = "[data-odometer-glyph]::before{content:attr(data-odometer-glyph)}";
const blurId = (px: number) => `motioncraft-odometer-blur-${Math.round(px * 100)}`;

/** A digit `offset` lines below its column's window (negative: above), fading as it leaves. */
function Cell({ digit, offset, pitch, stacked }: { digit: number; offset: number; pitch: number; stacked: boolean }) {
  const place = stacked ? ({ position: "absolute", left: 0, top: 0 } as const) : {};
  return (
    <span
      data-odometer-glyph={String(digit % 10)}
      style={{ ...place, display: "inline-block", transform: `translateY(${round(offset * pitch)}px)`, opacity: round(1 - Math.abs(offset), 3) }}
    />
  );
}

/**
 * One rolling column: a window one line tall, its two nearest digits moving up
 * through it and cross-fading. The first sets the column's width and baseline.
 */
function Column({ column, place, pitch }: { column: OdometerColumn; place: number; pitch: number }) {
  const lower = Math.floor(column.roll);
  const f = column.roll - lower;
  const blur = round(column.blur);
  return (
    <span
      data-odometer-column={place}
      style={{ display: "inline-block", position: "relative", verticalAlign: "top", height: pitch, overflow: "hidden", filter: blur > 0 ? `url(#${blurId(blur)})` : undefined }}
    >
      <Cell digit={lower} offset={-f} pitch={pitch} stacked={false} />
      {f > 0 && <Cell digit={lower + 1} offset={1 - f} pitch={pitch} stacked />}
    </span>
  );
}

/** The number while it rolls: a column per digit, separators drawn in place, and the blur filters the columns use. */
function Rolling({ theme, ms, text, pitch }: { theme: Theme; ms: number; text: string; pitch: number }) {
  const columns = odometerColumns(theme, ms, text);
  const blurs = [...new Set(columns.map((c) => round(c.blur)).filter((b) => b > 0))];
  let i = 0;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLYPH_CSS }} />
      {blurs.length > 0 && (
        <svg width={0} height={0} aria-hidden="true" style={{ position: "absolute" }}>
          {blurs.map((b) => (
            <filter key={b} id={blurId(b)} x="0" y="-50%" width="100%" height="200%" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={`0 ${b}`} />
            </filter>
          ))}
        </svg>
      )}
      {[...text].map((ch, k) => {
        if (!isDigit(ch)) return <span key={k} data-odometer-glyph={ch} />;
        const place = columns.length - 1 - i;
        return <Column key={k} column={columns[i++]!} place={place} pitch={pitch} />;
      })}
    </>
  );
}

export function BigNumber({ progress, theme, aspect, area: slot, value, prefix = "", suffix = "", label, decimals = 0 }: BigNumberProps) {
  const area = slot ?? contentArea(theme, aspect);
  const number = formatBigNumber(value, decimals);
  const finalText = `${prefix}${number}${suffix}`;
  const step = bigNumberStep(theme, aspect, finalText, area.width);
  const spec = theme.type[step][aspect];
  const size = spec.size;
  /** One line of the number: a digit column's window, and how far a digit rolls to the next. */
  const pitch = size * spec.lineHeight;
  const { colors, fonts, spacing, motion } = theme;
  // The label is free-standing text: no wider than the text column, clear of the right rail.
  const labelWidth = Math.min(area.width, textColumn(theme, aspect).width);
  const labelSpec = theme.type.subtitle[aspect];
  // The bar sits clear of the commas, which hang below the number's tight line.
  const barGap = spacing.md;
  const height =
    pitch + barGap + spacing.xxs + (label === undefined ? 0 : spacing.md + estimateTextHeight(label, labelWidth, labelSpec));
  const box = placeBlock(area, { width: area.width, height }, blockCenterY(theme, aspect, slot));
  const time = useSceneTime(progress);
  const hero = motion["enter.hero"];
  const { move, opacity: fadeIn } = arrive(theme, time.ms, motion.leadMs, hero);
  const opacity = Math.min(fadeIn, exitOpacity(theme, time, hero.ms));
  const rise = Math.round((1 - move) * spacing.lg * 100) / 100;

  const timing = bigNumberTiming(theme, [...number].filter(isDigit).length);
  const landed = time.ms >= timing.landMs;
  // The bar fills over the whole roll, first digit to last, on the count's curve.
  const bar = round(Math.min(area.width, textEm(finalText) * size));
  const filled = round(bar * tween({ ms: timing.landMs - timing.startMs, curve: motion.count.curve }, time.ms - timing.startMs));
  const scale = round(1 + (motion.pop.scale - 1) * pulse(motion.pop, time.ms - timing.landMs), 5);
  const color = headlineColor(theme);
  const shine = shineText(theme, { width: Math.min(area.width, textEm(prefix + number) * size), height: pitch }, time.ms - timing.landMs, color);

  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        opacity,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div
        data-block="BigNumber"
        style={{
          transform: `translateY(${rise}px)`,
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <h1
          aria-label={finalText}
          style={{
            margin: 0,
            fontFamily: fonts.display,
            ...typeCss(spec),
            fontVariantNumeric: "tabular-nums",
            // Rolling columns and the landed text set the same glyphs at the same advances.
            fontKerning: "none",
            whiteSpace: "nowrap",
            color,
            transform: `scale(${scale})`,
          }}
        >
          <span data-number="" style={shine}>
            {prefix}
            {landed ? number : <Rolling theme={theme} ms={time.ms} text={number} pitch={pitch} />}
          </span>
          {suffix !== "" && (
            // The unit takes no room until it arrives, so the rolling digits sit centered; then its room
            // opens (the number makes way, as in number-flow) while it fades in.
            <span
              data-unit=""
              style={{
                display: "inline-block",
                width: `calc-size(max-content, size * ${round(tween(motion.enter, time.ms - timing.unitMs), 3)})`,
                opacity: round(fade(motion["fx.fast"], time.ms - timing.unitMs), 3),
              }}
            >
              {suffix}
            </span>
          )}
        </h1>
        <div
          data-bar-track=""
          style={{
            width: bar,
            height: spacing.xxs,
            marginTop: barGap,
            borderRadius: spacing.xxs / 2,
            backgroundColor: colors.border,
          }}
        >
          <div data-bar-fill="" style={{ width: filled, height: "100%", borderRadius: spacing.xxs / 2, backgroundColor: colors.accent }} />
        </div>
        {label !== undefined && (
          <p
            style={{
              margin: 0,
              marginTop: spacing.md,
              maxWidth: labelWidth,
              fontFamily: fonts.body,
              ...typeCss(labelSpec),
              color: colors.textMuted,
              overflowWrap: "break-word",
              textWrap: "balance",
            }}
          >
            {label}
          </p>
        )}
      </div>
    </div>
  );
}
