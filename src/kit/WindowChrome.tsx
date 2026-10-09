// Generic window chrome: a rounded surface with a title bar holding three
// traffic lights and an optional centered title. Not any real product's brand.
// The window fades in with a slight rise and fades out at the end.

import type { ReactNode } from "react";
import { interpolate } from "../engine/easing";
import type { Rect } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import { withAlpha } from "../theme/color";
import type { Theme } from "../theme/types";
import { presence, themeEasing } from "./motion";
import { windowMetrics } from "./windowLayout";

/** Close, minimize, zoom: the conventional window-control colors. */
export const TRAFFIC_LIGHTS = ["#ec6a5e", "#f4bf4f", "#61c554"] as const;

const ENTER = 0.1;
const EXIT = 0.08;

export interface WindowChromeProps {
  progress: number;
  theme: Theme;
  aspect: Aspect;
  box: Rect;
  title?: string;
  shareId?: string;
  children: ReactNode;
}

export function WindowChrome({ progress, theme, aspect, box, title, shareId, children }: WindowChromeProps) {
  const easing = themeEasing(theme);
  const { colors, cardShadow, radius, hairline, fonts } = theme;
  const { barHeight, titleSize, lightSize, padding } = windowMetrics(theme, aspect);
  const opacity = presence(progress, ENTER, EXIT, easing);
  const rise = interpolate(progress, [0, ENTER], [theme.spacing.lg, 0], { easing });

  return (
    <div
      data-share-id={shareId}
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        boxSizing: "border-box",
        opacity,
        transform: `translateY(${rise}px)`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: colors.surface,
        border: `${hairline}px solid ${colors.border}`,
        borderRadius: radius.md,
        boxShadow: `0 ${cardShadow.y}px ${cardShadow.blur}px ${withAlpha(colors.shadow, cardShadow.opacity)}`,
      }}
    >
      <div
        style={{
          position: "relative",
          flex: "none",
          height: barHeight,
          display: "flex",
          alignItems: "center",
          gap: Math.round(lightSize * 0.7),
          paddingLeft: padding,
          paddingRight: padding,
          backgroundColor: colors.surfaceAlt,
          borderBottom: `${hairline}px solid ${colors.border}`,
        }}
      >
        {TRAFFIC_LIGHTS.map((color, i) => (
          <span
            key={i}
            data-traffic-light={i}
            style={{ flex: "none", width: lightSize, height: lightSize, borderRadius: "50%", backgroundColor: color }}
          />
        ))}
        {title !== undefined && (
          <span
            style={{
              position: "absolute",
              left: padding * 4,
              right: padding * 4,
              textAlign: "center",
              color: colors.textMuted,
              fontFamily: fonts.body,
              fontSize: titleSize,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, padding, overflow: "hidden" }}>{children}</div>
    </div>
  );
}
