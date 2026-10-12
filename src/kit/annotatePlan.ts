// Annotate as numbers (HyperFrames vox-annotate): the props it accepts, where
// the sentence breaks and where the marked phrase sits in it (from the
// text-layout estimates, never the DOM), where the note and its connector go,
// when each part moves, and the hand-drawn strokes. Pure; `Annotate.tsx`
// draws it.

import { random, type Seed } from "../engine/random";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import type { Aspect, Rect } from "../layout/frame";
import { AVG_CHAR_EM, charsPerLine } from "../layout/textFit";
import { glyphPad } from "../layout/type";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";

/** `underline`: a stroke under the words; `circle`: a loop around them; `highlight`: a marker band behind them. */
export const ANNOTATE_MARK_STYLES = ["underline", "circle", "highlight"] as const;
export type AnnotateMarkStyle = (typeof ANNOTATE_MARK_STYLES)[number];
export const ANNOTATE_NOTE_POSITIONS = ["above", "below"] as const;
export type AnnotateNotePosition = (typeof ANNOTATE_NOTE_POSITIONS)[number];

/** The note is a small callout: at most this many characters. */
export const ANNOTATE_NOTE_MAX = 40;

export interface AnnotateData {
  /** The sentence, one or two lines. A newline breaks it by hand. */
  text: string;
  /** The phrase to mark: must occur in `text` exactly. */
  mark: string;
  /** The callout the connector draws to, at most 40 characters. */
  note: string;
  markStyle?: AnnotateMarkStyle;
  notePosition?: AnnotateNotePosition;
  /** Varies the hand-drawn strokes; the same seed draws the same way every time. Default 0. */
  seed?: Seed;
}

const oneOf = (options: readonly string[]) => options.map((o) => `"${o}"`).join(", ");

/** What is wrong with Annotate's props; empty when they are fine. */
export function annotateErrors(props: Record<string, unknown>): string[] {
  const { text, mark, note, markStyle, notePosition } = props;
  const errors: string[] = [];
  if (typeof text !== "string" || text.trim() === "") errors.push("text must be a non-empty string");
  if (typeof mark !== "string" || mark.trim() === "") errors.push("mark must be a non-empty string");
  else if (typeof text === "string" && !text.includes(mark)) errors.push(`mark ${JSON.stringify(mark)} must occur in text exactly`);
  else if (mark.includes("\n")) errors.push("mark must not span a line break");
  if (typeof note !== "string" || note.trim() === "") errors.push("note must be a non-empty string");
  else if ([...note.trim()].length > ANNOTATE_NOTE_MAX) errors.push(`note must be at most ${ANNOTATE_NOTE_MAX} characters (got ${[...note.trim()].length})`);
  if (markStyle !== undefined && !ANNOTATE_MARK_STYLES.includes(markStyle as AnnotateMarkStyle)) errors.push(`markStyle must be one of ${oneOf(ANNOTATE_MARK_STYLES)} (got ${JSON.stringify(markStyle)})`);
  if (notePosition !== undefined && !ANNOTATE_NOTE_POSITIONS.includes(notePosition as AnnotateNotePosition)) {
    errors.push(`notePosition must be one of ${oneOf(ANNOTATE_NOTE_POSITIONS)} (got ${JSON.stringify(notePosition)})`);
  }
  return errors;
}

/** Steps the sentence may be set in, largest first: the headline role, smaller only to fit two lines. */
const SENTENCE_ROLES: TypeRole[] = ["headline", "title", "subtitle"];
const MAX_LINES = 2;

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places + 0;

/** Collapses runs of spaces and trims each line. */
const tidy = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n");

interface Unit {
  text: string;
  /** Offset of the mark inside this unit, when it holds the mark. */
  markAt?: number;
}

/** The text's words, line by line, with the words the mark touches joined into one unit that never breaks. */
function units(text: string, mark: string): Unit[][] {
  const at = text.indexOf(mark);
  const end = at + mark.length;
  let offset = 0;
  return text.split("\n").map((line) => {
    const out: Unit[] = [];
    for (const m of line.matchAll(/\S+/g)) {
      const start = offset + m.index;
      const stop = start + m[0].length;
      const prev = out.at(-1);
      if (start < end && stop > at) {
        // Spaces are single after `tidy`, so the mark's next word follows one space on.
        if (prev?.markAt !== undefined) prev.text += ` ${m[0]}`;
        else out.push({ text: m[0], markAt: at - start });
        continue;
      }
      out.push({ text: m[0] });
    }
    offset += line.length + 1;
    return out;
  });
}

