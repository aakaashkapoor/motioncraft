// A generic team-chat window (no real product's branding): an optional sidebar
// with the workspace name and channels, a header with the channel name, and
// messages that arrive one by one, each preceded by a typing indicator and
// rising into place. Optional floating message cards slide in beside the
// window afterwards. In 9:16 the sidebar collapses into the header; in a
// narrow 16:9 area (a Section slot) the window stacks over its cards as in 9:16.

import type { CSSProperties } from "react";
import { interpolate, type Easing } from "../engine/easing";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { estimateTextHeight } from "../layout/textFit";
import type { Aspect } from "../storyboard/types";
import { mixColors, withAlpha } from "../theme/color";
import { contrastRatio } from "../theme/contrast";
import type { Theme, TypeRole } from "../theme/types";
import { themeEasing } from "./motion";
import type { KitProps } from "./types";

export interface ChatAvatar {
  /** One or two letters. */
  initials: string;
  /** Fill color, as hex. Default: picked from the theme by author. */
  color?: string;
}

export interface ChatReaction {
  emoji: string;
  count?: number;
}

export interface ChatMessage {
  author: string;
  /** Default: the author's initials on a theme color. */
  avatar?: ChatAvatar;
  time: string;
  text: string;
  /** A small tag after the name, such as "APP" for a bot. */
  badge?: string;
  reactions?: ChatReaction[];
  /** Tint the message with the accent. */
  highlight?: boolean;
}

export interface ChatSidebar {
  workspace: string;
  channels: string[];
}

export interface ChatWindowProps extends KitProps {
  /** The open channel, shown in the header and marked active in the sidebar. */
  channel: string;
  messages: ChatMessage[];
  /** Shown in 16:9; collapses into the header in 9:16. */
  sidebar?: ChatSidebar;
  /** Floating message cards that slide in beside the window after the messages. */
  cards?: ChatMessage[];
  /** Morphs the window across a shared-element transition. */
  shareId?: string;
}

export interface ChatTiming {
  /** [start, end] of the typing indicator, as fractions of the scene. */
  typing: [number, number];
  /** [start, end] of the message's rise. */
  appear: [number, number];
}

const WINDOW_ENTER = 0.12;
const EXIT = 0.08;
const MESSAGES_START = 0.1;
/** Every message is in by here, or by `MESSAGES_DONE_WITH_CARDS` when cards follow. */
const MESSAGES_DONE = 0.78;
const MESSAGES_DONE_WITH_CARDS = 0.62;
const CARDS_DONE = 0.82;
/** Longest a message's typing-plus-appear slot may take. */
const MAX_SLOT = 0.2;
/** Share of a slot spent typing; the rest is the rise. */
const TYPING_SHARE = 0.55;
/** How long one card takes to slide in. */
const CARD_ENTER = 0.1;

/** Widest the window grows in 16:9 when it stands alone. */
const MAX_WINDOW_WIDTH = 1500;
/** Share of the 16:9 width the window takes when cards sit beside it. */
const WINDOW_SHARE_WITH_CARDS = 0.62;
/** Share of the 9:16 height the window takes when cards sit below it. */
const WINDOW_SHARE_TALL = 0.66;
const SIDEBAR_SHARE = 0.26;
const MAX_SIDEBAR_WIDTH = 380;
/** In 16:9, the side-by-side layout (sidebar, cards beside) needs an area at least this many times wider than tall. */
const WIDE_RATIO = 1.5;
/** Text roles to try for message text, largest first. */
const TEXT_ROLES: readonly TypeRole[] = ["body", "caption"];
const AVATAR_EM = 1.7;
const DOT_COUNT = 3;
/** Headroom over the estimated content height, so estimates that run short don't clip. */
const CONTENT_SLACK = 1.1;
/** Shortest the window gets, as a share of the room it has. */
const MIN_HEIGHT_SHARE = 0.55;

/** Typing and appear windows of each message, in order. */
export function chatTiming(count: number, cardCount = 0): ChatTiming[] {
  const done = cardCount > 0 ? MESSAGES_DONE_WITH_CARDS : MESSAGES_DONE;
  const slot = count > 0 ? Math.min(MAX_SLOT, (done - MESSAGES_START) / count) : 0;
  return Array.from({ length: count }, (_, i) => {
    const start = MESSAGES_START + i * slot;
    const typed = start + slot * TYPING_SHARE;
    return { typing: [start, typed], appear: [typed, start + slot] };
  });
}

