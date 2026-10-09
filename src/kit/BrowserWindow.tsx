// A browser window: `AppWindow` chrome with tabs in the title bar and a toolbar
// holding back/forward buttons and an address bar showing `url`. The content
// box holds any kit component. Generic, not any real browser's brand.

import { Icon } from "../icons";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { chromeText, TrafficLights, WindowShell, windowLayout, type WindowChromeStyle } from "./AppWindow";
import type { SlotContent } from "./Slot";
import type { KitProps } from "./types";

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
    <div style={{ flex: 1, minWidth: 0, display: "flex", gap: spacing.xs, alignItems: "center" }}>
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

export function BrowserWindow({ progress, theme, aspect, area, url, tabs, activeTab = 0, chrome = "traffic", content, shareId }: BrowserWindowProps) {
  const { colors, radius, spacing } = theme;
  const { titleBar, toolbar } = windowLayout(theme, aspect, true, area);
  const iconSize = Math.round(theme.type.caption[aspect].size * 0.8);
  return (
    <WindowShell
      progress={progress}
      theme={theme}
      aspect={aspect}
      area={area}
      kind="browser"
      shareId={shareId}
      content={content}
      titleBar={
        <>
          {chrome === "traffic" && <TrafficLights theme={theme} aspect={aspect} />}
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
              gap: spacing.sm,
              padding: `0 ${spacing.md}px`,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceAlt,
            }}
          >
            <Icon name="lock" size={Math.round(iconSize * 0.8)} color={colors.textSubtle} />
            <span style={chromeText(theme, aspect, colors.textMuted)}>{displayUrl(url)}</span>
          </div>
        </>
      }
    />
  );
}
