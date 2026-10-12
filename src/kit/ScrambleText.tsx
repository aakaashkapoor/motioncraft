// A string decoding itself (ported from HyperFrames `scramble-reveal`): the
// line arrives as wrong glyphs that change every two frames, then the target
// locks in left to right, the character that is locking lit in the accent.
// Every character sits in a fixed-width mono slot, so the line never jitters.
// `clean` is the bare line; `terminal` frames it with a prompt and a caret
// that blinks once the text has locked. An optional label fades in under it.

import { useContext } from "react";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import { isTall, type Rect } from "../layout/frame";
import { safeZones } from "../layout/safe";
import { estimateTextHeight } from "../layout/textFit";
import { TEXT_PIECES_ATTRIBUTE, TYPE_FIT_ATTRIBUTE, typeCss } from "../layout/type";
import { random } from "../engine/random";
import { readableColor } from "../theme/contrast";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole } from "../theme/types";
import { Caret } from "./Caret";
import { SceneClockContext, entering, useSceneTime } from "./frameContext";
import { largestFittingStep } from "./heroStep";
import { arrive, exitOpacity, fade, tween } from "./motion";
import { caretBlink } from "./typing";
import type { KitProps } from "./types";

export const SCRAMBLE_TEXT_STYLES = ["clean", "terminal"] as const;
export type ScrambleTextStyle = (typeof SCRAMBLE_TEXT_STYLES)[number];

export interface ScrambleTextProps extends KitProps {
  /** The string that decodes, 1-40 characters on one line. */
  text: string;
  /** `clean` (default): the bare line. `terminal`: in a thin frame with a `>` prompt and a caret. */
  style?: ScrambleTextStyle;
  /** A small mono line under the text that fades in once it has locked. */
  label?: string;
  /** Varies the wrong glyphs; the same seed scrambles the same way. Default: the text. */
  seed?: string;
}

export const SCRAMBLE_TEXT_MAX_CHARS = 40;
/** The wrong glyphs a character cycles through. */
export const SCRAMBLE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=/<>";

/** Every character scrambles this long after the lead before the first locks. */
const SCRAMBLE_MS = 300;
/** Characters lock this far apart, left to right. */
const LOCK_STEP_MS = 45;
/** Long text locks faster, so the last character locks within this of the first. */
const LOCK_SPREAD_MS = 1200;
/** Wrong glyphs change every this many frames. */
const GLYPH_FRAMES = 2;
/** A slot's width in em: a mono glyph's advance plus the source's open tracking. */
const SLOT_EM = 0.66;
/** The prompt `> ` takes two slots. */
const PROMPT_SLOTS = 2;
/** The caret's width and its gap, in em (see `Caret`). */
const CARET_EM = 0.68;
/** The line's height in em: tall enough that no glyph pokes out. */
const LINE_EM = 1.4;

const round = (n: number, places = 3) => Math.round(n * 10 ** places) / 10 ** places || 0;

/** What is wrong with ScrambleText props; empty when they are fine. */
export function scrambleTextErrors(props: Record<string, unknown>): string[] {
  const { text, style, label, seed } = props;
  const errors: string[] = [];
  if (typeof text !== "string" || [...text].length < 1 || [...text].length > SCRAMBLE_TEXT_MAX_CHARS || text.trim() === "") {
    errors.push(`\`text\` must be a string of 1-${SCRAMBLE_TEXT_MAX_CHARS} characters`);
  } else if (/[\r\n\t]/.test(text)) {
    errors.push("`text` must be one line");
  }
  if (style !== undefined && !SCRAMBLE_TEXT_STYLES.includes(style as ScrambleTextStyle)) {
    errors.push(`\`style\` must be one of ${SCRAMBLE_TEXT_STYLES.join(", ")} (got ${JSON.stringify(style)})`);
  }
  if (label !== undefined && typeof label !== "string") errors.push("`label` must be a string");
  if (seed !== undefined && typeof seed !== "string") errors.push("`seed` must be a string");
  return errors;
}

export interface ScrambleTextTiming {
  /** When each non-space character locks, left to right, in scene ms. */
  locks: number[];
  /** The last character has finished locking: the label fades in and the caret starts to blink. */
  lockedMs: number;
}

