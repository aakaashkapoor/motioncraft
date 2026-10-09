// A generic team-chat window (no real product's branding): an optional sidebar
// with the workspace name and channels, a header with the channel name, and
// messages that arrive one by one, each preceded by a typing indicator (a
// `beat`) and rising into place. A `typed` message (the viewer's own) types
// into the composer instead, with a live caret (design v3, life #10), and lands
// when it is sent. Optional floating message cards slide in
// beside the window afterwards. The window arrives on the scene's lead; the
// conversation plays at the same pace in any scene, speeding up only when a
// scene is too short to fit it. In 9:16 the sidebar collapses into the header;
// in a narrow 16:9 area (a Section slot) the window stacks over its cards as in 9:16.

import type { CSSProperties } from "react";
import type { Seed } from "../engine/random";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { estimateLines, estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { mixColors, withAlpha } from "../theme/color";
import { contrastRatio } from "../theme/contrast";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { useSceneTime, type SceneTime } from "./frameContext";
import { Caret } from "./Caret";
import { arrive, exitOpacity, fade, fitSequence, tween, type Timed } from "./motion";
import type { KitProps } from "./types";
import { caretBlink, typedText, typingSpan, type TypingSpan } from "./typing";
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
  /** Type it into the composer, then send it (the viewer's own message), instead of showing a typing indicator. */
  typed?: boolean;
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
  /** Varies the composer's typing rhythm; the same seed types the same way every time. Default 0. */
  seed?: Seed;
}

export interface ChatTiming {
  /** [start, end] of the typing indicator, or of the composer for a typed message (sent at the end), in ms from the scene's start. */
  typing: [number, number];
  /** [start, end] of the message's rise. */
  appear: [number, number];
  /** For a typed message: when each character lands in the composer. */
  chars?: number[];
}

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

/** Stands in for the caret when counting a typed message's characters. */
const CARET_ROOM = "_";

/** What the conversation's timing needs to know of a message. */
type Typed = Pick<ChatMessage, "text" | "typed">;

interface ChatSequence {
  messages: ChatTiming[];
  /** Each typed message's composer typing; undefined for the others. */
  composer: Array<TypingSpan | undefined>;
  /** [start, end] of each card's slide-in. */
  cards: Array<[number, number]>;
  /** How much the sequence is sped up to fit the scene: 1 when it fits as it is. */
  pace: number;
}

/**
 * The conversation, in ms: once the window has faded in, each message types
 * for a `beat` behind the indicator (or, typed, for its keystrokes in the
 * composer and a `beat` more before it is sent), then rises in with `enter`;
 * the next starts typing as soon as it shows. The cards follow the last
 * message, `enter`'s stagger apart. Given the scene's time, a conversation
 * that would run into the exit plays faster.
 */
function chatSequence(theme: Theme, input: number | readonly Typed[], cardCount: number, time?: SceneTime, seed: Seed = 0): ChatSequence {
  const { leadMs, fx, beat, enter } = theme.motion;
  const list: readonly Typed[] = typeof input === "number" ? Array.from({ length: input }, () => ({ text: "" })) : input;
  const start = leadMs + fx.ms;
  // At natural pace; a typed message's keystrokes count from its own start.
  const typed = list.map((m, i) => (m.typed ? typingSpan(theme, m.text, 0, `${seed}:${i}`) : undefined));
  let at = start;
  const natural = typed.map((span): [number, number] => {
    const window: [number, number] = [at, at + (span === undefined ? 0 : span.end) + beat.ms];
    at = window[1] + fx.ms;
    return window;
  });
  const lastSent = natural.at(-1)?.[1];
  const cardsStart = lastSent === undefined ? start : lastSent + fx.ms;
  const naturalEnd = cardCount > 0 ? cardsStart + (cardCount - 1) * enter.staggerMs + enter.ms : (lastSent ?? start) + enter.ms;
  const pace = time === undefined ? 1 : fitSequence(theme, time, start, naturalEnd, enter.ms);
  const paced = (ms: number) => start + (ms - start) * pace;
  const messages = natural.map(([from, sent], i): ChatTiming => {
    const timing: ChatTiming = { typing: [paced(from), paced(sent)], appear: [paced(sent), paced(sent + enter.ms)] };
    const span = typed[i];
    return span === undefined ? timing : { ...timing, chars: span.chars.map((t) => paced(from + t)) };
  });
  const composer = typed.map((span, i): TypingSpan | undefined => {
    if (span === undefined) return undefined;
    const { typing, chars } = messages[i]!;
    return { start: typing[0], typeStart: paced(natural[i]![0] + span.typeStart), chars: chars!, end: typing[1] };
  });
  const cards = Array.from({ length: cardCount }, (_, i): [number, number] => {
    const cardStart = cardsStart + i * enter.staggerMs;
    return [paced(cardStart), paced(cardStart + enter.ms)];
  });
  return { messages, composer, cards, pace };
}

