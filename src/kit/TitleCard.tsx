// A headline card: optional kicker, title, optional subtitle, centered on the
// frame's optical center above the caption band, no wider than the text column.
// Long titles step down the type ramp until the card fits. Lands line by line
// from the scene's lead: the kicker, then the title (as a whole by default, or
// word by word for a hook; see `HeadlineText`), then the subtitle, each with a
// short `text.in` rise; holds, then leaves upward, fast, at the end. With a
// `logo` (the brand's own image) a mark box sits above the text: it pops in on
// the lead, and the text follows a beat later. With `lines` instead of a
// title, each line enters on its own cue (see `HeadlineLines`), and the
// subtitle follows the last.

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { accentInk, headlineColor } from "../theme/roles";
import { entering, useSceneTime } from "./frameContext";
import { HeadlineLines, HeadlineText } from "./Headline";
import { headlineLinesErrors, lineStep, linesOnOneRow, ONE_ROW_CHAR_EM, settlingLines, useHeadlineLinesCheck, useLineStarts, type HeadlineLine } from "./headlineLines";
import { headlineTiming, headlineWords, linePose, wordLeaving, type HeadlineMotion, type MarkStyle } from "./headlineMotion";
import { BrandMark } from "./BrandMark";
import { logoErrors } from "./mediaSource";
import { arrive, exitOpacity, fade } from "./motion";
import type { KitProps } from "./types";

export interface TitleCardProps extends KitProps {
  /** The title; or give `lines`. */
  title?: string;
  /** 2-4 lines instead of a title, each entering on its own cue (`at`) or the line stagger after the one before. */
  lines?: HeadlineLine[];
  subtitle?: string;
  /** Small label above the title. */
  kicker?: string;
  /** How the title lands: as a whole (the default), word by word, or character by character. */
  titleMotion?: HeadlineMotion;
  /** One or two words of the title set in the accent; with `lines`, the index of one line. */
  emphasis?: string | string[] | number;
  /** One word of the title marked by a sweep of the accent once it has landed. */
  mark?: string;
  markStyle?: MarkStyle;
  /** The brand's own image (.png, .jpg, .jpeg, .svg or .webp), relative to the storyboard, in a mark box above the text. */
  logo?: string;
}

/**
 * Problems with a TitleCard's props (its own prop check); empty if fine. Word
 * cues in `lines` are checked against `narration`, the scene's text.
 */
export function titleCardErrors(props: Record<string, unknown>, narration?: string): string[] {
  return [...logoErrors(props.logo, props.icon), ...headlineLinesErrors(props, "title", narration)];
}

/** Title steps to try, largest first. */
const TITLE_STEPS: readonly TypeRole[] = ["display", "headline", "title", "subtitle"];
// Uppercase and widely tracked: wider than average text.
const KICKER_CHAR_EM = 0.82;
/** The logo's mark box is this share of the title's size across, as on the end card. */
const MARK_EM = 0.95;

type TitleText = Pick<TitleCardProps, "title" | "subtitle" | "kicker" | "logo"> & {
  /** The texts of the title's lines, each a block of its own, in place of `title`. */
  lines?: readonly string[];
};

/** The side in px of the logo's mark box with the title at `step`. */
export function titleCardMarkSize(theme: Theme, aspect: Aspect, step: TypeRole): number {
  return Math.round(theme.type[step][aspect].size * MARK_EM);
}

