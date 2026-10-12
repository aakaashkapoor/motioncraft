// A before/after comparison (HyperFrames before-after-wipe): two content slots
// share one rounded card. Each state's component lays itself out in its own
// resting half, so both read whole once the divider rests; full-bleed media
// (an Image, a VideoClip) instead fill the whole card in one shared coordinate
// space, the source's picture-over-picture wipe. The card arrives with the
// before state and holds it; then a divider sweeps the after layer in from the
// start edge (left, or top when vertical) past the resting split to ~85%, and
// eases back to `split`, where it rests for the hold. The after layer is cut
// with `clip-path: inset(...)` at the divider. Small label chips sit in each
// half's corner: the before chip arrives with the card, the after chip once
// the wipe has passed it. The divider is the accent: a 4 px line with a round
// handle, drawn outside the card's clip so the handle is never cut.

import { CameraFree } from "../camera/Camera";
import { contentArea } from "../layout/caption";
import { frameSize, isTall, type Rect } from "../layout/frame";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { withAlpha } from "../theme/color";
import type { Theme } from "../theme/types";
import { windowMotion } from "./AppWindow";
import { entering, useSceneTime, VisibleRectContext } from "./frameContext";
// The registry imports this module; it is only read at render time.
import { kit } from "./index";
import { FULL_BLEED_COMPONENTS } from "./media";
import { fade, tween, type Timed } from "./motion";
import { Slot, type SlotContent } from "./Slot";
import type { KitProps } from "./types";
import { windowWidth } from "./windowLayout";

export type BeforeAfterDirection = "horizontal" | "vertical";
export const BEFORE_AFTER_DIRECTIONS: readonly BeforeAfterDirection[] = ["horizontal", "vertical"];

export interface BeforeAfterProps extends KitProps {
  /** The base layer: any kit component, rendered like a window's `content`. */
  before: SlotContent;
  /** The layer the divider reveals, in the same box as `before`. */
  after: SlotContent;
  /** The before half's chip. Default "Before"; empty hides it. */
  beforeLabel?: string;
  /** The after half's chip. Default "After"; empty hides it. */
  afterLabel?: string;
  /** Where the divider rests, as a share of the card from the start edge: 0.2-0.8, default 0.5. */
  split?: number;
  /** `horizontal`: the divider moves left to right. Default horizontal in 16:9, vertical in tall aspects (9:16, 4:5). */
  direction?: BeforeAfterDirection;
}

export const BEFORE_AFTER_SPLIT_MIN = 0.2;
export const BEFORE_AFTER_SPLIT_MAX = 0.8;
/** How far the divider sweeps before it eases back to the split. */
const OVERSHOOT_AT = 0.85;
/** The before state holds this long after the card arrives, before the wipe. */
const HOLD_MS = 600;
/** The sweep to the overshoot, on the source's sine.inOut. */
const SWEEP: Timed = { ms: 800, curve: "sineInOut" };
/** The ease back to the split, power2.out (cubic). */
const SETTLE: Timed = { ms: 450, curve: [0.33, 1, 0.68, 1] };
/** Divider line width in px. */
const LINE_PX = 4;
/** Handle diameter, as a multiple of the label type size. */
const HANDLE_EM = 2.2;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** What is wrong with the props, if anything. Pure. */
export function beforeAfterErrors(props: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const slot of ["before", "after"] as const) {
    const spec = props[slot];
    if (!isObject(spec) || typeof spec.component !== "string") errors.push(`${slot} must be a component spec ({ component, props })`);
    else if (!Object.hasOwn(kit, spec.component)) errors.push(`${slot}: unknown component "${spec.component}"`);
    else if (spec.props !== undefined && !isObject(spec.props)) errors.push(`${slot}.props must be an object`);
  }
  for (const label of ["beforeLabel", "afterLabel"] as const) {
    if (props[label] !== undefined && typeof props[label] !== "string") errors.push(`${label} must be a string`);
  }
  const split = props.split;
  if (split !== undefined && (typeof split !== "number" || !(split >= BEFORE_AFTER_SPLIT_MIN && split <= BEFORE_AFTER_SPLIT_MAX))) {
    errors.push(`split must be a number from ${BEFORE_AFTER_SPLIT_MIN} to ${BEFORE_AFTER_SPLIT_MAX}, got ${String(split)}`);
  }
  if (props.direction !== undefined && !BEFORE_AFTER_DIRECTIONS.includes(props.direction as BeforeAfterDirection)) {
    errors.push(`direction must be one of ${BEFORE_AFTER_DIRECTIONS.join(", ")}, got ${String(props.direction)}`);
  }
  return errors;
}

export interface BeforeAfterTiming {
  /** When the divider sets off, in scene ms. */
  wipeMs: number;
  /** How long the sweep to the overshoot lasts. */
  sweepMs: number;
  /** When the after chip starts to fade in. */
  afterChipMs: number;
  /** When the divider rests at the split. */
  settledMs: number;
}

