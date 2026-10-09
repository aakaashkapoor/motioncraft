// A burned-in caption with word highlights (design v3, life #4): the
// narration a page of a few words at a time, centered in the caption band
// (see `layout/caption`). The word being spoken lights up in the accent and
// scales up a touch, and each page enters with a small scale and rise.
// `standard` sets 3-6 words in the ramp's `subtitle` on a plate; `punch` sets
// 1-3 uppercase words in its `headline` on a dark outline. Captions follow
// speech: they fade in quickly on the scene's lead and leave fast at its end.

import { Fragment, type CSSProperties } from "react";
import { CAPTION_PAGE_WORDS, captionBand, captionType, type ShownCaptionStyle } from "../layout/caption";
import type { Aspect } from "../layout/frame";
import { AVG_CHAR_EM, charsPerLine } from "../layout/textFit";
import { TYPE_FIT_ATTRIBUTE, typeCss } from "../layout/type";
import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from "../storyboard/types";
import { mixColors } from "../theme/color";
import { readableColor, relativeLuminance } from "../theme/contrast";
import { accentInk } from "../theme/roles";
import type { Theme } from "../theme/types";
import type { CaptionLimits } from "./captionPages";
import { evenWordTimes, pageIndexAt, timedPages, wordLight, type TimedPage, type TimedWord } from "./captionWords";
import { useSceneTime } from "./frameContext";
import { exitMs, exitOpacity, fade, tween } from "./motion";
import type { KitProps } from "./types";

export interface CaptionProps extends KitProps {
  text: string;
  /** Defaults to `standard`; `off` draws nothing. */
  captionStyle?: CaptionStyle;
}

/** How much caption text fits on one page for a theme, aspect and style (an estimate). */
export function captionLimits(theme: Theme, aspect: Aspect, style: ShownCaptionStyle = "standard"): CaptionLimits {
  const band = captionBand(theme, aspect);
  const spec = captionType(theme, aspect, style);
  // Generous for bold text and heavy capitals alike, so estimated lines err short.
  const maxCharsPerLine = charsPerLine(band.width - 2 * theme.spacing.md, spec.size);
  const room = band.height - 2 * theme.spacing.xs - theme.motion.caption.risePx;
  const maxLines = Math.max(1, Math.floor(room / (spec.size * spec.lineHeight)));
  const { min, max } = CAPTION_PAGE_WORDS[style];
  return { maxCharsPerLine, maxLines, minWords: min, maxWords: max };
}

/**
 * The caption's words, spoken evenly from the scene's lead until its exit
 * begins (the scene's last frame is at `endMs`), and the pages they make.
 */
export function captionTrack(
  theme: Theme,
  aspect: Aspect,
  text: string,
  style: ShownCaptionStyle,
  endMs: number,
): { words: TimedWord[]; pages: TimedPage[] } {
  const words = evenWordTimes(text, theme.motion.leadMs, endMs - exitMs(theme, theme.motion.fx.ms));
  return { words, pages: timedPages(words, captionLimits(theme, aspect, style)) };
}

export interface CaptionColors {
  /** The page's letters. */
  text: string;
  /** The spoken word's letters, once fully lit. */
  active: string;
  /** The punch style's outline. */
  stroke?: string;
}

/**
 * A caption style's colors. Standard sets the text color on the ground's
 * plate; punch the lightest neutral on an outline of the darker of text and
 * ground. The spoken word turns the accent, deepened until it reads. On an
 * accent plate it is `accentText` instead (standard) or keeps its color (punch).
 */
export function captionColors(theme: Theme, style: ShownCaptionStyle): CaptionColors {
  const { colors } = theme;
  const plate = theme.caption.highlight === "plate";
  if (style === "standard") return { text: colors.text, active: plate ? colors.accentText : accentInk(theme) };
  const byLuminance = (list: string[]) => list.sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
  const stroke = byLuminance([colors.text, colors.ground])[0]!;
  const text = byLuminance([colors.text, colors.ground, colors.surface]).at(-1)!;
  return { text, active: plate ? text : readableColor(colors.accent, text, [stroke]), stroke };
}