/** [start, end] of each card's slide-in, after the last message. */
function cardTiming(count: number): Array<[number, number]> {
  const gap = count > 1 ? (CARDS_DONE - MESSAGES_DONE_WITH_CARDS - CARD_ENTER) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => {
    const start = MESSAGES_DONE_WITH_CARDS + i * gap;
    return [start, start + CARD_ENTER];
  });
}

export interface ChatWindowLayout {
  window: Rect;
  /** Where the cards stack, when there are any. */
  cards?: Rect;
  /** 0 when the sidebar is collapsed or absent. */
  sidebarWidth: number;
  textRole: TypeRole;
  textSize: number;
  smallSize: number;
  avatarSize: number;
  headerHeight: number;
  composerHeight: number;
}

type LayoutInput = Pick<ChatWindowProps, "messages" | "sidebar" | "cards">;

function sizesFor(theme: Theme, aspect: Aspect, textRole: TypeRole) {
  const textSize = theme.type[textRole][aspect].size;
  const smallSize = Math.round(textSize * 0.78);
  const avatarSize = Math.round(textSize * AVATAR_EM);
  const headerHeight = Math.ceil(theme.type.body[aspect].size * 1.35 + 2 * theme.spacing.sm + (aspect === "9:16" ? smallSize * 1.3 : 0));
  const composerHeight = Math.ceil(smallSize * 1.3 + 2 * theme.spacing.sm + 2 * theme.spacing.sm);
  return { textRole, textSize, smallSize, avatarSize, headerHeight, composerHeight };
}

/** Estimated height of one message at a text size, in a list `width` px wide. */
function messageHeight(theme: Theme, m: ChatMessage, width: number, textSize: number, smallSize: number, avatarSize: number): number {
  const { spacing } = theme;
  const textWidth = width - avatarSize - spacing.sm - 2 * spacing.sm;
  let height = smallSize * 1.3 + spacing.xs + estimateTextHeight(m.text, textWidth, { size: textSize, lineHeight: 1.35 });
  if (m.reactions?.length) height += spacing.xs + smallSize * 1.7;
  return Math.max(avatarSize, height) + 2 * spacing.xs;
}

/**
 * Where the window and the cards go inside `area` (the content area by
 * default), and the largest message text size at which every message fits.
 * The window is as tall as its
 * content needs (never under `MIN_HEIGHT_SHARE` of the room) and centered. If
 * no size fits, the smallest: the window then overflows visibly and the
 * layer-1 checks report it.
 */
export function chatWindowLayout(
  theme: Theme,
  aspect: Aspect,
  { messages, sidebar, cards }: LayoutInput,
  area: Rect = contentArea(theme, aspect),
): ChatWindowLayout {
  const { spacing } = theme;
  const gap = spacing.md;
  const hasCards = (cards?.length ?? 0) > 0;
  const wide = aspect === "16:9" && area.width >= area.height * WIDE_RATIO;
  const width = !wide ? area.width : hasCards ? Math.floor((area.width - gap) * WINDOW_SHARE_WITH_CARDS) : Math.min(area.width, MAX_WINDOW_WIDTH);
  const x = wide && !hasCards ? area.x + Math.floor((area.width - width) / 2) : area.x;
  const room = !wide && hasCards ? Math.floor((area.height - gap) * WINDOW_SHARE_TALL) : area.height;
  const sidebarWidth = wide && sidebar ? Math.min(MAX_SIDEBAR_WIDTH, Math.floor(width * SIDEBAR_SHARE)) : 0;
  const listWidth = width - sidebarWidth - 2 * spacing.md;

  const candidates = TEXT_ROLES.map((role) => sizesFor(theme, aspect, role));
  const needed = (s: (typeof candidates)[number]) => {
    const list = messages.reduce((sum, m) => sum + messageHeight(theme, m, listWidth, s.textSize, s.smallSize, s.avatarSize), 0);
    const chat = list + spacing.sm * (Math.max(0, messages.length - 1) + 2) + s.headerHeight + s.composerHeight;
    const side = sidebarWidth > 0 && sidebar ? 2 * spacing.md + (sidebar.channels.length + 1) * (s.smallSize * 1.3 + 2 * spacing.xs) + spacing.sm : 0;
    return Math.max(chat, side);
  };
  const sizes = candidates.find((s) => needed(s) <= room) ?? candidates.at(-1)!;
  const height = Math.min(room, Math.max(Math.ceil(needed(sizes) * CONTENT_SLACK), Math.floor(room * MIN_HEIGHT_SHARE)));
  // Alone, the window is centered; in 9:16 with cards it sits on top and the cards follow it.
  const y = !wide && hasCards ? area.y : area.y + Math.floor((area.height - height) / 2);
  const window = { x, y, width, height };
  let cardsRect: Rect | undefined;
  if (hasCards && wide) cardsRect = { x: x + width + gap, y: area.y, width: area.x + area.width - (x + width + gap), height: area.height };
  if (hasCards && !wide) cardsRect = { x: area.x, y: y + height + gap, width: area.width, height: area.y + area.height - (y + height + gap) };
  return { window, cards: cardsRect, sidebarWidth, ...sizes };
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]!.toUpperCase())
    .join("");
}