/**
 * Typing and appear windows of each message, in order, in ms: of `count`
 * messages behind typing indicators, or of `messages`, whose `typed` ones type
 * into the composer with `seed`'s rhythm. Given the scene's time, sped up to
 * fit before the exit if needed.
 */
export function chatTiming(theme: Theme, messages: number | readonly Typed[], cardCount = 0, time?: SceneTime, seed: Seed = 0): ChatTiming[] {
  return chatSequence(theme, messages, cardCount, time, seed).messages;
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

/**
 * Sizes for message text in `textRole`. The composer holds a line of its
 * placeholder, or as many lines of message text as the longest message typed
 * into it takes in `composerWidth`.
 */
function sizesFor(theme: Theme, aspect: Aspect, textRole: TypeRole, typedTexts: readonly string[], composerWidth: number) {
  const { type, spacing } = theme;
  const text = type[textRole][aspect];
  const meta = type.label[aspect];
  const avatarSize = Math.round(text.size * AVATAR_EM);
  const headerHeight = Math.ceil(lineOf(type.body[aspect]) + 2 * spacing.xs + (aspect === "9:16" ? lineOf(meta) : 0));
  const typedLines = Math.max(0, ...typedTexts.map((t) => estimateLines(t + CARET_ROOM, composerWidth, text.size)));
  const composerHeight = Math.ceil(Math.max(lineOf(meta), typedLines * lineOf(text)) + 4 * spacing.xs);
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
  // The composer's text: inside its padding, its border and the text box's own padding.
  const composerWidth = width - sidebarWidth - 4 * spacing.xs - 2 * theme.hairline;
  const typedTexts = messages.filter((m) => m.typed).map((m) => m.text);

  const candidates = TEXT_ROLES.map((role) => sizesFor(theme, aspect, role, typedTexts, composerWidth));
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

/** What the composer shows while a message types into it. */
interface ComposerTyping {
  /** The text typed so far; the placeholder shows while it is empty. */
  text: string;
  /** Caret opacity, or undefined once the message has been sent. */
  caret?: number;
  /** 0..1: how far the accent focus ring is on. */
  focus: number;
}

/**
 * The composer at `ms`: the message typing into it, with a caret that blinks
 * on the empty field and once the text is in, and is solid while keys land.
 * The focus ring comes and goes with `fx.fast`.
 */
function composerAt(theme: Theme, messages: readonly ChatMessage[], composer: ReadonlyArray<TypingSpan | undefined>, ms: number): ComposerTyping | undefined {
  const fast = theme.motion["fx.fast"];
  const i = composer.findIndex((span) => span !== undefined && ms >= span.start && ms < span.end + fast.ms);
  const span = composer[i];
  if (span === undefined) return undefined;
  const focus = Math.min(fade(fast, ms - span.start), 1 - fade(fast, ms - span.end));
  if (ms >= span.end) return { text: "", focus };
  const typed = span.chars.at(-1) ?? span.typeStart;
  const caret = ms < span.typeStart ? caretBlink(theme, ms - span.start) : ms < typed ? 1 : caretBlink(theme, ms - typed);
  return { text: typedText(messages[i]!.text, span, ms), caret, focus };
}

function Composer({ channel, layout, theme, typing }: { channel: string; layout: ChatWindowLayout; theme: Theme; typing?: ComposerTyping }) {
  const { colors, fonts, spacing, radius } = theme;
  const caret = typing?.caret === undefined ? null : <Caret theme={theme} shape="bar" opacity={typing.caret} />;
  return (
    <div data-chat-composer="" style={{ flex: "none", height: layout.composerHeight, padding: spacing.xs, boxSizing: "border-box" }}>
      <div
        style={{
          height: "100%",
          // Text sits a padding below the top, so one line is centered and more fill the box downwards.
          padding: `${spacing.xs}px ${spacing.xs}px 0`,
          borderRadius: radius.sm,
          border: `${theme.hairline}px solid ${typing === undefined ? colors.border : mixColors(colors.border, colors.accent, typing.focus)}`,
          display: "flex",
          alignItems: "flex-start",
          fontFamily: fonts.body,
          boxSizing: "border-box",
        }}
      >
        {typing === undefined || typing.text === "" ? (
          <div data-chat-composer-placeholder="" style={{ color: colors.textMuted, ...typeCss(layout.meta) }}>
            {caret}
            {`Message # ${channel}`}
          </div>
        ) : (
          <div data-chat-composer-text="" style={{ minWidth: 0, color: colors.text, ...typeCss(layout.text), overflowWrap: "break-word" }}>
            {typing.text}
            {caret}
          </div>
        )}
      </div>
    </div>
  );
}

/** A message or card rising `distance` px into place over its window: it moves on `enter`'s curve and fades in with `fx` (both at the sequence's pace). */
function rise(theme: Theme, ms: number, [start, end]: [number, number], distance: number, pace: number) {
  const fx: Timed = { ...theme.motion.fx, ms: theme.motion.fx.ms * pace };
  const move = tween({ ms: end - start, curve: theme.motion.enter.curve }, ms - start);
  return { opacity: fade(fx, ms - start), offset: Math.round((1 - move) * distance * 100) / 100 };
}

/** Typing indicator opacity: in quickly (`fx.fast`), held, out just as the message starts to rise. */
function typingOpacity(theme: Theme, ms: number, [start, end]: [number, number], pace: number): number {
  if (ms <= start || ms >= end) return 0;
  const fast: Timed = { ...theme.motion["fx.fast"], ms: theme.motion["fx.fast"].ms * pace };
  return Math.min(fade(fast, ms - start), 1 - fade(fast, ms - (end - fast.ms)));
}

export function ChatWindow({ progress, theme, aspect, area: slot, channel, messages, sidebar, cards, shareId, seed = 0 }: ChatWindowProps) {
  const area = slot ?? contentArea(theme, aspect);
  const layout = chatWindowLayout(theme, aspect, { messages, sidebar, cards }, slot);
  const { colors, spacing, radius, cardShadow } = theme;
  const time = useSceneTime(progress);
  const { ms } = time;
  const enter = arrive(theme, ms, theme.motion.leadMs);
  const exit = exitOpacity(theme, time, theme.motion.enter.ms);
  const { messages: timing, composer, cards: cardTimes, pace } = chatSequence(theme, messages, cards?.length ?? 0, time, seed);
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
          opacity: enter.opacity,
          transform: `translateY(${Math.round((1 - enter.move) * spacing.lg * 100) / 100}px)`,
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
              const shown = rise(theme, ms, appear, spacing.xs * 1.5, pace);
              // The dots pulse only while the indicator shows.
              const local = Math.min(1, Math.max(0, (ms - typing[0]) / (typing[1] - typing[0])));
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
                  <div
                    data-chat-typing={i}
                    style={{ position: "absolute", left: spacing.xxs * 1.5, top: spacing.xxs, opacity: message.typed ? 0 : typingOpacity(theme, ms, typing, pace) }}
                  >
                    <TypingIndicator message={message} local={local} layout={layout} theme={theme} />
                  </div>
                </div>
              );
            })}
          </div>
          <Composer channel={channel} layout={layout} theme={theme} typing={composerAt(theme, messages, composer, ms)} />
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
            const shown = rise(theme, ms, cardTimes[i]!, slide, pace);
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
