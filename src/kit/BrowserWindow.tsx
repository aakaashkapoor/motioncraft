// A browser window: `AppWindow` chrome with tabs in the title bar and a toolbar
// holding back/forward buttons and an address bar showing `url`. The content
// box holds any kit component. With `typeUrl`, the address bar types the url
// once the window has arrived (design v3, life #10) and the page loads when it
// is entered. Generic, not any real browser's brand.

import type { Seed } from "../engine/random";
import { Icon } from "../icons";
import type { Aspect } from "../storyboard/types";
import { withAlpha } from "../theme/color";
import type { Theme } from "../theme/types";
import { chromeText, TrafficLights, WindowShell, windowLayout, type WindowChromeStyle } from "./AppWindow";
import { Caret } from "./Caret";
import { useSceneTime, type SceneTime } from "./frameContext";
import { fade, fitSequence } from "./motion";
import type { SlotContent } from "./Slot";
import type { KitProps } from "./types";
import { caretBlink, typedText, typingSpan, type TypingSpan } from "./typing";

export interface BrowserWindowProps extends KitProps {
  /** Shown in the address bar, e.g. "example.com/pricing". */
  url: string;
  /** Tab titles. Default: one tab named after the url's host. */
  tabs?: string[];
  /** Index of the selected tab. Default 0. */
  activeTab?: number;
  chrome?: WindowChromeStyle;
  /** Any kit component, drawn inside the page area. */
  content?: SlotContent;
  /** Pairs this window with one in the next or previous scene for a shared-element transition. */
  shareId?: string;
  /** Type the url into the address bar once the window has arrived; the page loads when it is entered. Default false. */
  typeUrl?: boolean;
  /** Varies the typing rhythm; the same seed types the same way every time. Default 0. */
  seed?: Seed;
}

/** Tab height as a fraction of the title bar. */
const TAB_HEIGHT = 0.7;
/** Address bar height as a fraction of the toolbar. */
const ADDRESS_HEIGHT = 0.68;

/** The url without its scheme, e.g. "https://example.com/a" → "example.com/a". */
function displayUrl(url: string): string {
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
}

/** The url's host without "www.", e.g. "https://www.example.com/a" → "example.com". */
function hostOf(url: string): string {
  return displayUrl(url).split(/[/?#]/)[0]!.replace(/^www\./i, "");
}

/**
 * The address bar typing `url` (without its scheme), in ms: the caret appears
 * once the window has faded in, then the url types (see `typingSpan`). Given
 * the scene's time, typing that would run into the exit speeds up to finish
 * before it.
 */
export function addressBarTyping(theme: Theme, url: string, time?: SceneTime, seed: Seed = 0): TypingSpan {
  const { leadMs, fx, enter } = theme.motion;
  const start = leadMs + fx.ms;
  const natural = typingSpan(theme, displayUrl(url), start, seed);
  const pace = time === undefined ? 1 : fitSequence(theme, time, start, natural.end, enter.ms);
  return pace === 1 ? natural : typingSpan(theme, displayUrl(url), start, seed, pace);
}

function Chevron({ direction, size, color }: { direction: "left" | "right"; size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flex: "none" }}>
      <path d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

function Tabs({ theme, aspect, tabs, active, height }: { theme: Theme; aspect: Aspect; tabs: string[]; active: number; height: number }) {
  const { colors, radius, spacing } = theme;
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", gap: spacing.xxs, alignItems: "center" }}>
      {tabs.map((tab, i) => {
        const selected = i === active;
        return (
          <div
            key={i}
            data-tab={i}
            {...(selected ? { "data-active": "true" } : {})}
            style={{
              flex: "0 1 auto",
              minWidth: 0,
              height,
              display: "flex",
              alignItems: "center",
              padding: `0 ${spacing.md}px`,
              borderRadius: radius.sm,
              backgroundColor: selected ? colors.surface : "transparent",
              boxShadow: selected ? `0 0 0 ${theme.hairline}px ${colors.border}` : undefined,
            }}
          >
            <span style={chromeText(theme, aspect, selected ? colors.text : colors.textMuted)}>{tab}</span>
          </div>
        );
      })}
    </div>
  );
}

export function BrowserWindow({ progress, theme, aspect, area, url, tabs, activeTab = 0, chrome = "traffic", content, shareId, typeUrl = false, seed = 0 }: BrowserWindowProps) {
  const { colors, radius, spacing } = theme;
  const { titleBar, toolbar } = windowLayout(theme, aspect, true, area);
  const iconSize = Math.round(theme.type.label[aspect].size * 0.8);
  const time = useSceneTime(progress);
  const { ms } = time;
  const typing = typeUrl ? addressBarTyping(theme, url, time, seed) : undefined;
  const typingNow = typing !== undefined && ms >= typing.start && ms < typing.end;
  // The bar is focused while it types: an accent ring that comes and goes with `fx.fast`.
  const fast = theme.motion["fx.fast"];
  const focus = typing === undefined ? 0 : Math.min(fade(fast, ms - typing.start), 1 - fade(fast, ms - typing.end));
  return (
    <WindowShell
      progress={progress}
      theme={theme}
      aspect={aspect}
      area={area}
      kind="browser"
      shareId={shareId}
      content={content}
      contentDelayMs={typing?.end}
      titleBar={
        <>
          {chrome !== "minimal" && <TrafficLights theme={theme} aspect={aspect} colored={chrome === "color"} />}
          <Tabs theme={theme} aspect={aspect} tabs={tabs ?? [hostOf(url)]} active={activeTab} height={Math.round(titleBar * TAB_HEIGHT)} />
        </>
      }
      toolbar={
        <>
          <Chevron direction="left" size={iconSize} color={colors.textMuted} />
          <Chevron direction="right" size={iconSize} color={colors.textSubtle} />
          <div
            data-address-bar=""
            style={{
              flex: 1,
              minWidth: 0,
              height: Math.round(toolbar * ADDRESS_HEIGHT),
              display: "flex",
              alignItems: "center",
              gap: spacing.xs,
              padding: `0 ${spacing.md}px`,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceAlt,
              ...(focus > 0 ? { boxShadow: `inset 0 0 0 ${theme.hairline}px ${withAlpha(colors.accent, focus)}` } : {}),
            }}
          >
            <Icon name="lock" size={Math.round(iconSize * 0.8)} color={colors.textSubtle} />
            <span style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
              <span data-address-text="" style={chromeText(theme, aspect, typing === undefined ? colors.textMuted : colors.text)}>
                {typing === undefined ? displayUrl(url) : typedText(displayUrl(url), typing, ms)}
              </span>
              {typingNow && <Caret theme={theme} shape="bar" opacity={ms >= typing.typeStart ? 1 : caretBlink(theme, ms - typing.start)} />}
            </span>
          </div>
        </>
      }
    />
  );
}
