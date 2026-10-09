// Generic window chrome holding any kit component: a title bar (traffic lights
// and a centered title, or a minimal bar with just the title) over a content
// box on the theme surface, with the theme radius, hairline border and card
// shadow. The window fills its area (the content area by default), enters with a scale-and-rise
// `enter` spring on the scene's lead and exits fast at the end. `shareId` lets it morph between scenes.
// `WindowShell` is the chrome itself, shared by every window component.

import type { ReactNode } from "react";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { withAlpha } from "../theme/color";
import type { Theme } from "../theme/types";
import { MotionDelay, useSceneTime, type SceneTime } from "./frameContext";
import { arrive, exitOpacity } from "./motion";
import { Slot, type SlotContent } from "./Slot";
import type { KitProps } from "./types";
import { windowMetrics, windowWidth } from "./windowLayout";

/**
 * `traffic` (default): three muted window buttons at the left. `color`: the
 * same buttons in the conventional close, minimize and zoom colors.
 * `minimal`: the title only.
 */
export type WindowChromeStyle = "traffic" | "color" | "minimal";

/** Close, minimize, zoom: the conventional window-control colors, for the `color` chrome. */
export const TRAFFIC_LIGHTS = ["#ec6a5e", "#f4bf4f", "#61c554"] as const;

export interface AppWindowProps extends KitProps {
  title?: string;
  chrome?: WindowChromeStyle;
  /** Any kit component, drawn inside the window's content box. */
  content?: SlotContent;
  /** Pairs this window with one in the next or previous scene for a shared-element transition. */
  shareId?: string;
}

/** Scale the window starts at before it springs to full size. */
const START_SCALE = 0.9;
/** Toolbar height, as a multiple of the label type size. */
const TOOLBAR_EM = 2.2;
/** Traffic light diameter, as a multiple of the label type size. */
const LIGHT_EM = 0.42;

export interface WindowLayout {
  /** The whole window, in frame px. */
  box: Rect;
  /** Title bar height in px. */
  titleBar: number;
  /** Toolbar height in px (0 when there is none). */
  toolbar: number;
  /** The content box, relative to the inside of the window's border. */
  content: Rect;
}

/**
 * Where the window and its parts go: it fills `area` (the content area by
 * default), but in 9:16 is no wider than the primary width, centered, so the
 * text inside stays off the right rail. Pure.
 */
export function windowLayout(theme: Theme, aspect: Aspect, toolbar: boolean, area: Rect = contentArea(theme, aspect)): WindowLayout {
  const width = aspect === "9:16" ? windowWidth(theme, aspect, area).width : area.width;
  const box = { ...area, x: area.x + (area.width - width) / 2, width };
  const em = theme.type.label[aspect].size;
  const titleBar = windowMetrics(theme, aspect).barHeight;
  const toolbarHeight = toolbar ? Math.round(em * TOOLBAR_EM) : 0;
  const top = titleBar + toolbarHeight;
  const inner = 2 * windowMetrics(theme, aspect).border;
  return {
    box,
    titleBar,
    toolbar: toolbarHeight,
    content: { x: 0, y: top, width: box.width - inner, height: box.height - inner - top },
  };
}

/** Opacity, upward offset in px and scale of the window at scene time `time`: an `enter` arrival on the lead, a fast exit. Pure. */
export function windowMotion(theme: Theme, time: SceneTime): { opacity: number; rise: number; scale: number } {
  const { leadMs, enter } = theme.motion;
  const { move, opacity } = arrive(theme, time.ms, leadMs);
  return {
    opacity: Math.min(opacity, exitOpacity(theme, time, enter.ms)),
    // The rise carries the spring's overshoot; the scale stops at 1, so the window's text never draws larger than it lays out.
    rise: theme.spacing.xxl * (1 - move),
    scale: START_SCALE + (1 - START_SCALE) * Math.min(1, move),
  };
}

/** Diameter of one traffic light, the gap between them and the width of all three, in px. */
function lightsMetrics(theme: Theme, aspect: Aspect): { size: number; gap: number; width: number } {
  const size = Math.round(theme.type.label[aspect].size * LIGHT_EM);
  const gap = Math.round(size * 0.6);
  return { size, gap, width: 3 * size + 2 * gap };
}

export function TrafficLights({ theme, aspect, colored = false }: { theme: Theme; aspect: Aspect; colored?: boolean }) {
  const { size, gap } = lightsMetrics(theme, aspect);
  const muted = withAlpha(theme.colors.textSubtle, 0.45);
  return (
    <div data-traffic-lights="" style={{ flex: "none", display: "flex", gap }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          data-light=""
          style={{ width: size, height: size, borderRadius: "50%", backgroundColor: colored ? TRAFFIC_LIGHTS[i] : muted }}
        />
      ))}
    </div>
  );
}