/** Greedy word wrap of units into lines of at most `max` characters. */
function wrap(lines: Unit[][], max: number): Unit[][] {
  const out: Unit[][] = [];
  for (const line of lines) {
    let current: Unit[] = [];
    let used = 0;
    for (const unit of line) {
      const needed = used === 0 ? unit.text.length : used + 1 + unit.text.length;
      if (needed > max && used > 0) {
        out.push(current);
        current = [];
        used = 0;
      }
      current.push(unit);
      used = used === 0 ? unit.text.length : used + 1 + unit.text.length;
    }
    if (current.length > 0) out.push(current);
  }
  return out;
}

const length = (line: Unit[]) => line.reduce((n, u, i) => n + u.text.length + (i > 0 ? 1 : 0), 0);
const holdsMark = (line: Unit[]) => line.some((u) => u.markAt !== undefined);

/**
 * The sentence's lines at `max` characters a line. A sentence that needs two
 * lines breaks, where it can, with the mark on the line next to the note, so
 * the connector never crosses the other line (the most even such break);
 * otherwise, and when the text breaks itself, greedily.
 */
function breakLines(hard: Unit[][], max: number, position: AnnotateNotePosition): Unit[][] {
  const only = hard[0]!;
  if (hard.length > 1 || length(only) <= max) return wrap(hard, max);
  let best: Unit[][] | undefined;
  for (let k = 1; k < only.length; k++) {
    const pair = [only.slice(0, k), only.slice(k)];
    if (pair.some((line) => length(line) > max) || !holdsMark(pair[position === "below" ? 1 : 0]!)) continue;
    const spread = (lines: Unit[][]) => Math.abs(length(lines[0]!) - length(lines[1]!));
    if (best === undefined || spread(pair) < spread(best)) best = pair;
  }
  return best ?? wrap(hard, max);
}

/** Plain greedy word wrap of `text` into lines of at most `max` characters. */
export function wrapText(text: string, max: number): string[] {
  return wrap([text.split(/\s+/).filter(Boolean).map((word) => ({ text: word }))], max).map((line) => line.map((u) => u.text).join(" "));
}

export interface AnnotateLayout {
  /** The whole block: sentence, connector room and note. */
  box: Rect;
  /** The sentence's step, and the note's (the mono step). */
  spec: TypeSpec;
  noteSpec: TypeSpec;
  /** The sentence's lines, as the estimate breaks them; the browser never wraps them again. */
  lines: string[];
  /** The line the mark is on, and the mark's first character on it. */
  markLine: number;
  markColumn: number;
  /** The box the sentence's lines are centered in (with its glyph padding). */
  textBox: Rect;
  /** Height of one line of the sentence. */
  lineHeight: number;
  /** The estimated box of the mark's characters: their run on their line, a line tall. */
  chars: Rect;
  /** The box the drawn mark fills around `chars`. */
  mark: Rect;
  /** The note's box and lines. */
  note: Rect;
  noteLines: string[];
  /**
   * The connector, from the mark to the note. When another line sits between
   * them, it leaves from the mark's outer end and goes round that line by `via`.
   */
  connector: { from: Point2; via: Point2[]; to: Point2 };
}

export interface Point2 {
  x: number;
  y: number;
}

/** How each mark sits on its line, in shares of the line's height and em of the font size. */
const UNDERLINE_SHARE = 0.5;
const UNDERLINE_DROP_EM = 0.44;
const HIGHLIGHT_TOP_SHARE = 0.18;
const HIGHLIGHT_BOTTOM_SHARE = 0.96;
const CIRCLE_PAD_X_EM = 0.3;
const CIRCLE_PAD_Y_EM = 0.14;
/** Every mark reaches this far past the ends of its words. */
const OVERHANG_EM = 0.08;
/** How far a stroke wanders off its line, in em. */
const WOBBLE_EM = 0.035;

/** The drawn mark's box around the characters' box `chars` on a line `line` px tall. */
function markBox(theme: Theme, style: AnnotateMarkStyle, chars: Rect, spec: TypeSpec, line: number): Rect {
  const em = spec.size;
  const over = OVERHANG_EM * em;
  const x = chars.x - over;
  const width = chars.width + 2 * over;
  if (style === "underline") {
    const thick = theme.motion.mark.underlinePx + 2 * WOBBLE_EM * em;
    const center = chars.y + line * UNDERLINE_SHARE + UNDERLINE_DROP_EM * em;
    return { x, y: round(center - thick / 2), width, height: round(thick) };
  }
  if (style === "highlight") {
    const top = chars.y + line * HIGHLIGHT_TOP_SHARE;
    return { x, y: round(top), width, height: round(line * (HIGHLIGHT_BOTTOM_SHARE - HIGHLIGHT_TOP_SHARE)) };
  }
  const padX = CIRCLE_PAD_X_EM * em;
  const padY = CIRCLE_PAD_Y_EM * em;
  return { x: round(chars.x - padX), y: round(chars.y - padY), width: round(chars.width + 2 * padX), height: round(line + 2 * padY) };
}

