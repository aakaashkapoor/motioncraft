// A headline card: optional kicker, title, optional subtitle, centered on the
// frame's optical center above the caption band, no wider than the text column.
// Long titles step down the type ramp until the card fits. Fades in with a
// slight rise, holds, then fades out.

import { interpolate } from "../engine/easing";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole } from "../theme/types";
import { accentInk, headlineColor } from "../theme/roles";
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

/** Title steps to try, largest first. */
const TITLE_STEPS: readonly TypeRole[] = ["display", "headline", "title", "subtitle"];
// Uppercase and widely tracked: wider than average text.
const KICKER_CHAR_EM = 0.82;

type TitleText = Pick<TitleCardProps, "title" | "subtitle" | "kicker">;

/** Estimated height in px of the card's text with the title at `step`. */
function estimateCardHeight(theme: Theme, aspect: Aspect, width: number, text: TitleText, step: TypeRole): number {
  const { spacing, type } = theme;
  let height = estimateTextHeight(text.title, width, type[step][aspect]);
  if (text.kicker !== undefined) {
    height += spacing.md + estimateTextHeight(text.kicker, width, { ...type.eyebrow[aspect], charEm: KICKER_CHAR_EM });
  }
  if (text.subtitle !== undefined) {
    height += spacing.md + estimateTextHeight(text.subtitle, width, type.subtitle[aspect]);
  }
  return height;
}

/**
 * The largest title step at which kicker, title and subtitle fit in `area`
 * (the content area, above the caption band, by default). If none fits, the smallest step: the card then overflows
 * visibly and the layer-1 checks report it.
 */
export function titleCardStep(theme: Theme, aspect: Aspect, text: TitleText, area: Rect = contentArea(theme, aspect)): TypeRole {
  const fits = TITLE_STEPS.find((step) => estimateCardHeight(theme, aspect, area.width, text, step) <= area.height);
  return fits ?? TITLE_STEPS[TITLE_STEPS.length - 1]!;
}

/**
 * The card's box: the text column's width (clear of the right rail), as tall
 * as its text is estimated to be, on the frame's optical center or centered
 * in its slot. Its text is centered in the box, so a short estimate never
 * moves it off center.
 */
export function titleCardBox(theme: Theme, aspect: Aspect, text: TitleText, slot?: Rect): { box: Rect; step: TypeRole } {
  const area = slot ?? contentArea(theme, aspect);
  const width = Math.min(area.width, textColumn(theme, aspect).width);
  const step = titleCardStep(theme, aspect, text, { ...area, width });
  const height = estimateCardHeight(theme, aspect, width, text, step);
  return { box: placeBlock(area, { width, height }, blockCenterY(theme, aspect, slot)), step };
}

export function TitleCard({ progress, theme, aspect, area: slot, title, subtitle, kicker }: TitleCardProps) {
  const { box, step } = titleCardBox(theme, aspect, { title, subtitle, kicker }, slot);
  const easing = themeEasing(theme);
  const opacity = presence(progress, ENTER, EXIT, easing);
  const rise = interpolate(progress, [0, ENTER], [theme.spacing.lg, 0], { easing });
  const { colors, fonts, spacing, type } = theme;

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
      <div data-block="TitleCard" style={{ transform: `translateY(${rise}px)`, maxWidth: "100%" }}>
        {kicker !== undefined && (
          <p
            style={{
              margin: 0,
              marginBottom: spacing.md,
              fontFamily: fonts.body,
              ...typeCss(type.eyebrow[aspect]),
              textTransform: "uppercase",
              color: accentInk(theme),
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
            ...typeCss(type[step][aspect]),
            color: headlineColor(theme),
            overflowWrap: "break-word",
            textWrap: "balance",
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
              ...typeCss(type.subtitle[aspect]),
              color: colors.textMuted,
              overflowWrap: "break-word",
              textWrap: "balance",
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