/** When each move happens, in scene ms. Pure. */
export function beforeAfterTiming(theme: Theme): BeforeAfterTiming {
  const wipeMs = theme.motion.leadMs + HOLD_MS;
  return { wipeMs, sweepMs: SWEEP.ms, afterChipMs: wipeMs + SWEEP.ms / 2, settledMs: wipeMs + SWEEP.ms + SETTLE.ms };
}

/** The divider's position at scene `ms`, 0..1 from the start edge: 0, out to the overshoot, back to `split`. Pure. */
export function beforeAfterSplit(theme: Theme, ms: number, split: number): number {
  const { wipeMs, settledMs } = beforeAfterTiming(theme);
  if (ms >= settledMs) return split;
  const out = tween(SWEEP, ms - wipeMs) * OVERSHOOT_AT;
  return out + (split - OVERSHOOT_AT) * tween(SETTLE, ms - wipeMs - SWEEP.ms);
}

const round = (n: number, places = 3) => Math.round(n * 10 ** places) / 10 ** places + 0;

/** The after layer's clip with the divider at `position`: everything past the divider is cut. Pure. */
export function beforeAfterClip(direction: BeforeAfterDirection, position: number): string {
  const cut = `${round((1 - Math.min(1, Math.max(0, position))) * 100)}%`;
  return direction === "horizontal" ? `inset(0 ${cut} 0 0)` : `inset(0 0 ${cut} 0)`;
}

export interface BeforeAfterLayout {
  /** The card, in frame px. */
  card: Rect;
  /**
   * Where each state's component lays itself out, in frame px: its resting half
   * of the card, clear of the chips and of the divider.
   */
  halves: Record<"before" | "after", Rect>;
  /** The box full-bleed media fill, relative to the inside of the card's border: the whole card, shared by both. */
  media: Rect;
  /** Chip inset from the card's edges, in px. */
  chipInset: number;
  /** Chip height, in px. */
  chip: number;
  /** Handle diameter, in px. */
  handle: number;
}

/**
 * Where the card and its halves go: the card fills `area` (the content area by
 * default), in 9:16 no wider than a window. The after half runs from the start
 * edge to the split, the before half from the split to the end. Pure.
 */
export function beforeAfterLayout(theme: Theme, aspect: Aspect, direction: BeforeAfterDirection, split: number, area: Rect = contentArea(theme, aspect)): BeforeAfterLayout {
  const { spacing, hairline } = theme;
  const width = isTall(aspect) ? windowWidth(theme, aspect, area).width : area.width;
  const card = { ...area, x: area.x + (area.width - width) / 2, width };
  const label = theme.type.label[aspect];
  const chip = Math.ceil(label.size * label.lineHeight + 2 * spacing.xs + 2 * hairline);
  const chipInset = spacing.md;
  const pad = spacing.lg;
  // The chips' band: content starts below it (or, for the bottom half's chip, ends above it).
  const band = chipInset + chip + spacing.sm;
  const inner = { x: card.x + hairline, y: card.y + hairline, width: card.width - 2 * hairline, height: card.height - 2 * hairline };
  let halves: BeforeAfterLayout["halves"];
  if (direction === "horizontal") {
    const at = inner.x + inner.width * split;
    const y = inner.y + band;
    const height = inner.height - band - pad;
    halves = {
      after: { x: inner.x + pad, y, width: at - inner.x - 2 * pad, height },
      before: { x: at + pad, y, width: inner.x + inner.width - at - 2 * pad, height },
    };
  } else {
    const at = inner.y + inner.height * split;
    const x = inner.x + pad;
    const w = inner.width - 2 * pad;
    halves = {
      after: { x, y: inner.y + band, width: w, height: at - inner.y - band - pad },
      before: { x, y: at + pad, width: w, height: inner.y + inner.height - at - band - pad },
    };
  }
  return { card, halves, media: { x: 0, y: 0, width: inner.width, height: inner.height }, chipInset, chip, handle: Math.round(label.size * HANDLE_EM) };
}

/**
 * One state: media fill the whole card through a content slot, so the wipe
 * compares the same picture; any other component lays itself out in its half,
 * at its own size, drawn in frame coordinates under the card.
 */
function Layer({ half, spec, progress, theme, aspect, layout }: { half: "before" | "after"; spec: SlotContent; progress: number; theme: Theme; aspect: Aspect; layout: BeforeAfterLayout }) {
  if (FULL_BLEED_COMPONENTS.has(spec.component)) {
    return <Slot progress={progress} theme={theme} aspect={aspect} box={layout.media} content={spec} attribute="data-before-after-slot" />;
  }
  const Component = kit[spec.component]!;
  const { width, height } = frameSize(aspect);
  const { card } = layout;
  const area = layout.halves[half];
  return (
    <div data-before-after-slot="" style={{ position: "absolute", left: -card.x - theme.hairline, top: -card.y - theme.hairline, width, height }}>
      <VisibleRectContext.Provider value={area}>
        <CameraFree>
          <Component {...spec.props} progress={progress} theme={theme} aspect={aspect} area={area} />
        </CameraFree>
      </VisibleRectContext.Provider>
    </div>
  );
}

