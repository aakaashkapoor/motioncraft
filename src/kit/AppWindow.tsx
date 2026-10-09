// Generic window chrome holding any kit component: a title bar (traffic lights
// and a centered title, or a minimal bar with just the title) over a content
// box on the theme surface, with the theme radius, hairline border and card
// shadow. The window fills the content area, enters with a scale-and-rise
// spring and fades out at the end. `shareId` lets it morph between scenes.
// `WindowShell` is the chrome itself, shared with `BrowserWindow`.

import type { ReactNode } from "react";
import { interpolate } from "../engine/easing";
import { spring } from "../engine/spring";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import { withAlpha } from "../theme/color";
import type { Theme } from "../theme/types";
import { themeEasing } from "./motion";
import { Slot, type SlotContent } from "./Slot";
import type { KitProps } from "./types";

/** `traffic` (default): three window buttons at the left. `minimal`: the title only. */
export type WindowChromeStyle = "traffic" | "minimal";

export interface AppWindowProps extends KitProps {
  title?: string;
  chrome?: WindowChromeStyle;
  /** Any kit component, drawn inside the window's content box. */
  content?: SlotContent;
  /** Pairs this window with one in the next or previous scene for a shared-element transition. */
  shareId?: string;
}

/** The spring settles over this fraction of the scene. */
const ENTER = 0.25;
const FADE_IN = 0.12;
const EXIT = 0.1;
/** Scale the window starts at before it springs to full size. */
const START_SCALE = 0.9;
/** Resolution of the enter spring, stretched over `ENTER`. */
const SPRING_FRAMES = 60;
/** Title bar and toolbar heights, as multiples of the caption type size. */
const TITLE_BAR_EM = 2;
const TOOLBAR_EM = 2.2;
/** Traffic light diameter, as a multiple of the caption type size. */
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

/** Where the window and its parts go: it fills the content area. Pure. */
export function windowLayout(theme: Theme, aspect: Aspect, toolbar: boolean): WindowLayout {
  const box = contentArea(theme, aspect);
  const em = theme.type.caption[aspect].size;
  const titleBar = Math.round(em * TITLE_BAR_EM);
  const toolbarHeight = toolbar ? Math.round(em * TOOLBAR_EM) : 0;
  const top = titleBar + toolbarHeight;
  const inner = 2 * theme.hairline;
  return {
    box,
    titleBar,
    toolbar: toolbarHeight,
    content: { x: 0, y: top, width: box.width - inner, height: box.height - inner - top },
  };
}

/** Opacity, upward offset in px and scale of the window at `progress`. Pure. */
export function windowMotion(theme: Theme, progress: number): { opacity: number; rise: number; scale: number } {
  const frame = Math.min(1, Math.max(0, progress / ENTER)) * SPRING_FRAMES;
  const settled = spring({ frame, fps: SPRING_FRAMES, config: theme.motion.springs.enter, durationInFrames: SPRING_FRAMES });
  const easing = themeEasing(theme);
  const fadeIn = interpolate(progress, [0, FADE_IN], [0, 1], { easing });
  const fadeOut = interpolate(progress, [1 - EXIT, 1], [1, 0], { easing });
  return {
    opacity: Math.min(fadeIn, fadeOut),
    rise: theme.spacing.xl * (1 - settled),
    scale: START_SCALE + (1 - START_SCALE) * settled,
  };
}

/** Diameter of one traffic light, the gap between them and the width of all three, in px. */
function lightsMetrics(theme: Theme, aspect: Aspect): { size: number; gap: number; width: number } {
  const size = Math.round(theme.type.caption[aspect].size * LIGHT_EM);
  const gap = Math.round(size * 0.6);
  return { size, gap, width: 3 * size + 2 * gap };
}

export function TrafficLights({ theme, aspect }: { theme: Theme; aspect: Aspect }) {
  const { size, gap } = lightsMetrics(theme, aspect);
  return (
    <div data-traffic-lights="" style={{ flex: "none", display: "flex", gap }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          data-light=""
          style={{ width: size, height: size, borderRadius: "50%", backgroundColor: withAlpha(theme.colors.textSubtle, 0.45) }}
        />
      ))}
    </div>
  );
}

export interface WindowShellProps extends KitProps {
  kind: string;
  shareId?: string;
  content?: SlotContent;
  /** The title bar's contents. */
  titleBar: ReactNode;
  /** The toolbar's contents; no toolbar when undefined. */
  toolbar?: ReactNode;
}

/** The window chrome: frame, motion, title bar, optional toolbar and the content slot. */
export function WindowShell({ progress, theme, aspect, kind, shareId, content, titleBar, toolbar }: WindowShellProps) {
  const layout = windowLayout(theme, aspect, toolbar !== undefined);
  const { opacity, rise, scale } = windowMotion(theme, progress);
  const { colors, spacing, hairline, cardShadow } = theme;
  const divider = `${hairline}px solid ${colors.border}`;
  const bar = { height: layout.titleBar, display: "flex", alignItems: "center", gap: spacing.sm, padding: `0 ${spacing.md}px`, boxSizing: "border-box" } as const;

  return (
    <div
      data-window={kind}
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
      <Slot
        progress={progress}
        theme={theme}
        aspect={aspect}
        box={layout.content}
        content={content}
        backgroundColor={colors.surface}
        attribute="data-window-content"
      />
    </div>
  );
}

/** One line of chrome text: never wraps, ends in an ellipsis when too long. */
export function chromeText(theme: Theme, aspect: Aspect, color: string) {
  const spec = theme.type.caption[aspect];
  return {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: theme.fonts.body,
    fontSize: spec.size,
    fontWeight: spec.weight,
    lineHeight: spec.lineHeight,
    color,
  } as const;
}

export function AppWindow({ progress, theme, aspect, title, chrome = "traffic", content, shareId }: AppWindowProps) {
  const lights = chrome === "traffic";
  return (
    <WindowShell
      progress={progress}
      theme={theme}
      aspect={aspect}
      kind="app"
      shareId={shareId}
      content={content}
      titleBar={
        <>
          {lights && <TrafficLights theme={theme} aspect={aspect} />}
          <span style={{ ...chromeText(theme, aspect, theme.colors.textMuted), flex: 1, textAlign: "center" }}>{title}</span>
          {/* Balances the lights so the title sits in the middle of the bar. */}
          {lights && <div style={{ flex: "none", width: lightsMetrics(theme, aspect).width }} />}
        </>
      }
    />
  );
}
