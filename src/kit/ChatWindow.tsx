// A generic team-chat window (no real product's branding): an optional sidebar
// with the workspace name and channels, a header with the channel name, and
// messages that arrive one by one, each preceded by a typing indicator and
// rising into place. Optional floating message cards slide in beside the
// window afterwards. In 9:16 the sidebar collapses into the header; in a
// narrow 16:9 area (a Section slot) the window stacks over its cards as in 9:16.

import type { CSSProperties } from "react";
import { interpolate, type Easing } from "../engine/easing";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { mixColors, withAlpha } from "../theme/color";
import { contrastRatio } from "../theme/contrast";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { themeEasing } from "./motion";
import type { KitProps } from "./types";
import { windowWidth } from "./windowLayout";

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
/** Ramp steps to try for message text, largest first. */
const TEXT_ROLES: readonly TypeRole[] = ["body", "label"];
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
  /** The message text's ramp step: `body`, or `label` when the messages need the room. */
  textRole: TypeRole;
  text: TypeSpec;
  /** Names, times, channels and the composer: the `label` step. */
  meta: TypeSpec;
  avatarSize: number;
  headerHeight: number;
  composerHeight: number;
}

type LayoutInput = Pick<ChatWindowProps, "messages" | "sidebar" | "cards">;

/** Height of one line of text in a ramp step, in px. */
const lineOf = (spec: TypeSpec) => spec.size * spec.lineHeight;

function sizesFor(theme: Theme, aspect: Aspect, textRole: TypeRole) {
  const { type, spacing } = theme;
  const text = type[textRole][aspect];
  const meta = type.label[aspect];
  const avatarSize = Math.round(text.size * AVATAR_EM);
  const headerHeight = Math.ceil(lineOf(type.body[aspect]) + 2 * spacing.xs + (aspect === "9:16" ? lineOf(meta) : 0));
  const composerHeight = Math.ceil(lineOf(meta) + 4 * spacing.xs);
  return { textRole, text, meta, avatarSize, headerHeight, composerHeight };
}

/** Estimated height of one message with message text `text`, in a list `width` px wide. */
function messageHeight(theme: Theme, m: ChatMessage, width: number, text: TypeSpec, meta: TypeSpec, avatarSize: number): number {
  const { spacing } = theme;
  const textWidth = width - avatarSize - spacing.xs - 2 * spacing.xs;
  let height = lineOf(meta) + spacing.xxs + estimateTextHeight(m.text, textWidth, text);
  if (m.reactions?.length) height += spacing.xxs + lineOf(meta) + spacing.xs;
  return Math.max(avatarSize, height) + 2 * spacing.xxs;
}

/**
 * Where the window and the cards go inside `slot` (the content area when
 * there is none), and the largest message text size at which every message
 * fits. The window is as tall as its content needs (never under
 * `MIN_HEIGHT_SHARE` of the room); alone, it centers on the frame's optical
 * center (see `blockCenterY`). Stacked, it is a window's width, centered. If
 * no size fits, the smallest: the window then overflows visibly and the
 * layer-1 checks report it.
 */
