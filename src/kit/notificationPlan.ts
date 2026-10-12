// The pure side of `Notification`: prop checks, when each banner drops, where
// the banners rest and how far each has moved at a given ms. Ported from
// HyperFrames native-notification-pop: a closed-form underdamped spring
// (omega 15, zeta 0.74: first contact at ~310 ms, ~3% overshoot) carries a
// banner down from above, here stretched to land exactly at 450 ms.

import { spring } from "../engine/spring";
import { isIconName } from "../icons";
import { contentArea } from "../layout/caption";
import { isTall, type Rect } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import type { SceneTime } from "./frameContext";
import { fitSequence } from "./motion";

/** One banner. */
export interface NotificationItem {
  /** The app's name, in the small muted line. */
  app: string;
  /** The bold first line. */
  title: string;
  /** One line under the title; cut with an ellipsis when long. */
  body?: string;
  /** The app's icon (see `ICON_NAMES`). Default "zap". */
  icon?: string;
  /** A short time beside the app name, such as "now" or "9:41". */
  time?: string;
}

export const NOTIFICATION_MAX = 3;
/** The default first drop and the gap to each next one, in ms. */
export const NOTIFICATION_FIRST_MS = 400;
export const NOTIFICATION_GAP_MS = 900;
/** How long a drop (and the push it gives the banners below) takes to land. */
export const NOTIFICATION_DROP_MS = 450;
/** The source's spring: omega 15 rad/s, zeta 0.74, as stiffness and damping at mass 1. */
const DROP_SPRING = { stiffness: 225, damping: 22.2 };
/** In 16:9 a banner is this wide, or the slot's width if narrower. */
const WIDE_BANNER_PX = 640;
/** The icon is this many title line heights across. */
const ICON_LINES = 1.5;

const isText = (value: unknown) => typeof value === "string" && value.trim() !== "";

/** What is wrong with the props, if anything: one message per problem. Pure. */
export function notificationErrors(props: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const { notifications, atMs } = props;
  if (!Array.isArray(notifications) || notifications.length < 1 || notifications.length > NOTIFICATION_MAX) {
    return [`notifications must be a list of 1-${NOTIFICATION_MAX} banners`];
  }
  notifications.forEach((item: unknown, i) => {
    const at = `notifications[${i}]`;
    if (typeof item !== "object" || item === null) return void errors.push(`${at} must be an object`);
    const { app, title, body, icon, time } = item as Record<string, unknown>;
    if (!isText(app)) errors.push(`${at}.app must be a non-empty string`);
    if (!isText(title)) errors.push(`${at}.title must be a non-empty string`);
    if (body !== undefined && typeof body !== "string") errors.push(`${at}.body must be a string`);
    if (time !== undefined && typeof time !== "string") errors.push(`${at}.time must be a string`);
    if (icon !== undefined && (typeof icon !== "string" || !isIconName(icon))) errors.push(`${at}.icon "${String(icon)}" is not a known icon`);
  });
  if (atMs !== undefined) {
    const ok =
      Array.isArray(atMs) &&
      atMs.length === notifications.length &&
      atMs.every((t, i) => typeof t === "number" && Number.isFinite(t) && t >= 0 && (i === 0 || t >= (atMs[i - 1] as number)));
    if (!ok) errors.push(`atMs must give one drop time in ms (>= 0, in order) per notification`);
  }
  return errors;
}

export interface NotificationTiming {
  /** When each banner starts to drop, in scene ms. */
  drops: number[];
}

/**
 * When each banner drops: `atMs`, or 400 ms then every 900 ms. Given the
 * scene's time, a sequence that would run into the exit plays faster, like
 * chat messages (see `fitSequence`).
 */
export function notificationTiming(theme: Theme, count: number, atMs?: readonly number[], time?: SceneTime): NotificationTiming {
  const natural = atMs?.slice(0, count) ?? Array.from({ length: count }, (_, i) => NOTIFICATION_FIRST_MS + i * NOTIFICATION_GAP_MS);
  const first = natural[0] ?? 0;
  const last = natural.at(-1) ?? 0;
  const pace = time === undefined ? 1 : fitSequence(theme, time, first, last + NOTIFICATION_DROP_MS, theme.motion.enter.ms);
  return { drops: pace === 1 ? natural : natural.map((t) => Math.round(first + (t - first) * pace)) };
}

