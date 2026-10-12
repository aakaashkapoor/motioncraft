// One held sentence with a word that keeps changing (ported from HyperFrames
// `kinetic-type-swap`): the prefix and suffix stay still while a masked slot
// rolls its word up and out as the next comes up from below, a little blurred
// while it moves, until the last option lands with one small pulse. The slot
// is as wide as the widest option from the first frame, so the line never
// reflows. "Ship faster / smarter / together".

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { TEXT_PIECES_ATTRIBUTE, TYPE_FIT_ATTRIBUTE, typeCss } from "../layout/type";
import { easeInOutCubic } from "../engine/easing";
import { accentInk } from "../theme/roles";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { entering, useSceneTime } from "./frameContext";
import { arrive, exitOpacity, pulse } from "./motion";
import type { KitProps } from "./types";

export interface WordSwapProps extends KitProps {
  /** Still text before the slot. */
  prefix?: string;
  /** The words the slot rolls through, in order; it settles on the last. 2-6 non-empty words. */
  options: string[];
  /** Still text after the slot. */
  suffix?: string;
  /**
   * When each swap after the first option starts, in ms from the scene's
   * start: one per option after the first, ascending. Default: evenly spaced
   * so the last option lands by 60% of the scene, at least 450 ms apart.
   */
  cuesMs?: number[];
}

export const WORD_SWAP_MIN_OPTIONS = 2;
export const WORD_SWAP_MAX_OPTIONS = 6;

/** How long one swap rolls, in ms. */
export const WORD_SWAP_MS = 350;
/** On the default schedule, options change at most this often. */
const MIN_STEP_MS = 450;
/** On the default schedule, the last option has landed by this share of the scene. */
const DEADLINE_SHARE = 0.6;
/** The gap between the sentence's pieces, in em (the source's word gap). */
const GAP_EM = 0.26;
/** The line's height in em: the slot's mask, tall enough that no glyph is cut. */
const LINE_EM = 1.4;

/**
 * Glyph advances in em for the bold display face, a little generous: the slot
 * is sized from them, so a word's own width (not the 0.6 em average, which
 * leaves wide gaps around short words) decides the gap around the slot.
 */
const NARROW = { em: 0.3, chars: new Set("ijlI.,:;'!|") };
const SLIM = { em: 0.39, chars: new Set("frt()-/") };
const WIDE = { em: 0.84, chars: new Set("mwMW@%") };
const UPPER_EM = 0.66;
const SPACE_EM = 0.24;
const LETTER_EM = 0.56;

/** A word's estimated width in em at a tracking (in em). */
export function wordSwapEm(text: string, tracking: number): number {
  return [...text].reduce((sum, ch) => {
    const em = ch === " " ? SPACE_EM : NARROW.chars.has(ch) ? NARROW.em : SLIM.chars.has(ch) ? SLIM.em : WIDE.chars.has(ch) ? WIDE.em : ch !== ch.toLowerCase() ? UPPER_EM : LETTER_EM;
    return sum + em + tracking;
  }, 0);
}

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places || 0;
const isText = (v: unknown) => typeof v === "string" && v.trim() !== "" && !/[\r\n\t]/.test(v);

/** What is wrong with WordSwap props; empty when they are fine. */
export function wordSwapErrors(props: Record<string, unknown>): string[] {
  const { prefix, options, suffix, cuesMs } = props;
  const errors: string[] = [];
  if (prefix !== undefined && typeof prefix !== "string") errors.push("`prefix` must be a string");
  if (suffix !== undefined && typeof suffix !== "string") errors.push("`suffix` must be a string");
  const okOptions =
    Array.isArray(options) && options.length >= WORD_SWAP_MIN_OPTIONS && options.length <= WORD_SWAP_MAX_OPTIONS && options.every(isText);
  if (!okOptions) errors.push(`\`options\` must be ${WORD_SWAP_MIN_OPTIONS}-${WORD_SWAP_MAX_OPTIONS} non-empty one-line words`);
  if (cuesMs !== undefined) {
    const ok =
      Array.isArray(cuesMs) &&
      cuesMs.every((c) => typeof c === "number" && Number.isFinite(c) && c >= 0) &&
      cuesMs.every((c, i) => i === 0 || c > (cuesMs[i - 1] as number));
    if (!ok) errors.push("`cuesMs` must be ascending ms from the scene's start, each 0 or more");
    else if (okOptions && cuesMs.length !== (options as unknown[]).length - 1) {
      errors.push(`\`cuesMs\` needs one cue per option after the first (${(options as unknown[]).length - 1}, got ${cuesMs.length})`);
    }
  }
  return errors;
}