/** Characters lock left to right after `SCRAMBLE_MS` of scramble from the lead; spaces take no time. */
export function scrambleTextTiming(theme: Theme, text: string): ScrambleTextTiming {
  const count = [...text].filter((c) => c !== " ").length;
  const step = count > 1 ? Math.min(LOCK_STEP_MS, LOCK_SPREAD_MS / (count - 1)) : LOCK_STEP_MS;
  const first = theme.motion.leadMs + SCRAMBLE_MS;
  const locks = Array.from({ length: count }, (_, k) => first + k * step);
  return { locks, lockedMs: (locks.at(-1) ?? first) + step };
}

export type ScrambleSlotState = "scrambled" | "locking" | "locked";

export interface ScrambleSlot {
  char: string;
  state: ScrambleSlotState;
}

/**
 * The line `ms` into the scene (`frame` frames past the lead): locked
 * characters show the text, the latest of them `locking` until the next
 * locks; the rest show a wrong glyph picked from the seed, the slot and the
 * frame pair. Spaces stay spaces.
 */
export function scrambleTextLine(text: string, seed: string, timing: ScrambleTextTiming, ms: number, frame: number): ScrambleSlot[] {
  const tick = Math.floor(Math.max(0, frame) / GLYPH_FRAMES);
  let k = -1;
  return [...text].map((char, i) => {
    if (char === " ") return { char, state: "locked" };
    k++;
    const at = timing.locks[k]!;
    if (ms >= at) {
      const next = timing.locks[k + 1] ?? timing.lockedMs;
      return { char, state: ms < next ? "locking" : "locked" };
    }
    const pick = Math.floor(random(`${seed}|${i}|${tick}`) * SCRAMBLE_GLYPHS.length);
    const glyph = SCRAMBLE_GLYPHS[pick]!;
    return { char: glyph === char ? SCRAMBLE_GLYPHS[(pick + 1) % SCRAMBLE_GLYPHS.length]! : glyph, state: "scrambled" };
  });
}

/** The accent, nudged toward the text color until it reads as text on the ground and the terminal's surface. */
export function scrambleTextAccent(theme: Theme): string {
  const { colors } = theme;
  return readableColor(colors.accent, colors.text, [colors.ground, colors.surface]);
}

export interface ScrambleTextLayout {
  /** The block: the line (framed, in `terminal`) with the label under it, in frame px. */
  box: Rect;
  /** The ramp step the line is set in (its weight and tracking). */
  role: TypeRole;
  /** The line's font size: the step's, smaller when the text would not fit. */
  size: number;
  fitted: boolean;
  /** The line's width in px: every slot, plus the prompt and caret in `terminal`. */
  lineWidth: number;
  lineHeight: number;
  /** The terminal frame's padding (0 when clean). */
  padX: number;
  padY: number;
  gap: number;
  labelWidth: number;
}

/**
 * The line on one row, centered with its label. 16:9: the headline step in
 * the text column. 9:16 (fill the frame): the largest of hero, display and
 * headline that fits, the bare line in the text column and the terminal frame
 * across the primary width (its padding keeps the text off the right rail).
 * A line that fits no step shrinks from the headline step to fit.
 */
export function scrambleTextLayout(theme: Theme, aspect: Aspect, text: string, style: ScrambleTextStyle, label: string | undefined, slot?: Rect): ScrambleTextLayout {
  const { spacing, hairline } = theme;
  const area = slot ?? contentArea(theme, aspect);
  const tall = isTall(aspect);
  const terminal = style === "terminal";
  const textWidth = Math.min(area.width, textColumn(theme, aspect).width);
  const column = tall && terminal ? Math.min(area.width, safeZones(aspect, theme.safe).primaryWidth) : textWidth;
  const padX = terminal ? (tall ? spacing.md : spacing.lg) : 0;
  const padY = terminal ? spacing.md : 0;
  const chrome = terminal ? 2 * (padX + hairline) : 0;
  const ems = [...text].length * SLOT_EM + (terminal ? PROMPT_SLOTS * SLOT_EM + CARET_EM : 0);
  const room = column - chrome;
  // 9:16: the largest step it fits at; 16:9 (and a line that fits none) keeps the headline step.
  const role = (tall ? largestFittingStep(theme, aspect, room, () => ems) : undefined) ?? "headline";
  const step = theme.type[role][aspect].size;
  const size = Math.min(step, Math.floor((room / ems) * 100) / 100);
  const lineWidth = Math.ceil(ems * size * 100) / 100;
  const lineHeight = Math.ceil(size * LINE_EM);
  const mono = theme.type.mono[aspect];
  const gap = label === undefined ? 0 : spacing.md;
  const labelHeight = label === undefined ? 0 : estimateTextHeight(label, textWidth, mono);
  const height = lineHeight + 2 * (padY + (terminal ? hairline : 0)) + gap + labelHeight;
  const box = placeBlock(area, { width: Math.max(column, textWidth), height }, blockCenterY(theme, aspect, slot));
  return { box, role, size, fitted: size < step, lineWidth, lineHeight, padX, padY, gap, labelWidth: textWidth };
}

