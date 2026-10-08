// A headline card: optional kicker, title, optional subtitle, centered in the
// safe area. Fades in with a slight rise, holds, then fades out.

import { interpolate } from "../engine/easing";
import { safeArea } from "../layout/frame";
import { fontSize } from "../layout/type";
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

export function TitleCard({ progress, theme, aspect, title, subtitle, kicker }: TitleCardProps) {
  const safe = safeArea(aspect);
  const easing = themeEasing(theme);
  const opacity = presence(progress, ENTER, EXIT, easing);
  const rise = interpolate(progress, [0, ENTER], [theme.spacing.lg, 0], { easing });
  const { colors, fonts, spacing } = theme;

  return (
    <div
      style={{
        position: "absolute",
        left: safe.x,
        top: safe.y,
        width: safe.width,
        height: safe.height,
        opacity,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        overflow: "hidden",
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
            }}
          >
            {kicker}
          </p>
        )}
        <h1
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontSize: fontSize(theme, "display", aspect),
            fontWeight: 700,
            lineHeight: 1.05,
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
              lineHeight: 1.25,
              color: colors.muted,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
