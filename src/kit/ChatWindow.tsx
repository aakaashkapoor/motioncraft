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
// The owner's reference's interface moment: a message can carry actions
// (Approve / Reject); a scripted `cursor` moves to one and clicks it, and the
// buttons resolve ("Approved by ..." with a check). A message can then lift
// out of the window and settle as a floating card where cards go (see
// `liftOut`), carrying its `shareId` into the next scene.

import type { CSSProperties, ReactNode } from "react";
import type { Seed } from "../engine/random";
import { Icon } from "../icons";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea } from "../layout/caption";
import type { Rect, Size } from "../layout/frame";
import { estimateLines, estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { mixColors, withAlpha } from "../theme/color";
import { contrastRatio } from "../theme/contrast";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { useSceneTime, type SceneTime } from "./frameContext";
import { Caret } from "./Caret";
import { Cursor, cursorAt, cursorTiming } from "./cursor";
import { liftPose, liftScale, liftShadow, type LiftEnds } from "./liftOut";
import { arrive, exitOpacity, fade, fitSequence, pulse, tween, type Timed } from "./motion";
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

/** A button under a message, such as Approve or Reject. */
export interface ChatAction {
  /** What a `cursor` targets. Unique within the window. */
  id: string;
  label: string;
  /** Shown with a check in place of the buttons once this action is clicked, e.g. "Approved by Maya Chen". Default: the label. */
  resolved?: string;
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
  /** Buttons under the text; the first is the filled, primary one. */
  actions?: ChatAction[];
  /** Morphs the message (or, once it has lifted out, its card) across a shared-element transition. */
  shareId?: string;
  /** Lift the message out of the window to float as a card beside it, at `atMs` on the chat's clock (default: a beat after it lands or, if the cursor clicks one of its actions, once the cursor has gone). */
  lift?: { atMs?: number };
}

/** A scripted click on an action. */
export interface ChatCursor {
  /** The `id` of an action in the messages. */
  target: string;
  /** When it clicks, in ms on the chat's clock (from the scene's start, less any delay a slot puts on its content). Default: once the action's message has landed, a beat has passed and the cursor has moved in. */
  atMs?: number;
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
  /** A cursor that moves to an action and clicks it, resolving it. */
  cursor?: ChatCursor;
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
/** Share of the 16:9 width the window takes when cards (or a lifted card) sit beside it: about 1080 px, as in the reference. */
const WINDOW_SHARE_WITH_CARDS = 0.62;
/** How far a button's fill moves away from its label's colour as the cursor arrives. */
const HOVER_TINT = 0.12;
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

export interface ChatMoments {
  /** When the cursor clicks its target, if there is one. */
  clickMs?: number;
  /** When each message lifts out; undefined for those that stay. */
  liftMs: Array<number | undefined>;
}

type MomentsInput = Pick<ChatWindowProps, "messages" | "cursor" | "cards">;

/** The message holding the action `target`; throws, naming the actions there are, if none does. */
function targetMessage(messages: readonly ChatMessage[], target: string): number {
  const index = messages.findIndex((m) => m.actions?.some((a) => a.id === target));
  if (index >= 0) return index;
  const known = messages.flatMap((m) => m.actions?.map((a) => a.id) ?? []);
  throw new Error(`ChatWindow: cursor target "${target}" is not an action in the messages (actions: ${known.length ? known.join(", ") : "none"})`);
}

/**
 * The interface moments, in ms: the cursor clicks once its target's message
 * has landed and a beat has passed (it fades in then and moves over the
 * `cursor` token); a message lifts out once the cursor has gone from a click
 * on it, or a beat after it lands. Times a storyboard gives are kept.
 */
export function chatMoments(theme: Theme, { messages, cursor, cards }: MomentsInput, time?: SceneTime, seed: Seed = 0): ChatMoments {
  const { beat, fx } = theme.motion;
  const timing = chatSequence(theme, messages, cards?.length ?? 0, time, seed).messages;
  const target = cursor === undefined ? undefined : targetMessage(messages, cursor.target);
  const clickMs = cursor === undefined ? undefined : (cursor.atMs ?? timing[target!]!.appear[1] + beat.ms + fx.ms + theme.motion.cursor.ms);
  const liftMs = messages.map((m, i) => {
    if (m.lift === undefined) return undefined;
    if (m.lift.atMs !== undefined) return m.lift.atMs;
    return i === target ? cursorTiming(theme, clickMs!).leaveMs[1] : timing[i]!.appear[1] + beat.ms;
  });
  return { clickMs, liftMs };
}

/**
 * A lifting message's card: where it lifts from and settles (frame px), and
 * its unscaled size once settled (the height is an estimate). It leaves
 * `fromWidth` wide, holding the message at its width in the list, and reflows
 * to `width` as it settles.
 */
export interface ChatLift extends LiftEnds {
  fromWidth: number;
  /** How far the list closes up as the message leaves it, in px (its estimated height and a gap); 0 where it stays as a ghost. */
  collapse: number;
  width: number;
  height: number;
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
  /** Each lifting message's card; undefined for those that stay. */
  lifts: Array<ChatLift | undefined>;
  /**
   * How far right of `window.x` the window waits, in px, until a message
   * lifts out: in 16:9 it waits centered and slides to its place beside the
   * card as the card lifts. 0 when nothing lifts beside it.
   */
  windowShift: number;
  /**
   * How much shorter the window gets as its lifting messages leave, in px:
   * in 9:16 the list closes up over them so the card settles below the window,
   * clear of its composer. 0 in 16:9, where they stay as ghosts.
   */
  windowCollapse: number;
}

type LayoutInput = Pick<ChatWindowProps, "messages" | "sidebar" | "cards">;

/** A lifted card's padding: a card's (see `cardMetrics`). */
const liftPadding = (theme: Theme, aspect: Aspect) => (aspect === "9:16" ? theme.spacing.md : Math.round(theme.spacing.md * 0.8));

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

/** Height of an action button (and of what it resolves to). */
const actionHeight = (theme: Theme, meta: TypeSpec) => lineOf(meta) + 2 * theme.spacing.xxs + 2 * theme.hairline;

/** Estimated height of one message with message text `text`, in a list `width` px wide. */
function messageHeight(theme: Theme, m: ChatMessage, width: number, text: TypeSpec, meta: TypeSpec, avatarSize: number): number {
  const { spacing } = theme;
  const textWidth = width - avatarSize - spacing.xs - 2 * spacing.xs;
  let height = lineOf(meta) + spacing.xxs + estimateTextHeight(m.text, textWidth, text);
  if (m.reactions?.length) height += spacing.xxs + lineOf(meta) + spacing.xs;
  if (m.actions?.length) height += spacing.xs + actionHeight(theme, meta);
  return Math.max(avatarSize, height) + 2 * spacing.xxs;
}

/**
 * Where the window and the cards go inside `slot` (the content area when
 * there is none), and the largest message text size at which every message
 * fits. The window is as tall as its content needs (never under
 * `MIN_HEIGHT_SHARE` of the room); alone, it centers on the frame's optical
 * center (see `blockCenterY`). Stacked, it is a window's width, centered. If
 * no size fits, the smallest: the window then overflows visibly and the
 * layer-1 checks report it. A lifting message settles where cards go: beside
 * the window in a wide area (the window waits centered, then slides aside as
 * the card reflows into the room beside it, its text unshrunk); otherwise
 * below it, the two centered together, the list closing up over the message
 * as it leaves so the card clears the composer.
 */
export function chatWindowLayout(theme: Theme, aspect: Aspect, { messages, sidebar, cards }: LayoutInput, slot?: Rect): ChatWindowLayout {
  const area = slot ?? contentArea(theme, aspect);
  const { spacing, hairline } = theme;
  const gap = spacing.md;
  const hasCards = (cards?.length ?? 0) > 0;
  const hasLift = messages.some((m) => m.lift !== undefined);
  if (hasCards && hasLift) throw new Error("ChatWindow: a message that lifts out settles where the cards go; give it cards or a lift, not both");
  const side = hasCards || hasLift;
  const wide = aspect === "16:9" && area.width >= area.height * WIDE_RATIO;
  const pad = liftPadding(theme, aspect);
  const sidebarFor = (w: number) => (wide && sidebar ? Math.min(MAX_SIDEBAR_WIDTH, Math.floor(w * SIDEBAR_SHARE)) : 0);
  // A lifted card leaves holding the message at its width in the list.
  const cardWidthFor = (w: number) => w - sidebarFor(w) - 2 * spacing.md + 2 * pad;
  const width = !wide ? windowWidth(theme, aspect, area).width : side ? Math.floor((area.width - gap) * WINDOW_SHARE_WITH_CARDS) : Math.min(area.width, MAX_WINDOW_WIDTH);
  const x = wide && side ? area.x : area.x + Math.floor((area.width - width) / 2);
  // Beside a 16:9 window, the lifted card reflows to fill the room left at the lift token's scale, its text unshrunk.
  const sideRoom = area.x + area.width - (x + width + gap);
  const settledWidth = wide ? Math.min(cardWidthFor(width), Math.floor(sideRoom / theme.motion.liftOut.scale)) : cardWidthFor(width);
  // Stacked cards take their share of the height; a lifted card floats in front of the window instead.
  const room = !wide && hasCards ? Math.floor((area.height - gap) * WINDOW_SHARE_TALL) : area.height;
  const sidebarWidth = sidebarFor(width);
  const listWidth = width - sidebarWidth - 2 * spacing.md;
  // The composer's text: inside its padding, its border and the text box's own padding.
  const composerWidth = width - sidebarWidth - 4 * spacing.xs - 2 * hairline;
  const typedTexts = messages.filter((m) => m.typed).map((m) => m.text);

  const candidates = TEXT_ROLES.map((role) => sizesFor(theme, aspect, role, typedTexts, composerWidth));
  type Sizes = (typeof candidates)[number];
  const heightsOf = (s: Sizes) => messages.map((m) => messageHeight(theme, m, listWidth, s.text, s.meta, s.avatarSize));
  // A settled card holds the message at its own width, inside its padding and border.
  const cardSizeOf = (s: Sizes, i: number) => ({
    width: settledWidth,
    height: Math.ceil(messageHeight(theme, messages[i]!, settledWidth - 2 * pad - 2 * hairline, s.text, s.meta, s.avatarSize) + 2 * pad + 2 * hairline),
  });
  // Stacked, a lifted card's scale: it has the whole area's width.
  const stackedScale = (size: Size) => liftScale(theme, size, area);
  const shownBelow = (s: Sizes) =>
    wide ? 0 : Math.max(0, ...messages.map((m, i) => (m.lift === undefined ? 0 : cardSizeOf(s, i).height * stackedScale(cardSizeOf(s, i)))));
  // Stacked, the list closes up over each lifting message as it leaves.
  const collapseOf = (s: Sizes, i: number) => (wide || messages[i]!.lift === undefined ? 0 : Math.floor(heightsOf(s)[i]! + spacing.xs));
  const collapsed = (s: Sizes) => messages.reduce((sum, _, i) => sum + collapseOf(s, i), 0);
  // Stacked with a lifted card, the window leaves room for the whole card below it once closed up, clear of its composer.
  const roomFor = (s: Sizes) => (wide || !hasLift ? room : room - gap - Math.ceil(shownBelow(s)) + collapsed(s));
  const needed = (s: Sizes) => {
    const list = heightsOf(s).reduce((sum, h) => sum + h, 0);
    const chat = list + spacing.xs * (Math.max(0, messages.length - 1) + 2) + s.headerHeight + s.composerHeight;
    const sideBar = sidebarWidth > 0 && sidebar ? 2 * spacing.md + (sidebar.channels.length + 1) * (lineOf(s.meta) + 2 * spacing.xxs) + spacing.xs : 0;
    return Math.max(chat, sideBar);
  };
  const sizes = candidates.find((s) => needed(s) <= roomFor(s)) ?? candidates.at(-1)!;
  const windowRoom = roomFor(sizes);
  const height = Math.min(windowRoom, Math.max(Math.ceil(needed(sizes) * CONTENT_SLACK), Math.floor(windowRoom * MIN_HEIGHT_SHARE)));
  const heights = heightsOf(sizes);
  const cardSize = (i: number) => cardSizeOf(sizes, i);
  const below = shownBelow(sizes);
  const windowCollapse = collapsed(sizes);
  // Stacked with a lifted card, the block is the closed-up window and the card below it.
  const block = { width, height: below > 0 ? Math.min(area.height, height - windowCollapse + gap + below) : height };
  // Alone, the window is centered; stacked with cards it sits on top and the cards follow it.
  const y = !wide && hasCards ? area.y : Math.floor(placeBlock(area, block, blockCenterY(theme, aspect, slot)).y);
  const window = { x, y, width, height };
  let region: Rect | undefined;
  if (side && wide) {
    // A band centered on the window, as tall as the area allows, so the cards center on it.
    const middle = y + height / 2;
    const half = Math.min(middle - area.y, area.y + area.height - middle);
    region = { x: x + width + gap, y: middle - half, width: area.x + area.width - (x + width + gap), height: 2 * half };
  }
  if (side && !wide) {
    const top = y + height - windowCollapse + gap;
    region = { x, y: top, width, height: area.y + area.height - top };
  }

  // The list is bottom-aligned: a message's bottom is the list's, less the messages under it.
  const listBottom = y + height - hairline - sizes.composerHeight - spacing.xs;
  // In 16:9 the window waits centered until the card lifts, so the frame is never half empty.
  const windowShift = wide && hasLift ? Math.floor((area.width - width) / 2) - (x - area.x) : 0;
  const lifts = messages.map((m, i): ChatLift | undefined => {
    if (m.lift === undefined || region === undefined) return undefined;
    const size = cardSize(i);
    const under = heights.slice(i + 1).reduce((sum, h) => sum + h + spacing.xs, 0);
    const from = { x: x + windowShift + sidebarWidth + spacing.md - pad, bottom: listBottom - under + pad + hairline };
    const scale = wide ? liftScale(theme, size, region) : stackedScale(size);
    const shown = { width: size.width * scale, height: size.height * scale };
    const bottom = wide ? y + height / 2 + shown.height / 2 : Math.min(area.y + area.height, region.y + shown.height);
    const to = { x: region.x + (region.width - shown.width) / 2, bottom };
    return { from, to, scale, fromWidth: cardWidthFor(width), collapse: collapseOf(sizes, i), ...size };
  });
  return { window, cards: hasCards ? region : undefined, sidebarWidth, ...sizes, lifts, windowShift, windowCollapse };
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

function MessageBody({ message, layout, theme, aspect, actions }: { message: ChatMessage; layout: ChatWindowLayout; theme: Theme; aspect: Aspect; actions?: ReactNode }) {
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
        {actions}
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

/** Where a message's actions are: which was clicked, how far they have resolved, and the cursor if it is on its way to one. */
interface ActionsState {
  /** The clicked action, from the click on. */
  clicked?: string;
  /** 0..1: the buttons giving way to the resolved line. */
  resolved: number;
  /** The resolved line's `pop` as it lands, 0 at rest. */
  pop: number;
  /** The action the cursor targets, and 0..1 how far it is lit as the cursor arrives. */
  target?: string;
  hover: number;
  /** The cursor, drawn in its target's place. */
  cursor?: ReactNode;
}

function actionStyle(theme: Theme, layout: ChatWindowLayout, primary: boolean, hover: number): CSSProperties {
  const { colors, fonts, spacing, radius, hairline, weights } = theme;
  const fill = primary ? colors.accent : colors.surface;
  const label = primary ? colors.accentText : colors.text;
  // Lit as the cursor arrives: tinted away from the label, so it reads at least as well.
  const away = contrastRatio(label, colors.surface) >= contrastRatio(label, colors.text) ? colors.surface : colors.text;
  return {
    padding: `${spacing.xxs}px ${spacing.sm}px`,
    borderRadius: radius.sm,
    border: `${hairline}px solid ${primary ? colors.accent : colors.border}`,
    backgroundColor: hover > 0 ? mixColors(fill, away, HOVER_TINT * hover) : fill,
    color: label,
    fontFamily: fonts.body,
    ...typeCss(layout.meta),
    fontWeight: weights.semibold,
    whiteSpace: "nowrap",
  };
}

/**
 * A message's buttons and, once one is clicked, the line they resolve to (a
 * check and, say, "Approved by Maya Chen"), in the same place. The cursor
 * draws in a hidden copy of the buttons, so it lands on its target exactly
 * and stays while the buttons fade.
 */
function Actions({ actions, layout, theme, state }: { actions: ChatAction[]; layout: ChatWindowLayout; theme: Theme; state: ActionsState }) {
  const { colors, fonts, spacing, radius, hairline, weights } = theme;
  const cell: CSSProperties = { gridArea: "1 / 1", display: "flex", gap: spacing.xs, alignItems: "center" };
  const clicked = actions.find((a) => a.id === state.clicked);
  return (
    <div style={{ display: "grid", justifyItems: "start", marginTop: spacing.xs - spacing.xxs }}>
      <div data-chat-actions="" style={{ ...cell, opacity: 1 - state.resolved }}>
        {actions.map((action, i) => (
          <div key={action.id} data-chat-action={action.id} style={actionStyle(theme, layout, i === 0, action.id === state.target ? state.hover : 0)}>
            {action.label}
          </div>
        ))}
      </div>
      {clicked !== undefined && (
        <div
          data-chat-resolved={clicked.id}
          style={{
            ...cell,
            gap: spacing.xxs,
            opacity: state.resolved,
            transform: `scale(${Math.round((1 + (theme.motion.pop.scale - 1) * state.pop) * 1000) / 1000})`,
            transformOrigin: "0 50%",
            padding: `${spacing.xxs}px ${spacing.sm}px ${spacing.xxs}px ${spacing.xs}px`,
            borderRadius: radius.pill,
            border: `${hairline}px solid ${colors.border}`,
            backgroundColor: colors.surfaceAlt,
            color: colors.text,
            fontFamily: fonts.body,
            ...typeCss(layout.meta),
            fontWeight: weights.semibold,
            whiteSpace: "nowrap",
          }}
        >
          <Icon name="check" size={Math.round(layout.meta.size)} color={colors.accent} strokeWidth={3} />
          {clicked.resolved ?? clicked.label}
        </div>
      )}
      {state.cursor !== undefined && (
        <div aria-hidden style={{ ...cell, visibility: "hidden" }}>
          {actions.map((action, i) => (
            <div key={action.id} {...(action.id === state.target ? { "data-cursor-target": action.id } : {})} style={{ ...actionStyle(theme, layout, i === 0, 0), position: "relative" }}>
              {action.label}
              {action.id === state.target && (
                <div style={{ position: "absolute", left: "50%", top: "60%", visibility: "visible" }}>{state.cursor}</div>
              )}
            </div>
          ))}
        </div>
      )}
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

/** A message's own box in the list: a highlighted one is tinted and marked with the accent. */
function messageStyle(theme: Theme, message: ChatMessage): CSSProperties {
  const { colors, spacing, radius } = theme;
  return {
    padding: spacing.xxs,
    borderRadius: radius.sm,
    borderLeft: `${spacing.xxs / 2}px solid ${message.highlight ? colors.accent : "transparent"}`,
    backgroundColor: message.highlight ? mixColors(colors.surface, colors.accent, 0.08) : "transparent",
  };
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

/** The actions of message `index` at `ms`: resolving from the click on, lit as the cursor arrives, with the cursor if it targets one of them. */
function actionsAt(theme: Theme, ms: number, message: ChatMessage, cursor: ChatCursor | undefined, clickMs: number | undefined, withCursor: boolean): ActionsState {
  const fast = theme.motion["fx.fast"];
  const target = cursor !== undefined && message.actions?.some((a) => a.id === cursor.target) ? cursor.target : undefined;
  if (target === undefined || clickMs === undefined) return { resolved: 0, pop: 0, hover: 0 };
  const clicked = ms >= clickMs;
  return {
    clicked: clicked ? target : undefined,
    resolved: clicked ? fade(fast, ms - clickMs) : 0,
    pop: clicked ? Math.max(0, pulse(theme.motion.pop, ms - clickMs)) : 0,
    target,
    hover: clicked ? 0 : fade(fast, ms - (clickMs - fast.ms)),
    // Only while it shows: its copy of the buttons is text too.
    cursor: withCursor && cursorAt(theme, ms, clickMs).opacity > 0 ? <Cursor theme={theme} ms={ms} clickMs={clickMs} /> : undefined,
  };
}

export function ChatWindow({ progress, theme, aspect, area: slot, channel, messages, sidebar, cards, shareId, seed = 0, cursor }: ChatWindowProps) {
  const area = slot ?? contentArea(theme, aspect);
  const layout = chatWindowLayout(theme, aspect, { messages, sidebar, cards }, slot);
  const { colors, spacing, radius, cardShadow } = theme;
  const time = useSceneTime(progress);
  const { ms } = time;
  const enter = arrive(theme, ms, theme.motion.leadMs);
  const exit = exitOpacity(theme, time, theme.motion.enter.ms);
  const { messages: timing, composer, cards: cardTimes, pace } = chatSequence(theme, messages, cards?.length ?? 0, time, seed);
  const { clickMs, liftMs } = chatMoments(theme, { messages, cursor, cards }, time, seed);
  const poses = layout.lifts.map((lift, i) => (lift === undefined ? undefined : liftPose(theme, ms, liftMs[i]!, lift)));
  // How far each lift has gone, on the `enter` spring: its card reflows to its width, and the window slides over with the first.
  const liftMove = (i: number) => (liftMs[i] === undefined || ms < liftMs[i]! ? 0 : Math.min(1, tween(theme.motion.enter, ms - liftMs[i]!)));
  const firstLift = layout.lifts.findIndex((lift) => lift !== undefined);
  const shift = firstLift < 0 ? 0 : Math.round(layout.windowShift * (1 - liftMove(firstLift)) * 100) / 100;
  const closedUp = layout.lifts.reduce((sum, lift, i) => sum + (lift === undefined ? 0 : lift.collapse * liftMove(i)), 0);
  const pad = liftPadding(theme, aspect);
  const shadow = `0 ${cardShadow.y}px ${cardShadow.blur}px ${withAlpha(colors.shadow, cardShadow.opacity)}`;
  const at = (rect: Rect): CSSProperties => ({ position: "absolute", left: rect.x - area.x, top: rect.y - area.y, width: rect.width, height: rect.height });
  const slide = spacing.md;
  const actionsOf = (message: ChatMessage, withCursor: boolean) =>
    message.actions?.length ? <Actions actions={message.actions} layout={layout} theme={theme} state={actionsAt(theme, ms, message, cursor, clickMs, withCursor)} /> : undefined;

  return (
    <div style={{ position: "absolute", left: area.x, top: area.y, width: area.width, height: area.height, opacity: exit }}>
      <div
        data-share-id={shareId}
        data-block="chat window"
        style={{
          ...at({ ...layout.window, x: layout.window.x + shift, height: Math.round((layout.window.height - closedUp) * 100) / 100 }),
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
              const pose = poses[i];
              // Once lifted, the card carries the shareId and this is the ghost of where it was.
              const share = message.shareId !== undefined && !pose?.lifted ? { "data-share-id": message.shareId } : {};
              // The dots pulse only while the indicator shows.
              const local = Math.min(1, Math.max(0, (ms - typing[0]) / (typing[1] - typing[0])));
              // Where the list closes up over a lifted message, its ghost fades as its place closes.
              const lift = layout.lifts[i];
              const closing = lift !== undefined && lift.collapse > 0 && pose?.lifted ? liftMove(i) : 0;
              const closeStyle: CSSProperties =
                closing > 0
                  ? { height: Math.round(Math.max(0, lift!.collapse - spacing.xs) * (1 - closing) * 100) / 100, marginTop: -Math.round(spacing.xs * closing * 100) / 100, overflow: "hidden" }
                  : {};
              return (
                <div key={i} style={{ position: "relative", ...closeStyle }}>
                  <div
                    data-chat-message={i}
                    {...share}
                    style={{ ...messageStyle(theme, message), opacity: Math.round(shown.opacity * (pose?.ghost ?? 1) * (1 - closing) * 10000) / 10000, transform: `translateY(${shown.offset}px)` }}
                  >
                    <MessageBody message={message} layout={layout} theme={theme} aspect={aspect} actions={actionsOf(message, !pose?.lifted)} />
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
      {layout.lifts.map((lift, i) => {
        const pose = poses[i];
        if (lift === undefined || pose === undefined || !pose.lifted) return null;
        const message = messages[i]!;
        return (
          <div
            key={`lift-${i}`}
            data-chat-lift={i}
            {...(message.shareId === undefined ? {} : { "data-share-id": message.shareId })}
            style={{
              position: "absolute",
              left: Math.round((lift.to.x - area.x) * 100) / 100,
              bottom: Math.round((area.y + area.height - lift.to.bottom) * 100) / 100,
              width: Math.round((lift.fromWidth + (lift.width - lift.fromWidth) * liftMove(i)) * 100) / 100,
              padding: pad,
              boxSizing: "border-box",
              backgroundColor: colors.surface,
              border: `${theme.hairline}px solid ${colors.border}`,
              borderRadius: radius.md,
              boxShadow: liftShadow(theme, pose.shadow),
              transformOrigin: "0 100%",
              transform: `translate(${pose.dx}px, ${pose.dy}px) scale(${pose.scale})`,
            }}
          >
            <div style={messageStyle(theme, message)}>
              <MessageBody message={message} layout={layout} theme={theme} aspect={aspect} actions={actionsOf(message, false)} />
            </div>
          </div>
        );
      })}
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