/**
 * Where everything goes: the sentence in the largest of headline, title and
 * subtitle at which it breaks into at most two lines and the block fits
 * (preferring a step where the mark can sit on the line next to the note),
 * centered on the frame's optical center (or in its slot); the note above or
 * below it, the connector's length away, shifted off the mark toward the
 * middle so the connector leans.
 */
export function annotateLayout(theme: Theme, aspect: Aspect, props: AnnotateData, slot?: Rect): AnnotateLayout {
  const area = slot ?? contentArea(theme, aspect);
  const width = Math.min(area.width, textColumn(theme, aspect).width);
  const { spacing } = theme;
  const text = tidy(props.text);
  const mark = tidy(props.mark).trim();
  const style = props.markStyle ?? "underline";
  const position = props.notePosition ?? "below";
  const noteSpec = theme.type.mono[aspect];
  const noteMax = charsPerLine(width, noteSpec.size);
  const noteLines = wrapText(props.note.trim(), noteMax);
  const noteHeight = noteLines.length * noteSpec.size * noteSpec.lineHeight + 2 * glyphPad(noteSpec);
  /** Room between the sentence and the note, for the connector. */
  const gap = spacing.xxl;

  const plan = (role: TypeRole) => {
    const spec = theme.type[role][aspect];
    const lines = breakLines(units(text, mark), charsPerLine(width, spec.size), position);
    const line = spec.size * spec.lineHeight;
    const textHeight = lines.length * line + 2 * glyphPad(spec);
    const beside = holdsMark(lines[position === "below" ? lines.length - 1 : 0]!);
    return { spec, lines, line, textHeight, beside, height: textHeight + gap + noteHeight };
  };
  const plans = SENTENCE_ROLES.map(plan);
  const fits = plans.filter((p) => p.lines.length <= MAX_LINES && p.height <= area.height);
  const chosen = fits.find((p) => p.beside) ?? fits[0] ?? plans.at(-1)!;
  const { spec, line, textHeight } = chosen;
  const box = placeBlock(area, { width, height: chosen.height }, blockCenterY(theme, aspect, slot));
  const textBox = { x: box.x, y: position === "below" ? box.y : box.y + noteHeight + gap, width, height: textHeight };

  const lines = chosen.lines.map((units) => units.map((u) => u.text).join(" "));
  const markLine = Math.max(
    0,
    chosen.lines.findIndex((units) => units.some((u) => u.markAt !== undefined)),
  );
  const markUnits = chosen.lines[markLine]!;
  let markColumn = 0;
  for (const unit of markUnits) {
    if (unit.markAt !== undefined) {
      markColumn += unit.markAt;
      break;
    }
    markColumn += unit.text.length + 1;
  }
  const cw = spec.size * AVG_CHAR_EM;
  const lineLeft = textBox.x + (width - lines[markLine]!.length * cw) / 2;
  const lineTop = textBox.y + glyphPad(spec) + markLine * line;
  const chars = { x: round(lineLeft + markColumn * cw), y: round(lineTop), width: round(mark.length * cw), height: round(line) };
  const drawn = markBox(theme, style, chars, spec, line);

  // The note: as wide as its longest line, inside the block.
  const noteWidth = Math.min(width, Math.ceil(Math.max(...noteLines.map((l) => l.length)) * noteSpec.size * AVG_CHAR_EM));
  const noteY = position === "below" ? textBox.y + textHeight + gap : box.y;
  const below = position === "below";
  const markCenter = chars.x + chars.width / 2;
  const middle = box.x + width / 2;
  /** The side the mark leans to; a centered mark counts as right. */
  const side = markCenter < middle - spacing.sm ? -1 : 1;
  /** Places the note centered near `x`, inside the block, and finds where the connector meets it. */
  const placeNote = (x: number) => {
    const noteX = Math.min(Math.max(x - noteWidth / 2, box.x), box.x + width - noteWidth);
    const end = { x: round(Math.min(Math.max(x, noteX + noteWidth * 0.2), noteX + noteWidth * 0.8)), y: round(below ? noteY - spacing.xxs : noteY + noteHeight + spacing.xxs) };
    return { note: { x: round(noteX), y: round(noteY), width: noteWidth, height: round(noteHeight) }, end };
  };

  if (chosen.beside) {
    // Next to the note: straight from the mark's middle, leaning toward the block's middle.
    const { note, end } = placeNote(markCenter + (markCenter > middle + spacing.sm ? -1 : 1) * spacing.xxl);
    const from = { x: round(markCenter), y: round(below ? drawn.y + drawn.height + spacing.xxs : drawn.y - spacing.xxs) };
    return { box, spec, noteSpec, lines, markLine, markColumn, textBox, lineHeight: line, chars, mark: drawn, note, noteLines, connector: { from, via: [], to: end } };
  }

  // Another line between the mark and the note: leave from the mark's outer end and go round that line's end.
  const between = lines.map((_, i) => i).filter((i) => (below ? i > markLine : i < markLine));
  const ends = between.map((i) => {
    const left = textBox.x + (width - lines[i]!.length * cw) / 2;
    return side > 0 ? left + lines[i]!.length * cw : left;
  });
  // A loop's stroke runs inside its box by up to its wander; start at the stroke, not the box.
  const inset = style === "circle" ? (drawn.width / 2) * (WOBBLE_RANGE / (1 + WOBBLE_RANGE)) : 0;
  const from = { x: round(side > 0 ? drawn.x + drawn.width - inset + spacing.xxs : drawn.x + inset - spacing.xxs), y: round(drawn.y + drawn.height / 2) };
  const outX = side > 0 ? Math.max(from.x, ...ends) + spacing.sm : Math.min(from.x, ...ends) - spacing.sm;
  const rowTop = textBox.y + glyphPad(spec) + Math.min(...between) * line;
  const rowBottom = textBox.y + glyphPad(spec) + (Math.max(...between) + 1) * line;
  const via = below
    ? [
        { x: round(outX), y: round(rowTop) },
        { x: round(outX), y: round(rowBottom) },
      ]
    : [
        { x: round(outX), y: round(rowBottom) },
        { x: round(outX), y: round(rowTop) },
      ];
  const { note, end } = placeNote(outX);
  return { box, spec, noteSpec, lines, markLine, markColumn, textBox, lineHeight: line, chars, mark: drawn, note, noteLines, connector: { from, via, to: end } };
}