/**
 * The default swap schedule for `count` options in a scene ending at `endMs`:
 * the options share the time from the line's lead to 60% of the scene evenly,
 * so the last lands by then; never closer than 450 ms, and the first swap
 * waits for the line to have arrived.
 */
export function wordSwapCues(theme: Theme, count: number, endMs: number): number[] {
  if (count < 2) return [];
  const { leadMs, enter } = theme.motion;
  const deadline = endMs * DEADLINE_SHARE - WORD_SWAP_MS;
  const even = (deadline - leadMs) / (count - 1);
  const first = leadMs + Math.max(enter.ms, even, MIN_STEP_MS);
  const step = count > 2 ? Math.max(MIN_STEP_MS, (deadline - first) / (count - 2)) : 0;
  return Array.from({ length: count - 1 }, (_, i) => first + i * step);
}

/** A word in the slot: `offset` slot heights below its rest (negative: above), blurred and scaled. */
export interface WordSwapWord {
  index: number;
  offset: number;
  /** Vertical blur in px; 0 at rest. */
  blur: number;
  scale: number;
}

/**
 * The words the slot draws `ms` into the scene: the current option at rest,
 * or, during a swap, the outgoing word rising out of the mask and the next
 * rising in from below (cubic in-out). The last option pulses once on `pop`
 * as it lands. A cue closer than a swap to the one before waits for it.
 */
export function wordSwapWords(theme: Theme, cues: readonly number[], ms: number): WordSwapWord[] {
  const starts: number[] = [];
  cues.forEach((c, i) => starts.push(i === 0 ? c : Math.max(c, starts[i - 1]! + WORD_SWAP_MS)));
  const index = starts.filter((s) => ms >= s).length;
  const last = cues.length;
  const { pop, count } = theme.motion;
  const landed = (k: number) => {
    const scale = k === last && last > 0 ? round(1 + (pop.scale - 1) * pulse(pop, ms - starts[last - 1]! - WORD_SWAP_MS), 4) : 1;
    return { index: k, offset: 0, blur: 0, scale };
  };
  if (index === 0) return [landed(0)];
  const t = (ms - starts[index - 1]!) / WORD_SWAP_MS;
  if (t >= 1) return [landed(index)];
  const e = easeInOutCubic(t);
  const blur = round(count.blurMaxPx * Math.sin(Math.PI * t));
  return [
    { index: index - 1, offset: -e, blur, scale: 1 },
    { index, offset: 1 - e, blur, scale: 1 },
  ];
}

export interface WordSwapLayout {
  /** The block the line is centered in, in frame px. */
  box: Rect;
  /** The headline step's size, smaller when the line would not fit on one line. */
  size: number;
  fitted: boolean;
  /** The estimated width of a word at `size`, in px. */
  wordWidth: (text: string) => number;
  /** The slot's width: the widest option's estimated width. */
  slotWidth: number;
  /** The whole line's estimated width. */
  lineWidth: number;
  lineHeight: number;
  gap: number;
}