/** A theme color for an author with no avatar color, the same every time. */
function defaultAvatarColor(theme: Theme, author: string): string {
  const { accent, text, surface } = theme.colors;
  const palette = [accent, mixColors(accent, text, 0.45), mixColors(text, surface, 0.3), mixColors(accent, surface, 0.35)];
  let hash = 0;
  for (const ch of author) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return palette[hash % palette.length]!;
}

/** Text color for a fill: whichever of the theme's text or surface reads better on it. */
function inkOn(theme: Theme, fill: string): string {
  const { text, surface } = theme.colors;
  return contrastRatio(text, fill) >= contrastRatio(surface, fill) ? text : surface;
}

function Avatar({ message, size, theme }: { message: ChatMessage; size: number; theme: Theme }) {
  const fill = message.avatar?.color ?? defaultAvatarColor(theme, message.author);
  return (
    <div
      style={{
        flex: "none",
        width: size,
        height: size,
        borderRadius: theme.radius.sm,
        backgroundColor: fill,
        color: inkOn(theme, fill),
        fontFamily: theme.fonts.body,
        fontSize: Math.round(size * 0.4),
        fontWeight: 700,
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {message.avatar?.initials ?? initialsOf(message.author)}
    </div>
  );
}

function MessageBody({ message, layout, theme }: { message: ChatMessage; layout: ChatWindowLayout; theme: Theme }) {
  const { colors, fonts, spacing, radius } = theme;
  const { textSize, smallSize } = layout;
  return (
    <div style={{ display: "flex", gap: spacing.sm, alignItems: "flex-start" }}>
      <Avatar message={message} size={layout.avatarSize} theme={theme} />
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: spacing.xs }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: spacing.xs * 1.5, fontFamily: fonts.body, lineHeight: 1.3 }}>
          <span style={{ color: colors.text, fontSize: smallSize, fontWeight: 700 }}>{message.author}</span>
          {message.badge !== undefined && (
            <span
              style={{
                alignSelf: "center",
                padding: `2px ${spacing.xs}px`,
                borderRadius: radius.sm / 2,
                backgroundColor: colors.surfaceAlt,
                color: colors.textMuted,
                fontSize: Math.round(smallSize * 0.62),
                fontWeight: 700,
                letterSpacing: "0.06em",
              }}
            >
              {message.badge}
            </span>
          )}
          <span style={{ color: colors.textMuted, fontSize: Math.round(smallSize * 0.8) }}>{message.time}</span>
        </div>
        <div style={{ color: colors.text, fontFamily: fonts.body, fontSize: textSize, lineHeight: 1.35, overflowWrap: "break-word" }}>{message.text}</div>
        {message.reactions !== undefined && message.reactions.length > 0 && (
          <div style={{ display: "flex", gap: spacing.xs }}>
            {message.reactions.map((reaction, i) => (
              <span
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: spacing.xs,
                  padding: `${spacing.xs / 2}px ${spacing.sm}px`,
                  borderRadius: radius.pill,
                  border: `${theme.hairline}px solid ${colors.border}`,
                  backgroundColor: colors.surfaceAlt,
                  color: colors.textMuted,
                  fontFamily: fonts.body,
                  fontSize: Math.round(smallSize * 0.85),
                  fontWeight: 600,
                  lineHeight: 1.3,
                }}
              >
                {reaction.emoji}
                {reaction.count !== undefined && <span>{reaction.count}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Three dots that pulse in turn while someone types. */
function TypingIndicator({ message, local, layout, theme }: { message: ChatMessage; local: number; layout: ChatWindowLayout; theme: Theme }) {
  const { colors, spacing, radius } = theme;
  const dot = Math.round(layout.smallSize * 0.32);
  return (
    <div style={{ display: "flex", gap: spacing.sm, alignItems: "center" }}>
      <Avatar message={message} size={layout.avatarSize} theme={theme} />
      <div
        style={{
          display: "flex",
          gap: dot * 0.8,
          padding: `${spacing.sm}px ${spacing.md * 0.75}px`,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceAlt,
        }}
      >
        {Array.from({ length: DOT_COUNT }, (_, i) => {
          // Two pulses across the typing window, each dot a little behind the last.
          const phase = (((local * 2 - i * 0.18) % 1) + 1) % 1;
          const lift = Math.sin(Math.PI * Math.min(1, phase * 2));
          return (
            <div
              key={i}
              style={{
                width: dot,
                height: dot,
                borderRadius: "50%",
                backgroundColor: colors.textMuted,
                opacity: 0.35 + 0.65 * lift,
                transform: `translateY(${(-lift * dot * 0.5).toFixed(2)}px)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function Sidebar({ sidebar, channel, layout, theme }: { sidebar: ChatSidebar; channel: string; layout: ChatWindowLayout; theme: Theme }) {
  const { colors, fonts, spacing, radius } = theme;
  const active = Math.max(0, sidebar.channels.indexOf(channel));
  return (
    <div
      data-chat-sidebar=""
      style={{
        flex: "none",
        width: layout.sidebarWidth,
        padding: spacing.md,
        backgroundColor: colors.surfaceAlt,
        borderRight: `${theme.hairline}px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        gap: spacing.xs,
        fontFamily: fonts.body,
        boxSizing: "border-box",
      }}
    >
      <div style={{ color: colors.text, fontSize: layout.smallSize, fontWeight: 800, lineHeight: 1.3, marginBottom: spacing.sm, overflowWrap: "break-word" }}>
        {sidebar.workspace}
      </div>
      {sidebar.channels.map((name, i) => (
        <div
          key={i}
          data-chat-channel={i === active ? "active" : ""}
          style={{
            padding: `${spacing.xs}px ${spacing.sm}px`,
            borderRadius: radius.sm,
            backgroundColor: i === active ? colors.accent : "transparent",
            color: i === active ? colors.accentText : colors.textMuted,
            fontSize: Math.round(layout.smallSize * 0.85),
            fontWeight: i === active ? 700 : 500,
            lineHeight: 1.3,
            overflowWrap: "break-word",
          }}
        >
          {`# ${name}`}
        </div>
      ))}
    </div>
  );
}

function Header({ channel, workspace, layout, theme, aspect }: { channel: string; workspace?: string; layout: ChatWindowLayout; theme: Theme; aspect: Aspect }) {
  const { colors, fonts, spacing } = theme;
  return (
    <div
      style={{
        flex: "none",
        height: layout.headerHeight,
        padding: `0 ${spacing.md}px`,
        borderBottom: `${theme.hairline}px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        fontFamily: fonts.body,
        boxSizing: "border-box",
      }}
    >
      {aspect === "9:16" && workspace !== undefined && (
        <div style={{ color: colors.textMuted, fontSize: layout.smallSize, fontWeight: 600, lineHeight: 1.3 }}>{workspace}</div>
      )}
      <div style={{ color: colors.text, fontSize: theme.type.body[aspect].size, fontWeight: 700, lineHeight: 1.35 }}>{`# ${channel}`}</div>
    </div>
  );
}

function Composer({ channel, layout, theme }: { channel: string; layout: ChatWindowLayout; theme: Theme }) {
  const { colors, fonts, spacing, radius } = theme;
  return (
    <div style={{ flex: "none", height: layout.composerHeight, padding: spacing.sm, boxSizing: "border-box" }}>
      <div
        style={{
          height: "100%",
          padding: `0 ${spacing.sm}px`,
          borderRadius: radius.sm,
          border: `${theme.hairline}px solid ${colors.border}`,
          display: "flex",
          alignItems: "center",
          color: colors.textMuted,
          fontFamily: fonts.body,
          fontSize: layout.smallSize,
          lineHeight: 1.3,
          boxSizing: "border-box",
        }}
      >
        {`Message # ${channel}`}
      </div>
    </div>
  );
}

function rise(progress: number, [start, end]: [number, number], distance: number, easing: Easing) {
  return {
    opacity: interpolate(progress, [start, end], [0, 1], { easing }),
    offset: interpolate(progress, [start, end], [distance, 0], { easing }),
  };
}

/** Typing indicator opacity: quick in, held, out just before the message lands. */
function typingOpacity(progress: number, [start, end]: [number, number]): number {
  const len = end - start;
  if (progress <= start || progress >= end) return 0;
  return Math.min(interpolate(progress, [start, start + len * 0.25], [0, 1]), interpolate(progress, [end - len * 0.2, end], [1, 0]));
}

export function ChatWindow({ progress, theme, aspect, area: slot, channel, messages, sidebar, cards, shareId }: ChatWindowProps) {
  const area = slot ?? contentArea(theme, aspect);
  const layout = chatWindowLayout(theme, aspect, { messages, sidebar, cards }, area);
  const easing = themeEasing(theme);
  const { colors, spacing, radius, cardShadow } = theme;
  const enter = interpolate(progress, [0, WINDOW_ENTER], [0, 1], { easing });
  const exit = interpolate(progress, [1 - EXIT, 1], [1, 0], { easing });
  const timing = chatTiming(messages.length, cards?.length ?? 0);
  const cardTimes = cardTiming(cards?.length ?? 0);
  const shadow = `0 ${cardShadow.y}px ${cardShadow.blur}px ${withAlpha(colors.shadow, cardShadow.opacity)}`;
  const at = (rect: Rect): CSSProperties => ({ position: "absolute", left: rect.x - area.x, top: rect.y - area.y, width: rect.width, height: rect.height });
  const slide = spacing.md;

  return (
    <div style={{ position: "absolute", left: area.x, top: area.y, width: area.width, height: area.height, opacity: exit }}>
      <div
        data-share-id={shareId}
        style={{
          ...at(layout.window),
          opacity: enter,
          transform: `translateY(${(1 - enter) * spacing.lg}px)`,
          backgroundColor: colors.surface,
          border: `${theme.hairline}px solid ${colors.border}`,
          borderRadius: radius.lg,
          boxShadow: shadow,
          overflow: "hidden",
          display: "flex",
          boxSizing: "border-box",
        }}
      >
        {layout.sidebarWidth > 0 && sidebar && <Sidebar sidebar={sidebar} channel={channel} layout={layout} theme={theme} />}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <Header channel={channel} workspace={sidebar?.workspace} layout={layout} theme={theme} aspect={aspect} />
          <div
            style={{
              flex: 1,
              minHeight: 0,
              padding: `${spacing.sm}px ${spacing.md}px`,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              gap: spacing.sm,
            }}
          >
            {messages.map((message, i) => {
              const { typing, appear } = timing[i]!;
              const shown = rise(progress, appear, spacing.sm * 1.5, easing);
              const local = (progress - typing[0]) / (typing[1] - typing[0]);
              return (
                <div key={i} style={{ position: "relative" }}>
                  <div
                    data-chat-message={i}
                    style={{
                      opacity: shown.opacity,
                      transform: `translateY(${shown.offset}px)`,
                      padding: spacing.xs,
                      borderRadius: radius.sm,
                      borderLeft: `${spacing.xs / 2}px solid ${message.highlight ? colors.accent : "transparent"}`,
                      backgroundColor: message.highlight ? mixColors(colors.surface, colors.accent, 0.08) : "transparent",
                    }}
                  >
                    <MessageBody message={message} layout={layout} theme={theme} />
                  </div>
                  <div data-chat-typing={i} style={{ position: "absolute", left: spacing.xs * 1.5, top: spacing.xs, opacity: typingOpacity(progress, typing) }}>
                    <TypingIndicator message={message} local={local} layout={layout} theme={theme} />
                  </div>
                </div>
              );
            })}
          </div>
          <Composer channel={channel} layout={layout} theme={theme} />
        </div>
      </div>
      {cards && layout.cards && (
        <div
          style={{
            ...at(layout.cards),
            display: "flex",
            flexDirection: "column",
            // Beside the window the cards center on it; below it they follow it.
            justifyContent: layout.cards.x > layout.window.x ? "center" : "flex-start",
            gap: spacing.md,
            paddingRight: slide,
            boxSizing: "border-box",
          }}
        >
          {cards.map((card, i) => {
            const shown = rise(progress, cardTimes[i]!, slide, easing);
            return (
              <div
                key={i}
                data-chat-card={i}
                style={{
                  opacity: shown.opacity,
                  transform: `translateX(${shown.offset}px)`,
                  padding: spacing.md,
                  backgroundColor: colors.surface,
                  border: `${theme.hairline}px solid ${colors.border}`,
                  borderRadius: radius.md,
                  boxShadow: shadow,
                }}
              >
                <MessageBody message={card} layout={layout} theme={theme} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
