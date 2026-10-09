// A big stat: a number that counts up from 0 over the first half of the scene,
// with an optional prefix/suffix and a label below. An accent underline grows
// with the count. Fades in with a slight rise, holds, then fades out.

import { interpolate, type Easing } from "../engine/easing";
import { contentArea } from "../layout/caption";
import { AVG_CHAR_EM } from "../layout/textFit";
import { fontSize, typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole } from "../theme/types";
import { headlineColor } from "../theme/roles";
import { presence, themeEasing } from "./motion";
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

const ENTER = 0.2;
const EXIT = 0.1;
/** The count finishes at this fraction of the scene, then holds. */
const COUNT_END = 0.5;

/** Number steps to try, largest first: the ramp's `numeral`, then smaller steps for long numbers. */
const NUMBER_STEPS: readonly TypeRole[] = ["numeral", "hero", "display", "headline"];

const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;

/** The number shown at `progress`: eases out from 0 to `value` by mid-scene. */
export function countedValue(progress: number, value: number): number {
  return interpolate(progress, [0, COUNT_END], [0, value], { easing: easeOutCubic });
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
  const fits = NUMBER_STEPS.find((step) => text.length * fontSize(theme, step, aspect) * AVG_CHAR_EM <= width);
  return fits ?? NUMBER_STEPS[NUMBER_STEPS.length - 1]!;
}

export function BigNumber({ progress, theme, aspect, area: slot, value, prefix = "", suffix = "", label, decimals = 0 }: BigNumberProps) {
  const area = slot ?? contentArea(theme, aspect);
  const finalText = `${prefix}${formatBigNumber(value, decimals)}${suffix}`;
  const step = bigNumberStep(theme, aspect, finalText, area.width);
  const spec = theme.type[step][aspect];
  const size = spec.size;
  const easing = themeEasing(theme);
  const opacity = presence(progress, ENTER, EXIT, easing);
  const rise = interpolate(progress, [0, ENTER], [theme.spacing.lg, 0], { easing });
  const counted = countedValue(progress, value);
  const fullUnderline = Math.min(area.width, finalText.length * size * AVG_CHAR_EM);
  const underline = value === 0 ? fullUnderline : fullUnderline * (counted / value);
  const { colors, fonts, spacing } = theme;

  return (
    <div
      style={{
        position: "absolute",
        left: area.x,
        top: area.y,
        width: area.width,
        height: area.height,
        opacity,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div
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
              fontFamily: fonts.body,
              ...typeCss(theme.type.subtitle[aspect]),
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