/** The sentence on one line at the headline step, shrunk to fit the text column, centered. */
export function wordSwapLayout(theme: Theme, aspect: Aspect, prefix: string | undefined, options: readonly string[], suffix: string | undefined, slot?: Rect): WordSwapLayout {
  const area = slot ?? contentArea(theme, aspect);
  const column = Math.min(area.width, textColumn(theme, aspect).width);
  const spec = theme.type.headline[aspect];
  const em = (text: string) => wordSwapEm(text, spec.tracking);
  const pieces = [prefix, suffix].filter((p): p is string => p !== undefined && p !== "");
  const widest = Math.max(...options.map(em));
  // The line in em, and room for rounding each piece up to a whole px.
  const ems = pieces.reduce((sum, p) => sum + em(p), widest) + pieces.length * GAP_EM;
  const size = Math.min(spec.size, Math.floor(((column - (pieces.length + 2)) / ems) * 100) / 100);
  const wordWidth = (text: string) => Math.ceil(em(text) * size);
  const slotWidth = Math.max(...options.map(wordWidth));
  const gap = Math.ceil(size * GAP_EM);
  const lineWidth = pieces.reduce((sum, p) => sum + wordWidth(p) + gap, slotWidth);
  const lineHeight = Math.ceil(size * LINE_EM);
  const box = placeBlock(area, { width: column, height: lineHeight }, blockCenterY(theme, aspect, slot));
  return { box, size, fitted: size < spec.size, wordWidth, slotWidth, lineWidth, lineHeight, gap };
}

/** The slot masks words above and below it, but not at its sides, so a word a little wider than estimated is never cut. */
const CLIP = "inset(0 -50%)";

const blurId = (px: number) => `motioncraft-wordswap-blur-${Math.round(px * 100)}`;

export function WordSwap(props: WordSwapProps) {
  const errors = wordSwapErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`WordSwap: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, prefix, options, suffix, cuesMs } = props;
  const { colors, fonts, spacing, motion } = theme;
  const layout = wordSwapLayout(theme, aspect, prefix, options, suffix, slot);
  const time = useSceneTime(progress);
  const { move, opacity: fadeIn } = arrive(theme, entering(time).ms, motion.leadMs);
  const opacity = round(Math.min(fadeIn, exitOpacity(theme, time, motion.enter.ms)), 3);
  const rise = round((1 - move) * spacing.md);
  const cues = cuesMs ?? wordSwapCues(theme, options.length, time.endMs);
  const drawn = wordSwapWords(theme, cues, time.ms);
  const blurs = [...new Set(drawn.map((w) => w.blur).filter((b) => b > 0))];
  const ink = accentInk(theme);
  const line = `${layout.lineHeight}px`;
  const still = (name: "prefix" | "suffix", text: string | undefined) =>
    text !== undefined && text !== "" && <span {...{ [`data-wordswap-${name}`]: "" }} style={{ flex: "0 0 auto", lineHeight: line }}>{text}</span>;

  return (
    <div style={{ position: "absolute", left: layout.box.x, top: layout.box.y, width: layout.box.width, height: layout.box.height, opacity }}>
      {blurs.length > 0 && (
        <svg width={0} height={0} aria-hidden="true" style={{ position: "absolute" }}>
          {blurs.map((b) => (
            <filter key={b} id={blurId(b)} x="0" y="-50%" width="100%" height="200%" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={`0 ${b}`} />
            </filter>
          ))}
        </svg>
      )}
      <div
        data-block="WordSwap"
        {...(layout.fitted && { [TYPE_FIT_ATTRIBUTE]: "" })}
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          gap: layout.gap,
          height: layout.lineHeight,
          fontFamily: fonts.display,
          ...typeCss(theme.type.headline[aspect]),
          fontSize: layout.size,
          lineHeight: line,
          whiteSpace: "pre",
          color: colors.text,
          transform: `translateY(${rise}px)`,
        }}
      >
        {still("prefix", prefix)}
        <span
          data-wordswap-slot=""
          {...{ [TEXT_PIECES_ATTRIBUTE]: "" }}
          style={{ flex: "0 0 auto", position: "relative", display: "inline-block", width: layout.slotWidth, height: layout.lineHeight, clipPath: CLIP, color: ink }}
        >
          {drawn.map((w) => (
            <span
              key={w.index}
              data-wordswap-word={w.index}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                textAlign: "center",
                lineHeight: line,
                transform: `translateY(${round(w.offset * layout.lineHeight)}px)${w.scale !== 1 ? ` scale(${w.scale})` : ""}`,
                filter: w.blur > 0 ? `url(#${blurId(w.blur)})` : undefined,
              }}
            >
              {options[w.index]}
            </span>
          ))}
        </span>
        {still("suffix", suffix)}
      </div>
    </div>
  );
}