/** Estimated height in px of the card's text with the title at `step` (its lines' glyphs `charEm` wide, if given). */
function estimateCardHeight(theme: Theme, aspect: Aspect, width: number, text: TitleText, step: TypeRole, charEm?: number): number {
  const { spacing, type } = theme;
  const title = type[step][aspect];
  let height = (text.lines ?? [text.title ?? ""]).reduce((sum, line) => sum + estimateTextHeight(line, width, { ...title, charEm }), 0);
  if (text.logo !== undefined) height += titleCardMarkSize(theme, aspect, step) + spacing.md;
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
 * (the content area, above the caption band, by default); with `lines`, the
 * largest at which each line also sits on one row, where one does (`lineStep`).
 * If none fits, the smallest step: the card then overflows visibly and the
 * layer-1 checks report it.
 */
export function titleCardStep(theme: Theme, aspect: Aspect, text: TitleText, area: Rect = contentArea(theme, aspect)): TypeRole {
  const fits = (step: TypeRole, charEm?: number) => estimateCardHeight(theme, aspect, area.width, text, step, charEm) <= area.height;
  const step = text.lines === undefined ? TITLE_STEPS.find((s) => fits(s)) : lineStep(theme, aspect, TITLE_STEPS, text.lines, area.width, fits);
  return step ?? TITLE_STEPS[TITLE_STEPS.length - 1]!;
}

/** The glyph width the card's lines are estimated at with the title at `step`: one row each where they fit one. */
function linesCharEm(theme: Theme, aspect: Aspect, width: number, text: TitleText, step: TypeRole): number | undefined {
  return text.lines !== undefined && linesOnOneRow(text.lines, width, theme.type[step][aspect].size) ? ONE_ROW_CHAR_EM : undefined;
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
  const height = estimateCardHeight(theme, aspect, width, text, step, linesCharEm(theme, aspect, width, text, step));
  return { box: placeBlock(area, { width, height }, blockCenterY(theme, aspect, slot)), step };
}

export function TitleCard(props: TitleCardProps) {
  const errors = logoErrors(props.logo, (props as unknown as Record<string, unknown>).icon);
  if (errors.length > 0) throw new Error(`TitleCard: ${errors.join("; ")}`);
  useHeadlineLinesCheck("TitleCard", props as unknown as Record<string, unknown>, "title");
  const { progress, theme, aspect, area: slot, title = "", lines, subtitle, kicker, titleMotion, emphasis, mark, markStyle, logo } = props;
  const { box, step } = titleCardBox(theme, aspect, { title, lines: lines?.map((line) => line.text), subtitle, kicker, logo }, slot);
  const scene = useSceneTime(progress);
  const time = entering(scene);
  const { leadMs, fx } = theme.motion;
  const textIn = theme.motion["text.in"];
  const opacity = Math.min(fade(fx, time.ms - leadMs), exitOpacity(theme, time, textIn.ms));
  const { colors, fonts, spacing, type } = theme;
  // Line by line: the logo pops in on the lead and the text starts two lines later;
  // the kicker first, the title a line later, the subtitle a line after the title's last word.
  const textStart = leadMs + (logo === undefined ? 0 : textIn.lineStaggerMs * 2);
  const titleStart = textStart + (kicker === undefined ? 0 : textIn.lineStaggerMs);
  const lineStarts = useLineStarts(theme, lines ?? [], titleStart, titleMotion);
  const lastText = lines === undefined ? title : lines.at(-1)!.text;
  const lastStart = lineStarts.at(-1) ?? titleStart;
  const titleWords = headlineTiming(theme, headlineWords(lastText), lastStart, titleMotion).words;
  const subtitleStart = (titleWords.at(-1) ?? lastStart) + textIn.lineStaggerMs;
  // After a line on its cue the subtitle builds on the scene clock too, even in a settled opening.
  const subtitleTime = lines === undefined || settlingLines(lines) === lines.length ? time : scene;
  const leaving = wordLeaving(theme, 0, 1, time.leftMs);
  const markIn = arrive(theme, time.ms, leadMs, theme.motion.pop);
  const lands = (spec: TypeSpec, start: number, at = time) => {
    const pose = linePose(theme, spec.size * spec.lineHeight, at.ms - start, leaving);
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
        {logo !== undefined && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: spacing.md }}>
            <BrandMark
              theme={theme}
              size={titleCardMarkSize(theme, aspect, step)}
              logo={logo}
              opacity={markIn.opacity * (1 - leaving)}
              scale={markIn.move}
              data={{ "data-title-part": "mark" }}
            />
          </div>
        )}
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
              ...lands(type.eyebrow[aspect], textStart),
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
          {lines === undefined ? (
            <HeadlineText
              text={title}
              theme={theme}
              spec={type[step][aspect]}
              time={scene}
              start={titleStart}
              motion={titleMotion}
              emphasis={emphasis as string | string[] | undefined}
              mark={mark}
              markStyle={markStyle}
            />
          ) : (
            <HeadlineLines
              lines={lines}
              theme={theme}
              spec={type[step][aspect]}
              time={scene}
              start={titleStart}
              motion={titleMotion}
              emphasis={emphasis as number | undefined}
              mark={mark}
              markStyle={markStyle}
            />
          )}
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
              ...lands(type.subtitle[aspect], subtitleStart, subtitleTime),
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