/** How far a drop is, `elapsedMs` after it starts: 0 before, the spring (overshooting a touch), exactly 1 from 450 ms. */
export function dropProgress(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= NOTIFICATION_DROP_MS) return 1;
  // Frames are ms: the natural curve is stretched to land at the drop's length.
  return spring({ frame: elapsedMs / 10, fps: 100, config: DROP_SPRING, durationInFrames: NOTIFICATION_DROP_MS / 10 });
}

export interface NotificationLayout {
  /** Where each banner rests once every banner has landed (newest on top), in frame px. */
  rest: Rect[];
  /** Each banner's height. */
  heights: number[];
  /** The y of the top of the stack. */
  top: number;
  /** The gap between stacked banners. */
  gap: number;
  padding: number;
  /** The icon's side. */
  icon: number;
  /** App name and time; title; body. */
  meta: TypeSpec;
  title: TypeSpec;
  body: TypeSpec;
}

/** Type steps to try, largest first: [meta, title, body]. */
const STEPS: readonly (readonly [TypeRole, TypeRole, TypeRole])[] = [
  ["eyebrow", "body", "label"],
  ["eyebrow", "label", "eyebrow"],
];

const lineOf = (spec: TypeSpec) => spec.size * spec.lineHeight;

/**
 * Where the banners go inside `slot` (the content area by default). 9:16:
 * top-center at the full width; 16:9: top-right, 640 px or the slot's width.
 * The type steps down once if the whole stack would not fit the slot's height.
 */
export function notificationLayout(theme: Theme, aspect: Aspect, notifications: readonly NotificationItem[], slot?: Rect): NotificationLayout {
  const area = slot ?? contentArea(theme, aspect);
  const { spacing, weights, type } = theme;
  const width = isTall(aspect) ? area.width : Math.min(WIDE_BANNER_PX, area.width);
  const x = isTall(aspect) ? area.x + (area.width - width) / 2 : area.x + area.width - width;
  const gap = spacing.xs;
  const padding = isTall(aspect) ? spacing.md : spacing.sm;
  const sized = (step: (typeof STEPS)[number]) => {
    const [meta, title, body] = step.map((role) => type[role][aspect]) as [TypeSpec, TypeSpec, TypeSpec];
    const specs = { meta: { ...meta, weight: weights.medium, tracking: 0.02 }, title: { ...title, weight: weights.bold }, body: { ...body, weight: weights.regular } };
    const icon = Math.round(lineOf(specs.title) * ICON_LINES);
    const heights = notifications.map((n) => {
      const text = lineOf(specs.meta) + lineOf(specs.title) + (n.body === undefined || n.body === "" ? 0 : lineOf(specs.body));
      return Math.ceil(2 * padding + Math.max(icon, text));
    });
    const total = heights.reduce((sum, h) => sum + h, 0) + gap * (heights.length - 1);
    return { specs, icon, heights, total };
  };
  const chosen = STEPS.map(sized).find((s) => s.total <= area.height) ?? sized(STEPS.at(-1)!);
  const { specs, icon, heights } = chosen;
  const top = area.y;
  // Newest on top: banner i rests below every later banner.
  const rest = heights.map((height, i) => {
    const above = heights.slice(i + 1).reduce((sum, h) => sum + h + gap, 0);
    return { x, y: top + above, width, height };
  });
  return { rest, heights, top, gap, padding, icon, ...specs };
}

/** A banner's place at a moment: its top in frame px and its opacity. */
export interface BannerPose {
  y: number;
  /** 0 before it drops (not drawn), up to 1 as it fades in. */
  opacity: number;
  /** How far its own drop is, 0..1 (may overshoot). */
  drop: number;
}

/**
 * Where each banner is at `ms`: dropping from just above the stack's top
 * into it, and pushed down by every later banner's drop on the same spring.
 */
export function bannerPoses(layout: NotificationLayout, drops: readonly number[], ms: number, fadeIn: (elapsedMs: number) => number): BannerPose[] {
  const { heights, top, gap } = layout;
  const landed = drops.map((start) => dropProgress(ms - start));
  return heights.map((height, i) => {
    const pushed = heights.slice(i + 1).reduce((sum, h, k) => sum + (h + gap) * landed[i + 1 + k]!, 0);
    const lift = (1 - landed[i]!) * (height + gap);
    const started = ms >= drops[i]!;
    return { y: top + pushed - lift, opacity: started ? fadeIn(ms - drops[i]!) : 0, drop: landed[i]! };
  });
}