export function Caption({ progress, theme, aspect, text, captionStyle = DEFAULT_CAPTION_STYLE }: CaptionProps) {
  const time = useSceneTime(progress);
  if (captionStyle === "off") return null;
  const { words, pages } = captionTrack(theme, aspect, text, captionStyle, time.endMs);
  if (pages.length === 0) return null;
  const page = pages[pageIndexAt(pages, time.ms)]!;
  const shown = words.slice(page.start, page.end);

  const band = captionBand(theme, aspect);
  const { leadMs, fx, caption: motion } = theme.motion;
  const opacity = Math.min(fade(fx, time.ms - leadMs), exitOpacity(theme, time, fx.ms));
  const enter = tween(motion, time.ms - page.startMs);
  const pageScale = 1 - (1 - motion.fromScale) * (1 - enter);
  const pageRise = motion.risePx * (1 - enter);

  // A word longer than a line shrinks the page, and the outline with it, until it fits.
  const punch = captionStyle === "punch";
  const spec = captionType(theme, aspect, captionStyle);
  const longest = Math.max(...shown.map((word) => word.text.length));
  const fit = Math.min(1, captionLimits(theme, aspect, captionStyle).maxCharsPerLine / longest);
  const size = fit < 1 ? Math.floor(spec.size * fit) : spec.size;
  const strokePx = (theme.caption.strokePx * size) / spec.size;
  const { highlight, platePadX, platePadY } = theme.caption;
  // A lit word grows into the spaces beside it (estimated for the page's longest word); so do the outline and the plate.
  const growPx = ((motion.wordScale - 1) / 2) * longest * AVG_CHAR_EM * size;
  const wordSpacing = growPx + (punch ? strokePx : 0) + (highlight === "plate" ? platePadX : 0);
  const colors = captionColors(theme, captionStyle);
  const ramp = { ms: motion.wordMs, curve: theme.motion["fx.fast"].curve };

  const wordStyle = (word: TimedWord): CSSProperties => {
    const light = wordLight(word, time.ms, ramp);
    const lit: CSSProperties = { display: "inline-block", transform: `scale(${1 + (motion.wordScale - 1) * light})` };
    if (highlight === "plate") {
      // The plate switches at half light, so the letters always read on what is behind them.
      const on = light >= 0.5;
      return {
        ...lit,
        color: on ? colors.active : colors.text,
        // Every word carries the padding, taken back by its margin, so lines never reflow.
        padding: `${platePadY}px ${platePadX}px`,
        margin: `-${platePadY}px -${platePadX}px`,
        borderRadius: theme.radius.sm,
        backgroundColor: on ? theme.colors.accent : "transparent",
      };
    }
    const color = light <= 0 ? colors.text : light >= 1 ? colors.active : mixColors(colors.text, colors.active, light);
    return { ...lit, color };
  };

  return (
    <div
      style={{
        position: "absolute",
        left: band.x,
        top: band.y,
        width: band.width,
        height: band.height,
        // A page rests a rise above the band's bottom and enters from there.
        paddingBottom: motion.risePx,
        boxSizing: "border-box",
        opacity,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <p
        data-block="Caption"
        {...(fit < 1 ? { [TYPE_FIT_ATTRIBUTE]: "" } : {})}
        style={{
          margin: 0,
          maxWidth: "100%",
          boxSizing: "border-box",
          padding: `${theme.spacing.xs}px ${theme.spacing.md}px`,
          borderRadius: theme.radius.md,
          ...(punch ? {} : { backgroundColor: theme.colors.ground }),
          color: colors.text,
          fontFamily: theme.fonts.body,
          ...typeCss({ ...spec, size }),
          wordSpacing,
          ...(punch ? { textTransform: "uppercase", WebkitTextStroke: `${strokePx}px ${colors.stroke}`, paintOrder: "stroke fill" } : {}),
          textAlign: "center",
          textWrap: "balance",
          // Only a single word wider than the line can need this.
          overflowWrap: "anywhere",
          transform: `translateY(${pageRise}px) scale(${pageScale})`,
        }}
      >
        {shown.map((word, k) => (
          <Fragment key={page.start + k}>
            {k > 0 && " "}
            <span data-caption-word={page.start + k} style={wordStyle(word)}>
              {word.text}
            </span>
          </Fragment>
        ))}
      </p>
    </div>
  );
}
