// One held sentence with a word that keeps changing (ported from HyperFrames
// `kinetic-type-swap`): the prefix and suffix hold while a masked slot
// rolls its word up and out as the next comes up from below, a little blurred
// while it moves, until the last option lands with one small pulse. The
// slot's width follows the word it shows, easing to the next word's width
// during each swap, so the line re-centres as the words roll and a short last
// word leaves no hole; between swaps nothing moves. The line is set in the
// largest of the hero, display and headline steps it fits at with its widest
// option. "Ship faster / smarter / together".

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { TEXT_PIECES_ATTRIBUTE, TYPE_FIT_ATTRIBUTE, typeCss } from "../layout/type";
import { easeInOutCubic } from "../engine/easing";
import { accentInk } from "../theme/roles";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole } from "../theme/types";
import { entering, useSceneTime } from "./frameContext";
import { largestFittingStep } from "./heroStep";
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

/**
 * Where the slot is `ms` into the scene: each swap's start (a cue closer than
 * a swap to the one before waits for it), the option swapping in (or shown,
 * 0 before the first swap) and how far its swap is, 0..1 (1 when it rests).
 */
function swapAt(cues: readonly number[], ms: number): { starts: number[]; index: number; t: number } {
  const starts: number[] = [];
  cues.forEach((c, i) => starts.push(i === 0 ? c : Math.max(c, starts[i - 1]! + WORD_SWAP_MS)));
  const index = starts.filter((s) => ms >= s).length;
  const t = index === 0 ? 1 : Math.min(1, (ms - starts[index - 1]!) / WORD_SWAP_MS);
  return { starts, index, t };
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
  const { starts, index, t } = swapAt(cues, ms);
  const last = cues.length;
  const { pop, count } = theme.motion;
  const landed = (k: number) => {
    const scale = k === last && last > 0 ? round(1 + (pop.scale - 1) * pulse(pop, ms - starts[last - 1]! - WORD_SWAP_MS), 4) : 1;
    return { index: k, offset: 0, blur: 0, scale };
  };
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
  /** The ramp step the line is set in (its weight and tracking). */
  role: TypeRole;
  /** The step's size, smaller when the line would not fit on one line at the headline step. */
  size: number;
  fitted: boolean;
  /** The estimated width of a word at `size`, in px. */
  wordWidth: (text: string) => number;
  /** The widest option's estimated width: the widest the slot gets. */
  slotWidth: number;
  /** The whole line's estimated width with the widest option: the widest the line gets. */
  lineWidth: number;
  lineHeight: number;
  gap: number;
}

/**
 * The sentence on one line, centered in the text column: in the largest of
 * the hero, display and headline steps at which it fits with its widest
 * option, or shrunk from the headline step when it fits none.
 */
export function wordSwapLayout(theme: Theme, aspect: Aspect, prefix: string | undefined, options: readonly string[], suffix: string | undefined, slot?: Rect): WordSwapLayout {
  const area = slot ?? contentArea(theme, aspect);
  const column = Math.min(area.width, textColumn(theme, aspect).width);
  const pieces = [prefix, suffix].filter((p): p is string => p !== undefined && p !== "");
  // Room for rounding each piece (and the slot) up to a whole px.
  const room = column - (pieces.length + 2);
  // The line in em at a step, with the widest option.
  const lineEms = (role: TypeRole) => {
    const em = (text: string) => wordSwapEm(text, theme.type[role][aspect].tracking);
    return pieces.reduce((sum, p) => sum + em(p), Math.max(...options.map(em))) + pieces.length * GAP_EM;
  };
  // The largest step it fits at; one that fits none shrinks from the headline step.
  const role = largestFittingStep(theme, aspect, room, lineEms) ?? "headline";
  const spec = theme.type[role][aspect];
  const size = Math.min(spec.size, Math.floor((room / lineEms(role)) * 100) / 100);
  const wordWidth = (text: string) => Math.ceil(wordSwapEm(text, spec.tracking) * size);
  const slotWidth = Math.max(...options.map(wordWidth));
  const gap = Math.ceil(size * GAP_EM);
  const lineWidth = pieces.reduce((sum, p) => sum + wordWidth(p) + gap, slotWidth);
  const lineHeight = Math.ceil(size * LINE_EM);
  const box = placeBlock(area, { width: column, height: lineHeight }, blockCenterY(theme, aspect, slot));
  return { box, role, size, fitted: size < spec.size, wordWidth, slotWidth, lineWidth, lineHeight, gap };
}

/**
 * How wide the slot is `ms` into the scene: the shown option's estimated
 * width, easing (with the words' roll) from one option's width to the next's
 * during a swap, so the line re-centres as the words change and only then.
 */
export function wordSwapSlotWidth(layout: WordSwapLayout, options: readonly string[], cues: readonly number[], ms: number): number {
  const { index, t } = swapAt(cues, ms);
  const to = layout.wordWidth(options[index]!);
  if (t >= 1) return to;
  const from = layout.wordWidth(options[index - 1]!);
  return round(from + (to - from) * easeInOutCubic(t));
}

/** The line with the slot `slotWidth` wide, centered in the box: each piece's left edge and the line's width, in frame px. */
export interface WordSwapLine {
  prefixX: number;
  slotX: number;
  /** Where the suffix starts; the slot's right edge plus the gap when there is no suffix. */
  suffixX: number;
  lineWidth: number;
}

/** Where the pieces sit with the slot `slotWidth` wide (estimated widths, centered as the flex row centers them). */
export function wordSwapLine(layout: WordSwapLayout, prefix: string | undefined, suffix: string | undefined, slotWidth: number): WordSwapLine {
  const before = prefix !== undefined && prefix !== "" ? layout.wordWidth(prefix) + layout.gap : 0;
  const after = suffix !== undefined && suffix !== "" ? layout.gap + layout.wordWidth(suffix) : 0;
  const lineWidth = before + slotWidth + after;
  const prefixX = layout.box.x + (layout.box.width - lineWidth) / 2;
  const slotX = prefixX + before;
  return { prefixX, slotX, suffixX: slotX + slotWidth + layout.gap, lineWidth };
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
  // The mask stays as wide as the widest option; negative margins either side
  // narrow the room it takes in the line to the shown word's width.
  const inset = round((layout.slotWidth - wordSwapSlotWidth(layout, options, cues, time.ms)) / 2);
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
          ...typeCss(theme.type[layout.role][aspect]),
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
          style={{
            flex: "0 0 auto",
            position: "relative",
            display: "inline-block",
            width: layout.slotWidth,
            height: layout.lineHeight,
            ...(inset !== 0 && { marginLeft: -inset, marginRight: -inset }),
            clipPath: CLIP,
            color: ink,
          }}
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
