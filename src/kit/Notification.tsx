// Notification banners dropping in over a scene: "Deploy finished", "New
// message". Each is a frosted card (the surface at 85% over a backdrop blur)
// with a rounded-square app icon on the accent, the app name and time in a
// small muted line, a bold title and one line of body. A banner drops from
// above on a crisp spring with a slight overshoot; a newer one lands on top
// and pushes the earlier ones down on the same spring. They stay until the
// exit. An optional `content` scene sits behind them, laid out in the whole
// slot at full size (the banners overlay it), as it would be there alone.
//
// Ported from HyperFrames native-notification-pop (Apache-2.0), with a
// generic look from the theme: no OS's chrome, fonts or icons.

import { Icon } from "../icons";
import { contentArea } from "../layout/caption";
import { frameSize, isTall, type Rect } from "../layout/frame";
import { charsPerLine } from "../layout/textFit";
import { typeCss } from "../layout/type";
import { withAlpha } from "../theme/color";
import type { TypeSpec } from "../theme/types";
import { entering, useSceneTime } from "./frameContext";
import { FULL_BLEED_COMPONENTS } from "./media";
import { exitOpacity, fade } from "./motion";
import { bannerPoses, notificationErrors, notificationLayout, notificationTiming, type NotificationItem } from "./notificationPlan";
import { nestedComponent } from "./Section";
import { Slot, type SlotContent } from "./Slot";
import type { KitProps } from "./types";

export interface NotificationProps extends KitProps {
  /** 1-3 banners, in the order they drop; the newest lands on top. */
  notifications: NotificationItem[];
  /** A scene behind the banners, written like a scene (`{ component, props }`). */
  content?: SlotContent;
  /** When each banner drops, in scene ms. Default 400 ms, then every 900 ms. */
  atMs?: number[];
}

/** The card fill's opacity over the blur. */
const FILL_OPACITY = 0.85;
/** The icon's corner, as a share of its side: a rounded square. */
const ICON_CORNER = 0.24;
/** The glyph's share of the icon. */
const GLYPH_SHARE = 0.55;

const round = (n: number) => Math.round(n * 100) / 100 || 0;

/** One line, never wrapped; cut with an ellipsis only when it would not fit (so a fitting line's descenders are never clipped). */
function oneLine(text: string, width: number, spec: TypeSpec) {
  const fits = [...text].length <= charsPerLine(width, spec.size);
  return fits ? ({ whiteSpace: "nowrap" } as const) : ({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as const);
}

/** `content` laid out in `area` (frame px), drawn inside the Notification's box at `area`'s corner. */
function NestedContent({ progress, theme, aspect, area, content }: Pick<NotificationProps, "progress" | "theme" | "aspect"> & { area: Rect; content: SlotContent }) {
  const Content = nestedComponent("Notification", content);
  const frame = frameSize(aspect);
  return (
    <div data-notification-content="" style={{ position: "absolute", left: -area.x, top: -area.y, width: frame.width, height: frame.height }}>
      <Content {...content.props} progress={progress} theme={theme} aspect={aspect} area={area} />
    </div>
  );
}

export function Notification(props: NotificationProps) {
  const errors = notificationErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`Notification: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, notifications, content, atMs } = props;
  const area = slot ?? contentArea(theme, aspect);
  const layout = notificationLayout(theme, aspect, notifications, slot);
  const { colors, fonts, spacing, radius, hairline, cardShadow, motion } = theme;
  const time = useSceneTime(progress);
  const { drops } = notificationTiming(theme, notifications.length, atMs, time);
  const poses = bannerPoses(layout, drops, entering(time).ms, (elapsed) => fade(motion.fx, elapsed));
  const corner = isTall(aspect) ? radius.lg : radius.md;
  const textWidth = (width: number) => width - 2 * layout.padding - layout.icon - spacing.sm;

  return (
    <div style={{ position: "absolute", left: area.x, top: area.y, width: area.width, height: area.height, opacity: exitOpacity(theme, time, motion.enter.ms) }}>
      {content !== undefined &&
        (slot !== undefined && !FULL_BLEED_COMPONENTS.has(content.component) ? (
          // In a slot (a Section's content), the content lays itself out in the whole slot at full size, as it would
          // there alone; a scaled frame (the Slot below) would shrink it to a thumbnail. Drawn in frame coordinates.
          <NestedContent progress={progress} theme={theme} aspect={aspect} area={area} content={content} />
        ) : (
          <Slot progress={progress} theme={theme} aspect={aspect} box={{ x: 0, y: 0, width: area.width, height: area.height }} content={content} attribute="data-notification-content" />
        ))}
      {notifications.map((item, i) => {
        const pose = poses[i]!;
        if (pose.opacity <= 0) return null;
        const box = layout.rest[i]!;
        const room = textWidth(box.width);
        const icon = item.icon ?? "zap";
        return (
          <div
            key={i}
            data-notification={i}
            style={{
              position: "absolute",
              left: round(box.x - area.x),
              top: round(pose.y - area.y),
              width: box.width,
              height: box.height,
              opacity: round(pose.opacity),
              boxSizing: "border-box",
              padding: layout.padding,
              display: "flex",
              alignItems: "center",
              gap: spacing.sm,
              backgroundColor: withAlpha(colors.surface, FILL_OPACITY),
              backdropFilter: `blur(${spacing.md}px) saturate(140%)`,
              WebkitBackdropFilter: `blur(${spacing.md}px) saturate(140%)`,
              border: `${hairline}px solid ${colors.border}`,
              borderRadius: corner,
              boxShadow: `0 ${cardShadow.y}px ${cardShadow.blur}px ${withAlpha(colors.shadow, cardShadow.opacity)}`,
              fontFamily: fonts.body,
            }}
          >
            <div
              data-notification-icon=""
              style={{
                flex: "none",
                width: layout.icon,
                height: layout.icon,
                borderRadius: Math.round(layout.icon * ICON_CORNER),
                backgroundColor: colors.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name={icon} size={Math.round(layout.icon * GLYPH_SHARE)} color={colors.accentText} />
            </div>
            <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: spacing.xs, color: colors.textMuted, ...typeCss(layout.meta) }}>
                <span data-notification-app="" style={{ flex: "1 1 auto", minWidth: 0, ...oneLine(item.app, room - (item.time === undefined ? 0 : [...item.time].length * layout.meta.size * 0.6 + spacing.xs), layout.meta) }}>
                  {item.app}
                </span>
                {item.time !== undefined && (
                  <span data-notification-time="" style={{ flex: "none", whiteSpace: "nowrap" }}>
                    {item.time}
                  </span>
                )}
              </div>
              <div data-notification-title="" style={{ color: colors.text, ...typeCss(layout.title), ...oneLine(item.title, room, layout.title) }}>
                {item.title}
              </div>
              {item.body !== undefined && item.body !== "" && (
                <div data-notification-body="" style={{ color: colors.textMuted, ...typeCss(layout.body), ...oneLine(item.body, room, layout.body) }}>
                  {item.body}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
