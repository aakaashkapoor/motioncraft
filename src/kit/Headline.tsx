// The kinetic headline (design v3, life #3 and #6). `HeadlineText` draws a
// headline's words inside the heading its parent sets in a ramp step
// (Section, SceneFrame, TitleCard and `Headline` itself): the line lands as a
// whole by default, or word by word, each word rising through a clipped line,
// or character by character; at the end the words leave upward. One or two
// words may be set in the accent, and one word marked by an accent bar (or an
// underline) that sweeps in from the left once the text has landed.
// `Headline` is the same text as a kit component of its own: a hook, an end
// line, or a statement in another component's slot.

import { Fragment, type ReactNode } from "react";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { glyphPad, TEXT_PIECES_ATTRIBUTE, textBoxHeight, typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { withAlpha } from "../theme/color";
import { accentInk, headlineColor } from "../theme/roles";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { useSceneTime, type SceneTime } from "./frameContext";
import {
  charPose,
  HEADLINE_MOTIONS,
  headlineMarks,
  headlineTiming,
  headlineWords,
  leavingPose,
  linePose,
  MARK_STYLES,
  markSweep,
  wordLeaving,
  wordPose,
  type HeadlineMotion,
  type MarkStyle,
  type TextPose,
} from "./headlineMotion";
import type { KitProps } from "./types";

export { HEADLINE_MOTIONS, MARK_STYLES, headlineMarks, headlineTiming, headlineWords, markSweep, wordLeaving };
export type { HeadlineMarks, HeadlineMotion, HeadlineTiming, MarkStyle } from "./headlineMotion";

// The bar sits on the word's line like a highlighter stroke: from this share
// of the line's height down to this share above its foot ...
const BAR_TOP_SHARE = 0.2;
const BAR_BOTTOM_SHARE = 0.04;
/** ... and reaches this many em past each side of the word. */
const BAR_OVERHANG_EM = 0.08;
/** A clipped line reaches this many em past each side of its word, so ink and blur at the edges are not cut. */
const CLIP_SIDE_EM = 0.12;

export interface HeadlineTextProps {
  text: string;
  theme: Theme;
  /** The ramp step the parent sets the text in: motion is measured in its lines. */
  spec: TypeSpec;
  /** Where the parent is in its scene. */
  time: SceneTime;
  /** When the headline starts to land, in ms on `time`'s clock. */
  start: number;
  /** How it lands. Default `whole`. */
  motion?: HeadlineMotion;
  /** One or two words set in the accent: a phrase, or a list of words. */
  emphasis?: string | readonly string[];
  /** One word marked by a sweep of the accent once the text has landed. */
  mark?: string;
  /** How the mark is drawn. Default `bar`. */
  markStyle?: MarkStyle;
  /** Attributes for each word's element, so a parent can find its words. */
  wordAttributes?: Record<`data-${string}`, string>;
}

const oneOf = (options: readonly string[]) => options.map((o) => `"${o}"`).join(", ");

const moved = (pose: TextPose) => ({
  opacity: pose.opacity,
  transform: pose.scaleY === 1 ? `translateY(${pose.y}px)` : `translateY(${pose.y}px) scaleY(${pose.scaleY})`,
  ...(pose.blur > 0 && { filter: `blur(${pose.blur}px)` }),
});

export function HeadlineText({ text, theme, spec, time, start, motion = "whole", emphasis, mark, markStyle = "bar", wordAttributes }: HeadlineTextProps) {
  if (!HEADLINE_MOTIONS.includes(motion)) throw new Error(`headline motion must be one of ${oneOf(HEADLINE_MOTIONS)} (got ${JSON.stringify(motion)})`);
  if (!MARK_STYLES.includes(markStyle)) throw new Error(`markStyle must be one of ${oneOf(MARK_STYLES)} (got ${JSON.stringify(markStyle)})`);
  const words = headlineWords(text);
  const marks = headlineMarks(words, emphasis, mark);
  const timing = headlineTiming(theme, words, start, motion);
  const line = spec.size * spec.lineHeight;
  const { colors, motion: tokens, radius } = theme;
  const em = (n: number) => Math.round(n * spec.size * 100) / 100;
  const share = (n: number) => Math.round(n * line * 100) / 100;

  // A word on its bar keeps the text color, so it reads whatever the headline's color.
  const colorOf = (i: number) => (marks.emphasis.includes(i) ? accentInk(theme) : marks.mark === i && markStyle === "bar" ? colors.text : undefined);

  const markOf = (leaving: number) => {
    const sweep = markSweep(theme, time.ms - timing.mark);
    const bar = markStyle === "bar";
    return (
      <span
        data-headline-mark={markStyle}
        style={{
          position: "absolute",
          left: -em(BAR_OVERHANG_EM),
          right: -em(BAR_OVERHANG_EM),
          ...(bar
            ? { top: share(BAR_TOP_SHARE), bottom: share(BAR_BOTTOM_SHARE), backgroundColor: withAlpha(colors.accent, tokens.mark.opacity), borderRadius: radius.sm }
            : { bottom: 0, height: tokens.mark.underlinePx, backgroundColor: colors.accent, borderRadius: tokens.mark.underlinePx / 2 }),
          transformOrigin: "left center",
          transform: bar ? `rotate(${-tokens.mark.tiltDeg}deg) scaleX(${sweep})` : `scaleX(${sweep})`,
          opacity: 1 - leaving,
        }}
      />
    );
  };

  /** The marked word sits in a slot with its mark drawn underneath. */
  const slotted = (i: number, word: ReactNode, leaving: number, inline: boolean) =>
    marks.mark !== i ? (
      word
    ) : (
      <span data-headline-slot="" style={{ position: "relative", display: "inline-block", ...(!inline && { verticalAlign: "top" }), maxWidth: "100%" }}>
        {markOf(leaving)}
        {word}
      </span>
    );

  if (motion === "whole") {
    // The line moves as one; only words that carry the accent or the mark need an element of their own.
    const pieces: ReactNode[] = [];
    let run = "";
    words.forEach((word, i) => {
      const space = i > 0 ? " " : "";
      if (colorOf(i) === undefined && marks.mark !== i) {
        run += space + word;
        return;
      }
      if (run + space !== "") pieces.push(run + space);
      run = "";
      pieces.push(
        <Fragment key={i}>
          {slotted(
            i,
            <span {...wordAttributes} data-headline-word={i} style={{ position: "relative", color: colorOf(i) }}>
              {word}
            </span>,
            0,
            true,
          )}
        </Fragment>,
      );
    });
    if (run !== "") pieces.push(run);
    const pose = linePose(theme, line, time.ms - start, wordLeaving(theme, 0, 1, time.leftMs));
    return (
      <span data-headline-line="" style={{ display: "block", ...moved(pose) }}>
        {pieces}
      </span>
    );
  }

  // Words and characters rise inside a clip as tall as the glyphs, so they come up from under the line.
  const pad = glyphPad(spec);
  const side = em(CLIP_SIDE_EM);
  const clip = (inner: ReactNode) => (
    <span
      data-headline-clip=""
      style={{ position: "relative", display: "inline-block", verticalAlign: "top", maxWidth: "100%", overflow: "hidden", padding: `${pad}px ${side}px`, margin: `${-pad}px ${-side}px` }}
    >
      {inner}
    </span>
  );

  return words.map((word, i) => {
    const leaving = wordLeaving(theme, i, words.length, time.leftMs);
    const pose = motion === "words" ? wordPose(theme, line, time.ms - timing.words[i]!, leaving) : leavingPose(line, leaving);
    const chars =
      motion === "chars"
        ? [...word].map((char, c) => (
            <span key={c} data-headline-char="" style={{ display: "inline-block", transformOrigin: "50% 100%", ...moved(charPose(theme, line, time.ms - timing.chars[i]![c]!)) }}>
              {char}
            </span>
          ))
        : word;
    // A word drawn a character at a time is still one word to the checks.
    const pieces = motion === "chars" ? { [TEXT_PIECES_ATTRIBUTE]: "" } : {};
    return (
      <Fragment key={i}>
        {i > 0 && " "}
        {slotted(
          i,
          clip(
            <span {...wordAttributes} data-headline-word={i} {...pieces} style={{ display: "inline-block", maxWidth: "100%", color: colorOf(i), ...moved(pose) }}>
              {chars}
            </span>,
          ),
          leaving,
          false,
        )}
      </Fragment>
    );
  });
}

/** Steps a `Headline` may be set in, largest first. */
export const HEADLINE_ROLES = ["hero", "display", "headline", "title"] as const;
export type HeadlineRole = (typeof HEADLINE_ROLES)[number];
/** Below its smallest role a headline that still does not fit drops to this, and overflows visibly for the checks. */
const LAST_STEP: TypeRole = "subtitle";

export interface HeadlineProps extends KitProps {
  text: string;
  /** The largest step to set it in; it steps down the ramp until it fits. Default `hero`. */
  role?: HeadlineRole;
  /** How it lands: as a whole (the default), word by word, or character by character. */
  motion?: HeadlineMotion;
  /** One or two words set in the accent. */
  emphasis?: string | string[];
  /** One word marked by a sweep of the accent once the text has landed. */
  mark?: string;
  markStyle?: MarkStyle;
}

/**
 * The headline's box: the text column's width, as tall as its text, on the
 * frame's optical center or centered in its slot; and the step it is set in,
 * the largest from `role` down at which it fits.
 */
export function headlineBox(theme: Theme, aspect: Aspect, text: string, role: HeadlineRole = "hero", slot?: Rect): { box: Rect; step: TypeRole } {
  if (!HEADLINE_ROLES.includes(role)) throw new Error(`Headline: role must be one of ${oneOf(HEADLINE_ROLES)} (got ${JSON.stringify(role)})`);
  const area = slot ?? contentArea(theme, aspect);
  const width = Math.min(area.width, textColumn(theme, aspect).width);
  const steps: TypeRole[] = [...HEADLINE_ROLES.slice(HEADLINE_ROLES.indexOf(role)), LAST_STEP];
  const heightAt = (step: TypeRole) => textBoxHeight(text, width, theme.type[step][aspect]);
  const step = steps.find((s) => heightAt(s) <= area.height) ?? LAST_STEP;
  return { box: placeBlock(area, { width, height: heightAt(step) }, blockCenterY(theme, aspect, slot)), step };
}

export function Headline({ progress, theme, aspect, area, text, role, motion, emphasis, mark, markStyle }: HeadlineProps) {
  const { box, step } = headlineBox(theme, aspect, text, role, area);
  const time = useSceneTime(progress);
  const spec = theme.type[step][aspect];
  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <h1
        data-block="Headline"
        style={{
          margin: 0,
          boxSizing: "border-box",
          maxWidth: "100%",
          padding: `${glyphPad(spec)}px 0`,
          fontFamily: theme.fonts.display,
          ...typeCss(spec),
          color: headlineColor(theme),
          textAlign: "center",
          textWrap: "balance",
          overflowWrap: "break-word",
        }}
      >
        <HeadlineText text={text} theme={theme} spec={spec} time={time} start={theme.motion.leadMs} motion={motion} emphasis={emphasis} mark={mark} markStyle={markStyle} />
      </h1>
    </div>
  );
}