export function ScrambleText(props: ScrambleTextProps) {
  const errors = scrambleTextErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`ScrambleText: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, text, style = "clean", label, seed = text } = props;
  const { colors, fonts, spacing, motion, hairline, radius } = theme;
  const terminal = style === "terminal";
  const layout = scrambleTextLayout(theme, aspect, text, style, label, slot);
  const timing = scrambleTextTiming(theme, text);
  const fps = useContext(SceneClockContext)?.fps ?? 30;
  const time = useSceneTime(progress);
  const { ms } = entering(time);
  const { move, opacity: fadeIn } = arrive(theme, ms, motion.leadMs);
  const opacity = Math.min(fadeIn, exitOpacity(theme, time, motion.enter.ms));
  const rise = round((1 - move) * spacing.md, 2);
  const line = scrambleTextLine(text, seed, timing, ms, Math.floor(((ms - motion.leadMs) * fps) / 1000));
  const after = ms - timing.lockedMs;
  const spec = theme.type[layout.role][aspect];
  const accent = scrambleTextAccent(theme);
  const colorOf = { scrambled: colors.textMuted, locking: accent, locked: colors.text };

  const slots = (
    <span {...{ [TEXT_PIECES_ATTRIBUTE]: "" }}>
      {line.map(({ char, state }, i) => (
        <span key={i} data-scramble-slot={state} style={{ display: "inline-block", width: `${SLOT_EM}em`, textAlign: "center", color: colorOf[state] }}>
          {char}
        </span>
      ))}
    </span>
  );

  const lineEl = (
    <div
      data-scramble-line=""
      {...(layout.fitted && { [TYPE_FIT_ATTRIBUTE]: "" })}
      style={{
        width: layout.lineWidth,
        height: layout.lineHeight,
        fontFamily: fonts.mono,
        ...typeCss(spec),
        fontSize: layout.size,
        lineHeight: `${layout.lineHeight}px`,
        whiteSpace: "pre",
        color: colors.text,
      }}
    >
      {terminal && (
        <span data-scramble-prompt="" style={{ display: "inline-block", width: `${PROMPT_SLOTS * SLOT_EM}em`, color: accent }}>
          {">"}
        </span>
      )}
      {slots}
      {terminal && <Caret theme={theme} shape="block" opacity={after < 0 ? 0 : round(caretBlink(theme, after))} marker={{ "data-scramble-caret": "" }} />}
    </div>
  );

  return (
    <div style={{ position: "absolute", left: layout.box.x, top: layout.box.y, width: layout.box.width, height: layout.box.height, opacity }}>
      <div
        data-block="ScrambleText"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: layout.gap, transform: `translateY(${rise}px)` }}
      >
        {terminal ? (
          <div
            data-scramble-frame=""
            style={{
              padding: `${layout.padY}px ${layout.padX}px`,
              border: `${hairline}px solid ${colors.border}`,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
            }}
          >
            {lineEl}
          </div>
        ) : (
          lineEl
        )}
        {label !== undefined && (
          <p
            data-scramble-label=""
            style={{
              margin: 0,
              maxWidth: layout.labelWidth,
              fontFamily: fonts.mono,
              ...typeCss(theme.type.mono[aspect]),
              color: colors.textMuted,
              textAlign: "center",
              overflowWrap: "break-word",
              opacity: round(fade(motion.fx, after)),
              transform: `translateY(${round((1 - tween(motion.fx, after)) * spacing.sm, 2)}px)`,
            }}
          >
            {label}
          </p>
        )}
      </div>
    </div>
  );
}
