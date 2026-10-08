// A headline card: optional kicker, title, optional subtitle, centered in the
// safe area above the caption band. Long titles step down the type scale until
// the card fits. Fades in with a slight rise, holds, then fades out.

import { interpolate } from "../engine/easing";
import { contentArea } from "../layout/caption";
import { estimateTextHeight } from "../layout/textFit";
import { fontSize } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeStep } from "../theme/types";
import { presence, themeEasing } from "./motion";
import type { KitProps } from "./types";

export interface TitleCardProps extends KitProps {
  title: string;
  subtitle?: string;
  /** Small label above the title. */
  kicker?: string;
}

const ENTER = 0.2;
const EXIT = 0.1;

/** Title sizes to try, largest first. */
const TITLE_STEPS: readonly TypeStep[] = ["display", "title", "subtitle"];
const TITLE_LINE_HEIGHT = 1.05;
const SUBTITLE_LINE_HEIGHT = 1.25;
// The kicker uses the browser's "normal" line height; estimate it generously.
const KICKER_LINE_HEIGHT = 1.35;
// Uppercase, semibold, with 0.12em letter spacing: wider than average text.
const KICKER_CHAR_EM = 0.82;

type TitleText = Pick<TitleCardProps, "title" | "subtitle" | "kicker">;

/** Estimated height in px of the card's text with the title at `step`. */
function estimateCardHeight(theme: Theme, aspect: Aspect, width: number, text: TitleText, step: TypeStep): number {
  const { spacing } = theme;
  let height = estimateTextHeight(text.title, width, { size: fontSize(theme, step, aspect), lineHeight: TITLE_LINE_HEIGHT });
  if (text.kicker !== undefined) {
    const size = fontSize(theme, "caption", aspect);
    height += spacing.md + estimateTextHeight(text.kicker, width, { size, lineHeight: KICKER_LINE_HEIGHT, charEm: KICKER_CHAR_EM });
  }
  if (text.subtitle !== undefined) {
    const size = fontSize(theme, "subtitle", aspect);
    height += spacing.md + estimateTextHeight(text.subtitle, width, { size, lineHeight: SUBTITLE_LINE_HEIGHT });
  }
  return height;
}

/**
 * The largest title step at which kicker, title and subtitle fit above the
 * caption band. If none fits, the smallest step: the card then overflows
 * visibly and the layer-1 checks report it.
 */
export function titleCardStep(theme: Theme, aspect: Aspect, text: TitleText): TypeStep {
  const area = contentArea(theme, aspect);
  const fits = TITLE_STEPS.find((step) => estimateCardHeight(theme, aspect, area.width, text, step) <= area.height);
  return fits ?? TITLE_STEPS[TITLE_STEPS.length - 1]!;
}

export function TitleCard({ progress, theme, aspect, title, subtitle, kicker }: TitleCardProps) {
  const area = contentArea(theme, aspect);
  const step = titleCardStep(theme, aspect, { title, subtitle, kicker });
  const easing = themeEasing(theme);
  const opacity = presence(progress, ENTER, EXIT, easing);
  const rise = interpolate(progress, [0, ENTER], [theme.spacing.lg, 0], { easing });
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
      <div style={{ transform: `translateY(${rise}px)`, maxWidth: "100%" }}>
        {kicker !== undefined && (
          <p
            style={{
              margin: 0,
              marginBottom: spacing.md,
              fontFamily: fonts.body,
              fontSize: fontSize(theme, "caption", aspect),
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: colors.accent,
              overflowWrap: "break-word",
            }}
          >
            {kicker}
          </p>
        )}
        <h1
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontSize: fontSize(theme, step, aspect),
            fontWeight: 700,
            lineHeight: TITLE_LINE_HEIGHT,
            color: colors.text,
            overflowWrap: "break-word",
          }}
        >
          {title}
        </h1>
        {subtitle !== undefined && (
          <p
            style={{
              margin: 0,
              marginTop: spacing.md,
              fontFamily: fonts.body,
              fontSize: fontSize(theme, "subtitle", aspect),
              lineHeight: SUBTITLE_LINE_HEIGHT,
              color: colors.muted,
              overflowWrap: "break-word",
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
