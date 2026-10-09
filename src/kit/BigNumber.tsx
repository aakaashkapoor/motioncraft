// A big stat: a number that counts up from 0 (the `count` token, about a
// second from the scene's lead), with an optional prefix/suffix and a label
// below, on the frame's optical center. An accent underline grows with the
// count. Arrives as the scene's hero (`enter.hero`), holds, then exits fast.

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import { AVG_CHAR_EM, estimateTextHeight } from "../layout/textFit";
import { fontSize, typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole } from "../theme/types";
import { headlineColor } from "../theme/roles";
import { useSceneTime } from "./frameContext";
import { arrive, exitOpacity, tween } from "./motion";
import type { KitProps } from "./types";

export interface BigNumberProps extends KitProps {
  value: number;
  /** Shown before the number, e.g. "$". */
  prefix?: string;
  /** Shown after the number, e.g. "%" or "x". */
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

/** The number shown `ms` into the scene: rolls from 0 to `value` over the `count` token, from the scene's lead. */
export function countedValue(theme: Theme, ms: number, value: number): number {
  return value * tween(theme.motion.count, ms - theme.motion.leadMs);
}

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

export function BigNumber({ progress, theme, aspect, area: slot, value, prefix = "", suffix = "", label, decimals = 0 }: BigNumberProps) {
  const area = slot ?? contentArea(theme, aspect);
  const finalText = `${prefix}${formatBigNumber(value, decimals)}${suffix}`;
  const step = bigNumberStep(theme, aspect, finalText, area.width);
  const spec = theme.type[step][aspect];
  const size = spec.size;
  const { colors, fonts, spacing } = theme;
  // The label is free-standing text: no wider than the text column, clear of the right rail.
  const labelWidth = Math.min(area.width, textColumn(theme, aspect).width);
  const labelSpec = theme.type.subtitle[aspect];
  const height =
    size * spec.lineHeight + spacing.xs + spacing.xxs + (label === undefined ? 0 : spacing.md + estimateTextHeight(label, labelWidth, labelSpec));
  const box = placeBlock(area, { width: area.width, height }, blockCenterY(theme, aspect, slot));
  const time = useSceneTime(progress);
  const hero = theme.motion["enter.hero"];
  const { move, opacity: fadeIn } = arrive(theme, time.ms, theme.motion.leadMs, hero);
  const opacity = Math.min(fadeIn, exitOpacity(theme, time, hero.ms));
  const rise = Math.round((1 - move) * spacing.lg * 100) / 100;
  const counted = countedValue(theme, time.ms, value);
  const fullUnderline = Math.min(area.width, textEm(finalText) * size);
  const underline = value === 0 ? fullUnderline : fullUnderline * (counted / value);

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
          style={{
            margin: 0,
            fontFamily: fonts.display,
            ...typeCss(spec),
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            color: headlineColor(theme),
          }}
        >
          {prefix}
          {formatBigNumber(counted, decimals)}
          {suffix}
        </h1>
        <div
          data-underline="true"
          style={{
            width: underline,
            height: spacing.xxs,
            marginTop: spacing.xs,
            borderRadius: spacing.xxs / 2,
            backgroundColor: colors.accent,
          }}
        />
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