export interface AnnotateTiming {
  /** The sentence starts to arrive (on `enter`). */
  sentence: number;
  /** The mark starts to draw, and how long it takes. */
  mark: number;
  markMs: number;
  /** The marked words pop as the ink lands. */
  pop: number;
  /** The connector starts to draw, and how long it takes. */
  connector: number;
  connectorMs: number;
  /** The note starts to fade up (on `fx`). */
  note: number;
}

/** The mark draws at this ms, once the sentence has arrived and held a moment. */
const MARK_AT_MS = 700;
/** The connector draws in this long (vox-annotate's 450 ms, quickened). */
const CONNECTOR_MS = 300;
/** vox-annotate's beat: the connector starts 60% into the draw, the pop at 70%, the note 65% into the connector. */
const CONNECTOR_AFTER_SHARE = 0.6;
const POP_AFTER_SHARE = 0.7;
const NOTE_AFTER_SHARE = 0.65;

/** When each part of the gesture moves, in scene ms. */
export function annotateTiming(theme: Theme): AnnotateTiming {
  const markMs = theme.motion.mark.ms;
  const connector = MARK_AT_MS + markMs * CONNECTOR_AFTER_SHARE;
  return {
    sentence: theme.motion.leadMs,
    mark: MARK_AT_MS,
    markMs,
    pop: MARK_AT_MS + markMs * POP_AFTER_SHARE,
    connector,
    connectorMs: CONNECTOR_MS,
    note: connector + CONNECTOR_MS * NOTE_AFTER_SHARE,
  };
}

export interface AnnotateStroke {
  /** Path data, a dense polyline. */
  d: string;
  /** Its exact length, for the dash that draws it. */
  length: number;
  /** AnnotateStroke width in px. */
  width: number;
}

type Point = [number, number];

function polyline(points: Point[], width: number): AnnotateStroke {
  const pts = points.map(([x, y]) => [round(x), round(y)] as Point);
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  return { d, length: round(length), width };
}

/** A slow, seeded wander in -1..1 along a stroke (`t` 0..1): two sines at random phases. */
function wander(seed: Seed, key: string, t: number): number {
  const p1 = random(`${seed}:${key}:1`);
  const p2 = random(`${seed}:${key}:2`);
  return 0.6 * Math.sin(2 * Math.PI * (1.3 * t + p1)) + 0.4 * Math.sin(2 * Math.PI * (2.7 * t + p2));
}