export function chatWindowLayout(theme: Theme, aspect: Aspect, { messages, sidebar, cards }: LayoutInput, slot?: Rect): ChatWindowLayout {
  const area = slot ?? contentArea(theme, aspect);
  const { spacing } = theme;
  const gap = spacing.md;
  const hasCards = (cards?.length ?? 0) > 0;
  const wide = aspect === "16:9" && area.width >= area.height * WIDE_RATIO;
  const width = !wide ? windowWidth(theme, aspect, area).width : hasCards ? Math.floor((area.width - gap) * WINDOW_SHARE_WITH_CARDS) : Math.min(area.width, MAX_WINDOW_WIDTH);
  const x = wide && hasCards ? area.x : area.x + Math.floor((area.width - width) / 2);
  const room = !wide && hasCards ? Math.floor((area.height - gap) * WINDOW_SHARE_TALL) : area.height;
  const sidebarWidth = wide && sidebar ? Math.min(MAX_SIDEBAR_WIDTH, Math.floor(width * SIDEBAR_SHARE)) : 0;
  const listWidth = width - sidebarWidth - 2 * spacing.md;

  const candidates = TEXT_ROLES.map((role) => sizesFor(theme, aspect, role));
  const needed = (s: (typeof candidates)[number]) => {
    const list = messages.reduce((sum, m) => sum + messageHeight(theme, m, listWidth, s.text, s.meta, s.avatarSize), 0);
    const chat = list + spacing.xs * (Math.max(0, messages.length - 1) + 2) + s.headerHeight + s.composerHeight;
    const side = sidebarWidth > 0 && sidebar ? 2 * spacing.md + (sidebar.channels.length + 1) * (lineOf(s.meta) + 2 * spacing.xxs) + spacing.xs : 0;
    return Math.max(chat, side);
  };
  const sizes = candidates.find((s) => needed(s) <= room) ?? candidates.at(-1)!;
  const height = Math.min(room, Math.max(Math.ceil(needed(sizes) * CONTENT_SLACK), Math.floor(room * MIN_HEIGHT_SHARE)));
  // Alone, the window is centered; stacked with cards it sits on top and the cards follow it.
  const y = !wide && hasCards ? area.y : Math.floor(placeBlock(area, { width, height }, blockCenterY(theme, aspect, slot)).y);
  const window = { x, y, width, height };
  let cardsRect: Rect | undefined;
  if (hasCards && wide) {
    // A band centered on the window, as tall as the area allows, so the cards center on it.
    const middle = y + height / 2;
    const half = Math.min(middle - area.y, area.y + area.height - middle);
    cardsRect = { x: x + width + gap, y: middle - half, width: area.x + area.width - (x + width + gap), height: 2 * half };
  }
  if (hasCards && !wide) cardsRect = { x, y: y + height + gap, width, height: area.y + area.height - (y + height + gap) };
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

function Avatar({ message, size, meta, theme }: { message: ChatMessage; size: number; meta: TypeSpec; theme: Theme }) {
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
        ...typeCss(meta),
        fontWeight: theme.weights.bold,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {message.avatar?.initials ?? initialsOf(message.author)}
    </div>
  );
}

