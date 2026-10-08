// A burned-in caption: up to two lines of text on a solid plate at the bottom
// of the safe area. Longer text is split into pages shown one after another,
// so every word is seen and nothing is cut off.

import { safeArea, type Aspect } from "../layout/frame";
import { fontSize } from "../layout/type";
import type { Theme } from "../theme/types";
import { pageAt, pageCaption, type CaptionLimits } from "./captionPages";
import { presence, themeEasing } from "./motion";
import type { KitProps } from "./types";

export interface CaptionProps extends KitProps {
  text: string;
}

const MAX_LINES = 2;
const LINE_HEIGHT = 1.3;
// Captions follow speech, so they appear and leave quickly.
const ENTER = 0.05;
const EXIT = 0.05;
// Average glyph width as a fraction of font size. Generous for semibold sans
// text, so estimated lines err short and never wrap past MAX_LINES.
const CHAR_WIDTH = 0.6;

function captionFontSize(theme: Theme, aspect: Aspect): number {
  return fontSize(theme, "body", aspect);
}

/** How much caption text fits on one page for a theme and aspect (an estimate). */
export function captionLimits(theme: Theme, aspect: Aspect): CaptionLimits {
  const textWidth = safeArea(aspect).width - 2 * theme.spacing.md;
  const maxCharsPerLine = Math.max(1, Math.floor(textWidth / (captionFontSize(theme, aspect) * CHAR_WIDTH)));
  return { maxCharsPerLine, maxLines: MAX_LINES };
}

export function Caption({ progress, theme, aspect, text }: CaptionProps) {
  const safe = safeArea(aspect);
  const opacity = presence(progress, ENTER, EXIT, themeEasing(theme));
  // Pages get equal shares of the scene; with narration timing they will follow the audio.
  const page = pageAt(pageCaption(text, captionLimits(theme, aspect)), progress);
  if (page === undefined) return null;
  const size = captionFontSize(theme, aspect);
  const padY = theme.spacing.sm;
  const padX = theme.spacing.md;
  // Tall enough for MAX_LINES of text plus the plate's padding.
  const height = Math.ceil(MAX_LINES * size * LINE_HEIGHT + 2 * padY);

  return (
    <div
      style={{
        position: "absolute",
        left: safe.x,
        top: safe.y + safe.height - height,
        width: safe.width,
        height,
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
          borderRadius: theme.radius,
          backgroundColor: theme.colors.background,
          color: theme.colors.text,
          fontFamily: theme.fonts.body,
          fontSize: size,
          fontWeight: 600,
          lineHeight: LINE_HEIGHT,
          textAlign: "center",
          // Only a single word wider than the line can need this.
          overflowWrap: "anywhere",
        }}
      >
        {page}
      </p>
    </div>
  );
}
