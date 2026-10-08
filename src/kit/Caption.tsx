// A burned-in caption: up to two lines of text on a solid plate at the bottom
// of the safe area.

import { safeArea } from "../layout/frame";
import { fontSize } from "../layout/type";
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

export function Caption({ progress, theme, aspect, text }: CaptionProps) {
  const safe = safeArea(aspect);
  const opacity = presence(progress, ENTER, EXIT, themeEasing(theme));
  const size = fontSize(theme, "body", aspect);
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
          overflow: "hidden",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: MAX_LINES,
        }}
      >
        {text}
      </p>
    </div>
  );
}
