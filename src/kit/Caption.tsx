// A burned-in caption: up to two lines of text, set in the ramp's `subtitle`
// step, on a solid plate in the caption band at the bottom of the safe area
// (see `layout/caption`). Longer text is split into pages shown one after
// another, so every word is seen and nothing is cut off.

import { CAPTION_MAX_LINES, captionBand } from "../layout/caption";
import type { Aspect } from "../layout/frame";
import { typeCss } from "../layout/type";
import type { Theme } from "../theme/types";
import { pageAt, pageCaption, type CaptionLimits } from "./captionPages";
import { presence, themeEasing } from "./motion";
import type { KitProps } from "./types";

export interface CaptionProps extends KitProps {
  text: string;
}

// Captions follow speech, so they appear and leave quickly.
const ENTER = 0.05;
const EXIT = 0.05;
// Average glyph width as a fraction of font size. Generous for semibold sans
// text, so estimated lines err short and never wrap past the band's lines.
const CHAR_WIDTH = 0.6;

/** How much caption text fits on one page for a theme and aspect (an estimate). */
export function captionLimits(theme: Theme, aspect: Aspect): CaptionLimits {
  const textWidth = captionBand(theme, aspect).width - 2 * theme.spacing.md;
  const size = theme.type.subtitle[aspect].size;
  const maxCharsPerLine = Math.max(1, Math.floor(textWidth / (size * CHAR_WIDTH)));
  return { maxCharsPerLine, maxLines: CAPTION_MAX_LINES };
}

export function Caption({ progress, theme, aspect, text }: CaptionProps) {
  // Pages get equal shares of the scene; with narration timing they will follow the audio.
  const page = pageAt(pageCaption(text, captionLimits(theme, aspect)), progress);
  if (page === undefined) return null;
  const band = captionBand(theme, aspect);
  const opacity = presence(progress, ENTER, EXIT, themeEasing(theme));
  const spec = theme.type.subtitle[aspect];
  const padY = theme.spacing.xs;
  const padX = theme.spacing.md;

  return (
    <div
      style={{
        position: "absolute",
        left: band.x,
        top: band.y,
        width: band.width,
        height: band.height,
        opacity,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <p
        style={{
          margin: 0,
          maxWidth: "100%",
          boxSizing: "border-box",
          padding: `${padY}px ${padX}px`,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.ground,
          color: theme.colors.text,
          fontFamily: theme.fonts.body,
          ...typeCss(spec),
          textAlign: "center",
          textWrap: "balance",
          // Only a single word wider than the line can need this.
          overflowWrap: "anywhere",
        }}
      >
        {page}
      </p>
    </div>
  );
}