function MessageBody({ message, layout, theme, aspect }: { message: ChatMessage; layout: ChatWindowLayout; theme: Theme; aspect: Aspect }) {
  const { colors, fonts, spacing, radius, weights } = theme;
  const { text, meta } = layout;
  return (
    <div style={{ display: "flex", gap: spacing.xs, alignItems: "flex-start" }}>
      <Avatar message={message} size={layout.avatarSize} meta={meta} theme={theme} />
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: spacing.xxs }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: spacing.xxs * 1.5, fontFamily: fonts.body, ...typeCss(meta) }}>
          <span style={{ color: colors.text, fontWeight: weights.bold }}>{message.author}</span>
          {message.badge !== undefined && (
            <span
              style={{
                alignSelf: "center",
                padding: `2px ${spacing.xxs}px`,
                borderRadius: radius.sm / 2,
                backgroundColor: colors.surfaceAlt,
                color: colors.textMuted,
                ...typeCss(theme.type.eyebrow[aspect]),
                textTransform: "uppercase",
              }}
            >
              {message.badge}
            </span>
          )}
          <span style={{ color: colors.textMuted }}>{message.time}</span>
        </div>
        <div style={{ color: colors.text, fontFamily: fonts.body, ...typeCss(text), overflowWrap: "break-word" }}>{message.text}</div>
        {message.reactions !== undefined && message.reactions.length > 0 && (
          <div style={{ display: "flex", gap: spacing.xxs }}>
            {message.reactions.map((reaction, i) => (
              <span
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: spacing.xxs,
                  padding: `${spacing.xxs / 2}px ${spacing.xs}px`,
                  borderRadius: radius.pill,
                  border: `${theme.hairline}px solid ${colors.border}`,
                  backgroundColor: colors.surfaceAlt,
                  color: colors.textMuted,
                  fontFamily: fonts.body,
                  ...typeCss(meta),
                  fontWeight: weights.semibold,
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
  const dot = Math.round(layout.meta.size * 0.32);
  return (
    <div style={{ display: "flex", gap: spacing.xs, alignItems: "center" }}>
      <Avatar message={message} size={layout.avatarSize} meta={layout.meta} theme={theme} />
      <div
        style={{
          display: "flex",
          gap: dot * 0.8,
          padding: `${spacing.xs}px ${spacing.md * 0.75}px`,
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
        gap: spacing.xxs,
        fontFamily: fonts.body,
        boxSizing: "border-box",
      }}
    >
      <div style={{ color: colors.text, ...typeCss(layout.meta), fontWeight: theme.weights.heavy, marginBottom: spacing.xs, overflowWrap: "break-word" }}>
        {sidebar.workspace}
      </div>
      {sidebar.channels.map((name, i) => (
        <div
          key={i}
          data-chat-channel={i === active ? "active" : ""}
          style={{
            padding: `${spacing.xxs}px ${spacing.xs}px`,
            borderRadius: radius.sm,
            backgroundColor: i === active ? colors.accent : "transparent",
            color: i === active ? colors.accentText : colors.textMuted,
            ...typeCss(layout.meta),
            fontWeight: i === active ? theme.weights.bold : layout.meta.weight,
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
        <div style={{ color: colors.textMuted, ...typeCss(layout.meta), fontWeight: theme.weights.semibold }}>{workspace}</div>
      )}
      <div style={{ color: colors.text, ...typeCss(theme.type.body[aspect]), fontWeight: theme.weights.bold }}>{`# ${channel}`}</div>
    </div>
  );
}

function Composer({ channel, layout, theme }: { channel: string; layout: ChatWindowLayout; theme: Theme }) {
  const { colors, fonts, spacing, radius } = theme;
  return (
    <div style={{ flex: "none", height: layout.composerHeight, padding: spacing.xs, boxSizing: "border-box" }}>
      <div
        style={{
          height: "100%",
          padding: `0 ${spacing.xs}px`,
          borderRadius: radius.sm,
          border: `${theme.hairline}px solid ${colors.border}`,
          display: "flex",
          alignItems: "center",
          color: colors.textMuted,
          fontFamily: fonts.body,
          ...typeCss(layout.meta),
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
  const layout = chatWindowLayout(theme, aspect, { messages, sidebar, cards }, slot);
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
        data-block="chat window"
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
              padding: `${spacing.xs}px ${spacing.md}px`,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              gap: spacing.xs,
            }}
          >
            {messages.map((message, i) => {
              const { typing, appear } = timing[i]!;
              const shown = rise(progress, appear, spacing.xs * 1.5, easing);
              const local = (progress - typing[0]) / (typing[1] - typing[0]);
              return (
                <div key={i} style={{ position: "relative" }}>
                  <div
                    data-chat-message={i}
                    style={{
                      opacity: shown.opacity,
                      transform: `translateY(${shown.offset}px)`,
                      padding: spacing.xxs,
                      borderRadius: radius.sm,
                      borderLeft: `${spacing.xxs / 2}px solid ${message.highlight ? colors.accent : "transparent"}`,
                      backgroundColor: message.highlight ? mixColors(colors.surface, colors.accent, 0.08) : "transparent",
                    }}
                  >
                    <MessageBody message={message} layout={layout} theme={theme} aspect={aspect} />
                  </div>
                  <div data-chat-typing={i} style={{ position: "absolute", left: spacing.xxs * 1.5, top: spacing.xxs, opacity: typingOpacity(progress, typing) }}>
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
                <MessageBody message={card} layout={layout} theme={theme} aspect={aspect} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
