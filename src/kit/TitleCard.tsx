// A headline card: optional kicker, title, optional subtitle, centered on the
// frame's optical center above the caption band, no wider than the text column.
// Long titles step down the type ramp until the card fits. Lands line by line
// from the scene's lead: the kicker, then the title (as a whole by default, or
// word by word for a hook; see `HeadlineText`), then the subtitle, each with a
// short `text.in` rise; holds, then leaves upward, fast, at the end.

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { accentInk, headlineColor } from "../theme/roles";
import { useSceneTime } from "./frameContext";
import { HeadlineText } from "./Headline";
import { headlineTiming, headlineWords, linePose, wordLeaving, type HeadlineMotion, type MarkStyle } from "./headlineMotion";
import { exitOpacity, fade } from "./motion";
import type { KitProps } from "./types";

export interface TitleCardProps extends KitProps {
  title: string;
  subtitle?: string;
  /** Small label above the title. */
  kicker?: string;
  /** How the title lands: as a whole (the default), word by word, or character by character. */
  titleMotion?: HeadlineMotion;
  /** One or two words of the title set in the accent. */
  emphasis?: string | string[];
  /** One word of the title marked by a sweep of the accent once it has landed. */
  mark?: string;
  markStyle?: MarkStyle;
}

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

export function TitleCard({ progress, theme, aspect, area: slot, title, subtitle, kicker, titleMotion, emphasis, mark, markStyle }: TitleCardProps) {
  const { box, step } = titleCardBox(theme, aspect, { title, subtitle, kicker }, slot);
  const time = useSceneTime(progress);
  const { leadMs, fx } = theme.motion;
  const textIn = theme.motion["text.in"];
  const opacity = Math.min(fade(fx, time.ms - leadMs), exitOpacity(theme, time, textIn.ms));
  const { colors, fonts, spacing, type } = theme;
  // Line by line: the kicker on the lead, the title a line later, the subtitle a line after the title's last word.
  const titleStart = leadMs + (kicker === undefined ? 0 : textIn.lineStaggerMs);
  const titleWords = headlineTiming(theme, headlineWords(title), titleStart, titleMotion).words;
  const subtitleStart = (titleWords.at(-1) ?? titleStart) + textIn.lineStaggerMs;
  const leaving = wordLeaving(theme, 0, 1, time.leftMs);
  const lands = (spec: TypeSpec, start: number) => {
    const pose = linePose(theme, spec.size * spec.lineHeight, time.ms - start, leaving);
    return { opacity: pose.opacity, transform: `translateY(${pose.y}px)` };
  };

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
      <div data-block="TitleCard" style={{ maxWidth: "100%" }}>
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
              ...lands(type.eyebrow[aspect], leadMs),
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
          <HeadlineText
            text={title}
            theme={theme}
            spec={type[step][aspect]}
            time={time}
            start={titleStart}
            motion={titleMotion}
            emphasis={emphasis}
            mark={mark}
            markStyle={markStyle}
          />
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
              ...lands(type.subtitle[aspect], subtitleStart),
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