function Chip({ theme, aspect, half, label, opacity, place }: { theme: Theme; aspect: Aspect; half: "before" | "after"; label: string; opacity: number; place: Record<string, number> }) {
  const { colors, spacing, radius, hairline, fonts } = theme;
  return (
    <div
      data-before-after-chip={half}
      style={{
        position: "absolute",
        ...place,
        zIndex: 1,
        opacity: round(opacity, 4),
        padding: `${spacing.xs}px ${spacing.sm}px`,
        borderRadius: radius.pill,
        backgroundColor: withAlpha(colors.surface, 0.92),
        border: `${hairline}px solid ${colors.border}`,
        fontFamily: fonts.body,
        ...typeCss(theme.type.label[aspect]),
        color: half === "after" ? colors.text : colors.textMuted,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
}

export function BeforeAfter(props: BeforeAfterProps) {
  const errors = beforeAfterErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`BeforeAfter: ${errors.join("; ")}`);
  const { progress, theme, aspect, area, before, after, beforeLabel = "Before", afterLabel = "After", split = 0.5 } = props;
  const direction = props.direction ?? (isTall(aspect) ? "vertical" : "horizontal");
  const horizontal = direction === "horizontal";
  const layout = beforeAfterLayout(theme, aspect, direction, split, area);
  const { card, chipInset, handle } = layout;
  const timing = beforeAfterTiming(theme);
  const { colors, hairline, cardShadow, motion } = theme;
  const time = useSceneTime(progress);
  const ms = entering(time).ms;
  const { opacity, rise, scale } = windowMotion(theme, time);
  const position = beforeAfterSplit(theme, ms, split);
  const shadow = `0 ${cardShadow.y}px ${cardShadow.blur}px ${withAlpha(colors.shadow, cardShadow.opacity)}`;
  const fill = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", backgroundColor: colors.surface } as const;
  // The before chip sits in its half's far corner; the after chip at the start corner.
  const beforePlace: Record<string, number> = horizontal ? { top: chipInset, right: chipInset } : { bottom: chipInset, left: chipInset };
  const afterPlace = { top: chipInset, left: chipInset };
  const along = round(position * (horizontal ? card.width : card.height), 2);

  return (
    <div
      data-before-after={direction}
      data-block="before-after card"
      style={{
        position: "absolute",
        left: card.x,
        top: card.y,
        width: card.width,
        height: card.height,
        opacity,
        transform: `translateY(${rise}px) scale(${scale})`,
      }}
    >
      <div
        data-before-after-card=""
        style={{
          position: "absolute",
          inset: 0,
          boxSizing: "border-box",
          backgroundColor: colors.surface,
          border: `${hairline}px solid ${colors.border}`,
          borderRadius: theme.radius.md,
          boxShadow: shadow,
          overflow: "hidden",
        }}
      >
        <div data-before-after-layer="before" style={fill}>
          <Layer half="before" spec={before} progress={progress} theme={theme} aspect={aspect} layout={layout} />
          {beforeLabel !== "" && <Chip theme={theme} aspect={aspect} half="before" label={beforeLabel} opacity={fade(motion.fx, ms - motion.leadMs - motion.fx.ms)} place={beforePlace} />}
        </div>
        <div data-before-after-layer="after" style={{ ...fill, clipPath: beforeAfterClip(direction, position) }}>
          <Layer half="after" spec={after} progress={progress} theme={theme} aspect={aspect} layout={layout} />
          {afterLabel !== "" && <Chip theme={theme} aspect={aspect} half="after" label={afterLabel} opacity={fade(motion.fx, ms - timing.afterChipMs)} place={afterPlace} />}
        </div>
      </div>
      <div
        data-before-after-divider=""
        aria-hidden="true"
        style={{
          position: "absolute",
          ...(horizontal
            ? { left: along - LINE_PX / 2, top: 0, width: LINE_PX, height: card.height }
            : { left: 0, top: along - LINE_PX / 2, width: card.width, height: LINE_PX }),
          opacity: round(fade(motion.fx, ms - timing.wipeMs), 4),
          backgroundColor: colors.accent,
        }}
      >
        <div
          data-before-after-handle=""
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: handle,
            height: handle,
            boxSizing: "border-box",
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            border: `${LINE_PX}px solid ${colors.accent}`,
            backgroundColor: colors.surface,
            boxShadow: shadow,
          }}
        />
      </div>
    </div>
  );
}