const SEGMENTS = 32;
const steps = (n = SEGMENTS) => Array.from({ length: n + 1 }, (_, i) => i / n);
/** The circle goes round a little more than once, like a pen loop. */
const CIRCLE_TURNS = 1.08;
/** How far round the circle starts: its upper left. */
const CIRCLE_FROM_TURN = -0.375;
/** The circle's radius wanders this share either way. */
const WOBBLE_RANGE = 0.07;

/**
 * The hand-drawn mark, in a box `width` x `height` px (its `mark` box): an
 * underline wandering along its middle, a loop just inside the box, or a
 * marker band filling it. Never a perfectly straight line or round loop.
 */
export function markStroke(theme: Theme, style: AnnotateMarkStyle, width: number, height: number, spec: TypeSpec, seed: Seed): AnnotateStroke {
  const wobble = WOBBLE_EM * spec.size;
  const tilt = (random(`${seed}:tilt`) * 2 - 1) * 0.3;
  if (style === "underline") {
    const thick = theme.motion.mark.underlinePx;
    return polyline(
      steps().map((t) => [t * width, height / 2 + wobble * (0.7 * wander(seed, "u", t) + tilt * (2 * t - 1))]),
      thick,
    );
  }
  if (style === "highlight") {
    const thick = height - 2 * wobble;
    return polyline(
      steps(16).map((t) => [t * width, height / 2 + wobble * (0.7 * wander(seed, "h", t) + tilt * (2 * t - 1))]),
      round(thick),
    );
  }
  const thick = Math.max(3, theme.motion.mark.underlinePx * 0.6);
  const rx = (width - thick) / 2 / (1 + WOBBLE_RANGE);
  const ry = (height - thick) / 2 / (1 + WOBBLE_RANGE);
  return polyline(
    steps(64).map((t) => {
      const angle = 2 * Math.PI * (CIRCLE_FROM_TURN + CIRCLE_TURNS * t);
      const r = 1 + WOBBLE_RANGE * (0.6 * wander(seed, "c", t) + 0.4 * (2 * t - 1));
      return [width / 2 + rx * r * Math.cos(angle), height / 2 + ry * r * Math.sin(angle)];
    }),
    round(thick),
  );
}
/**
 * The connector through `points` (the first is its start): with two points,
 * it leaves the mark straight, bends toward the note and arrives straight,
 * with a seeded bow; with more, a smooth curve through each (round a line's
 * end). Always with a slight tremor.
 */
export function connectorStroke(theme: Theme, points: readonly Point2[], seed: Seed): AnnotateStroke {
  const width = Math.max(3, theme.motion.mark.underlinePx / 2);
  const tremor = (t: number) => Math.sin(Math.PI * t) * wander(seed, "k", t) * theme.hairline;
  if (points.length === 2) {
    const [a, b] = points as [Point2, Point2];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const bow = (random(`${seed}:bow`) * 2 - 1) * 0.15 * Math.abs(dy);
    const c1: Point = [a.x + dx * 0.1 + bow, a.y + dy * 0.55];
    const c2: Point = [a.x + dx * 0.75, a.y + dy * 0.85];
    const at = (t: number): Point => {
      const u = 1 - t;
      const x = u * u * u * a.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b.x;
      const y = u * u * u * a.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b.y;
      return [x + tremor(t), y];
    };
    return polyline(steps(24).map(at), width);
  }
  // Catmull-Rom through the points: each segment a Hermite curve, tangents from the neighbours.
  const n = points.length;
  const p = (i: number) => points[Math.min(n - 1, Math.max(0, i))]!;
  const out: Point[] = [];
  const per = 12;
  for (let i = 0; i < n - 1; i++) {
    const [p0, p1] = [p(i), p(i + 1)];
    const m0 = { x: (p1.x - p(i - 1).x) / 2, y: (p1.y - p(i - 1).y) / 2 };
    const m1 = { x: (p(i + 2).x - p0.x) / 2, y: (p(i + 2).y - p0.y) / 2 };
    for (let k = i === 0 ? 0 : 1; k <= per; k++) {
      const t = k / per;
      const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
      const h10 = t ** 3 - 2 * t ** 2 + t;
      const h01 = -2 * t ** 3 + 3 * t ** 2;
      const h11 = t ** 3 - t ** 2;
      const along = (i + t) / (n - 1);
      out.push([h00 * p0.x + h10 * m0.x + h01 * p1.x + h11 * m1.x + tremor(along), h00 * p0.y + h10 * m0.y + h01 * p1.y + h11 * m1.y]);
    }
  }
  return polyline(out, width);
}