export interface WindowShellProps extends KitProps {
  kind: string;
  shareId?: string;
  /** A kit component in the content box. */
  content?: SlotContent;
  /** The window's own body instead of `content`, drawn inside the content padding. */
  children?: ReactNode;
  /** The title bar's contents. */
  titleBar: ReactNode;
  /** The toolbar's contents; no toolbar when undefined. */
  toolbar?: ReactNode;
  /** Holds back the motion of `content` by this many ms, e.g. until a page has loaded. */
  contentDelayMs?: number;
}

/** The window chrome: frame, motion, title bar, optional toolbar and the content slot. */
export function WindowShell({ progress, theme, aspect, area, kind, shareId, content, children, titleBar, toolbar, contentDelayMs = 0 }: WindowShellProps) {
  const layout = windowLayout(theme, aspect, toolbar !== undefined, area);
  const { opacity, rise, scale } = windowMotion(theme, useSceneTime(progress));
  const { colors, spacing, hairline, cardShadow } = theme;
  const divider = `${hairline}px solid ${colors.border}`;
  const bar = { height: layout.titleBar, display: "flex", alignItems: "center", gap: spacing.xs, padding: `0 ${spacing.md}px`, boxSizing: "border-box" } as const;

  return (
    <div
      data-window={kind}
      data-block={`${kind} window`}
      {...(shareId === undefined ? {} : { "data-share-id": shareId })}
      style={{
        position: "absolute",
        left: layout.box.x,
        top: layout.box.y,
        width: layout.box.width,
        height: layout.box.height,
        boxSizing: "border-box",
        opacity,
        transform: `translateY(${rise}px) scale(${scale})`,
        backgroundColor: colors.surface,
        border: divider,
        borderRadius: theme.radius.md,
        boxShadow: `0 ${cardShadow.y}px ${cardShadow.blur}px ${withAlpha(colors.shadow, cardShadow.opacity)}`,
        overflow: "hidden",
      }}
    >
      <div data-window-titlebar="" style={{ ...bar, backgroundColor: colors.surfaceAlt, borderBottom: toolbar === undefined ? divider : undefined }}>
        {titleBar}
      </div>
      {toolbar !== undefined && (
        <div data-window-toolbar="" style={{ ...bar, height: layout.toolbar, backgroundColor: colors.surface, borderBottom: divider }}>
          {toolbar}
        </div>
      )}
      {children === undefined ? (
        <MotionDelay ms={contentDelayMs}>
          <Slot
            progress={progress}
            theme={theme}
            aspect={aspect}
            box={layout.content}
            content={content}
            backgroundColor={colors.surface}
            attribute="data-window-content"
          />
        </MotionDelay>
      ) : (
        <div
          data-window-content=""
          style={{
            position: "absolute",
            left: layout.content.x,
            top: layout.content.y,
            width: layout.content.width,
            height: layout.content.height,
            boxSizing: "border-box",
            padding: windowMetrics(theme, aspect).padding,
            overflow: "hidden",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** One line of chrome text in the label step: never wraps, ends in an ellipsis when too long. */
export function chromeText(theme: Theme, aspect: Aspect, color: string) {
  return {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: theme.fonts.body,
    ...typeCss(theme.type.label[aspect]),
    color,
  } as const;
}

/** Lights at the left (unless `minimal`) and the title centered in the bar. */
export function TitleBar({ theme, aspect, title, chrome }: { theme: Theme; aspect: Aspect; title?: string; chrome: WindowChromeStyle }) {
  const lights = chrome !== "minimal";
  return (
    <>
      {lights && <TrafficLights theme={theme} aspect={aspect} colored={chrome === "color"} />}
      <span style={{ ...chromeText(theme, aspect, theme.colors.textMuted), flex: 1, textAlign: "center" }}>{title}</span>
      {/* Balances the lights so the title sits in the middle of the bar. */}
      {lights && <div style={{ flex: "none", width: lightsMetrics(theme, aspect).width }} />}
    </>
  );
}

export function AppWindow({ progress, theme, aspect, area, title, chrome = "traffic", content, shareId }: AppWindowProps) {
  return (
    <WindowShell
      progress={progress}
      theme={theme}
      aspect={aspect}
      area={area}
      kind="app"
      shareId={shareId}
      content={content}
      titleBar={<TitleBar theme={theme} aspect={aspect} title={title} chrome={chrome} />}
    />
  );
}
