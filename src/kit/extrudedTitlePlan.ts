// The pure parts of ExtrudedTitle (ported from HyperFrames `extruded-logo`):
// its prop rules, the letters (from the Geist Bold typeface's own metrics),
// each letter's flip and the word's swing at a scene-clock ms, the word's size
// and place per aspect, and the camera that films it. No WebGL here, so all of
// it runs in tests.
//
// The world: one scene unit is one em of the typeface. The word's baseline is
// y = 0, its letters centred on x = 0 and on z = 0 through their depth. The
// camera shows the settled front face at `layout.em` px per unit.

import * as THREE from "three";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import { frameSize, type Rect } from "../layout/frame";
import { textBoxHeight } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { geistBold } from "./three/fonts3d";

export const TEXT_MAX = 24;
export const FINISHES = ["matte", "glossy", "chrome"] as const;
export type ExtrudedFinish = (typeof FINISHES)[number];

/** What is wrong with ExtrudedTitle props; empty when they are fine. */
export function extrudedTitleErrors(props: Record<string, unknown>): string[] {
  const { text, finish, subtitle, accentLetters } = props;
  const errors: string[] = [];
  const ok = typeof text === "string" && text.trim().length > 0 && text.length <= TEXT_MAX && !/[\r\n]/.test(text);
  if (!ok) errors.push(`\`text\` must be one line of 1-${TEXT_MAX} characters (got ${typeof text === "string" ? text.length : typeof text})`);
  if (typeof text === "string" && ok) {
    const glyphs = geistBold().data.glyphs;
    const missing = [...new Set([...text].filter((ch) => ch !== " " && glyphs[ch] === undefined))];
    if (missing.length > 0) errors.push(`\`text\` has characters the 3D typeface lacks: ${missing.join(" ")} (basic Latin letters, digits and punctuation only)`);
  }
  if (finish !== undefined && !(FINISHES as readonly unknown[]).includes(finish)) errors.push(`\`finish\` must be one of ${FINISHES.join(", ")}`);
  if (subtitle !== undefined && (typeof subtitle !== "string" || subtitle.trim().length === 0 || subtitle.length > 60)) errors.push("`subtitle` must be a string of 1-60 characters");
  if (accentLetters !== undefined) {
    const length = typeof text === "string" ? text.length : 0;
    const good =
      Array.isArray(accentLetters) &&
      accentLetters.every((i) => Number.isInteger(i) && i >= 0 && i < length && (text as string)[i] !== " ") &&
      new Set(accentLetters).size === accentLetters.length;
    if (!good) errors.push(`\`accentLetters\` must be distinct indices of letters in \`text\` (0 to ${length - 1}, not spaces)`);
  }
  return errors;
}

// ---- The letters ----

/** Space between letters, em (on top of the typeface's own advance): the bevel needs a little room. */
const TRACKING = 0.04;

export interface TitleLetter {
  char: string;
  /** Its index in `text` (spaces count). */
  index: number;
  /** Its glyph box's centre on x, em, with the word centred on x = 0. */
  x: number;
  /** Its glyph box, em: width, and bottom and top from the baseline. */
  width: number;
  yMin: number;
  yMax: number;
}

const glyphBoxes = new Map<string, { xMin: number; xMax: number; yMin: number; yMax: number; advance: number }>();

/** A glyph's box and advance, em, read from the typeface's outline (control points included: a slight overestimate at most). */
function glyphBox(ch: string) {
  const known = glyphBoxes.get(ch);
  if (known !== undefined) return known;
  const { glyphs, resolution } = geistBold().data;
  const glyph = glyphs[ch] ?? glyphs["?"]!;
  const numbers = (glyph.o ?? "").split(" ").filter((t) => t !== "" && !/^[mlqb]$/.test(t)).map(Number);
  const ys = numbers.filter((_, i) => i % 2 === 1);
  const box = {
    xMin: glyph.x_min / resolution,
    xMax: glyph.x_max / resolution,
    yMin: ys.length === 0 ? 0 : Math.min(...ys) / resolution,
    yMax: ys.length === 0 ? 0 : Math.max(...ys) / resolution,
    advance: glyph.ha / resolution,
  };
  glyphBoxes.set(ch, box);
  return box;
}

/** The letters of `text` (spaces skipped, though they keep their room), laid out on one line centred on x = 0. */
export function titleLetters(text: string): TitleLetter[] {
  const letters: TitleLetter[] = [];
  let cursor = 0;
  [...text].forEach((char, index) => {
    const box = glyphBox(char);
    if (char !== " ") letters.push({ char, index, x: cursor + (box.xMin + box.xMax) / 2, width: box.xMax - box.xMin, yMin: box.yMin, yMax: box.yMax });
    cursor += box.advance + TRACKING;
  });
  if (letters.length === 0) return letters;
  const left = letters[0]!.x - letters[0]!.width / 2;
  const right = letters.at(-1)!.x + letters.at(-1)!.width / 2;
  const mid = (left + right) / 2;
  return letters.map((l) => ({ ...l, x: l.x - mid }));
}

/** The word's front face, em: width and its bottom and top from the baseline. */
export function wordExtent(letters: readonly TitleLetter[]): { width: number; yMin: number; yMax: number } {
  const first = letters[0]!;
  const last = letters.at(-1)!;
  return {
    width: last.x + last.width / 2 - (first.x - first.width / 2),
    yMin: Math.min(...letters.map((l) => l.yMin)),
    yMax: Math.max(...letters.map((l) => l.yMax)),
  };
}

/** The extrusion: total thickness about 0.35 of the cap height (Geist's caps are 0.71 em), a bevel on the front and back edges. */
export const CAP_HEIGHT = 0.71;
export const BEVEL_THICKNESS = 0.03;
export const BEVEL_SIZE = 0.018;
export const DEPTH = 0.35 * CAP_HEIGHT - 2 * BEVEL_THICKNESS;
/** The z of the letters' front face. */
export const FRONT_Z = DEPTH / 2 + BEVEL_THICKNESS;

// ---- The motion ----

/** The first letter flips up on the lead; the rest follow FLIP_STEP_MS apart, tighter when the last would start after FLIP_LAST_MS. */
export const FLIP_START_MS = 150;
const FLIP_STEP_MS = 70;
const FLIP_LAST_MS = 850;
/** Each letter's flip, ease-out with a little overshoot (the source's own back-out). */
const FLIP_MS = 600;
/** How far below the baseline a flat letter lies, em. */
const FLIP_DROP = 0.13;
/** The word starts turned (degrees, about y, and a slight lean back about x) and swings face-on, settling here. */
const SWING_DEG = 25;
const LEAN_DEG = 2.3;
const SWING_START_MS = 350;
export const SETTLE_MS = 1600;
/** The hold's drift about y: a slow sway up to twice this (degrees), from rest, over the period. */
const DRIFT_DEG = 0.7;
const DRIFT_PERIOD_MS = 7000;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const rad = (d: number) => (d * Math.PI) / 180;
/** The source's back-out: overshoots by about 10% and settles. */
const easeOutBack = (t: number) => {
  const u = clamp01(t) - 1;
  return 1 + 2.2 * u * u * u + 1.2 * u * u;
};
const easeInOutCubic = (t: number) => {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
};

/** The ms between letter starts for `count` letters. */
export const flipStep = (count: number) => (count <= 1 ? 0 : Math.min(FLIP_STEP_MS, (FLIP_LAST_MS - FLIP_START_MS) / (count - 1)));

export interface LetterPose {
  /** Turn about x, radians: -pi/2 lying flat on its back, 0 standing. */
  rotationX: number;
  /** Offset below the baseline, em (0 or less). */
  lift: number;
  /** How far up it is, 0 -> 1, unclamped overshoot removed. */
  done: number;
  /** False before its flip starts. */
  shown: boolean;
}

/** Letter `i` of `count` at `ms` on the scene clock. */
export function letterPose(ms: number, i: number, count: number): LetterPose {
  const start = FLIP_START_MS + i * flipStep(count);
  const t = (ms - start) / FLIP_MS;
  const u = t >= 1 ? 1 : easeOutBack(t);
  return { rotationX: u === 1 ? 0 : (1 - u) * -(Math.PI / 2), lift: t >= 1 ? 0 : (1 - clamp01(u)) * -FLIP_DROP, done: clamp01(t), shown: ms >= start };
}

export interface WordPose {
  /** Turn about y and x, radians, drift included. */
  rotationY: number;
  rotationX: number;
  /** The hold's drift alone, radians (0 until the word settles). */
  drift: number;
  /** How far the swing has come, 0 -> 1. */
  done: number;
}

/** The word at `ms` on the scene clock. */
export function wordPose(ms: number, drift = true): WordPose {
  const done = ms >= SETTLE_MS ? 1 : easeInOutCubic((ms - SWING_START_MS) / (SETTLE_MS - SWING_START_MS));
  const sway = !drift || ms <= SETTLE_MS ? 0 : rad(DRIFT_DEG) * (1 - Math.cos((2 * Math.PI * (ms - SETTLE_MS)) / DRIFT_PERIOD_MS));
  const left = 1 - done;
  return { rotationY: (left === 0 ? 0 : -rad(SWING_DEG) * left) + sway, rotationX: left === 0 ? 0 : rad(LEAN_DEG) * left, drift: sway, done };
}

/** The subtitle sets off as the word settles. */
export const SUBTITLE_START_MS = SETTLE_MS;

// ---- Size and place ----

/** Vertical field of view, degrees. */
export const FOV = 30;
/** In 16:9 the word takes this share of the content width; elsewhere this share of the text column (or the slot), leaving room for the swing and the letters' overshoot. */
const WIDE_SHARE = 0.7;
const COLUMN_SHARE = 0.92;
/** A short word's cap height stops at this many times the hero step. */
const MAX_CAP_HEROES = 1.35;
/** How far the contact shadow reaches past the word, em. */
export const SHADOW_DEPTH = 1;

export interface ExtrudedTitleLayout {
  /** The component's own box, frame px: its slot, or the whole frame. */
  root: Rect;
  /** The box the 3D stage draws in, frame px. */
  stage: Rect;
  /** The settled word's front face, frame px. */
  word: Rect;
  /** The subtitle's box, frame px (when there is one). */
  subtitle?: Rect;
  /** px per em. */
  em: number;
  letters: TitleLetter[];
  extent: { width: number; yMin: number; yMax: number };
}

const expand = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by });
function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, width: Math.min(a.x + a.width, b.x + b.width) - x, height: Math.min(a.y + a.height, b.y + b.height) - y };
}

/**
 * The word 92% as wide as the text column in 9:16 and 4:5 (the slot when
 * nested), 70% of the content width in 16:9; a long word steps its size
 * down, a short one stops at a cap height of MAX_CAP_HEROES hero steps, and
 * the word and subtitle together always fit the area's height. The block
 * sits on the block centre.
 */
export function extrudedTitleLayout(theme: Theme, aspect: Aspect, text: string, subtitle: string | undefined, slot?: Rect): ExtrudedTitleLayout {
  const area = slot ?? contentArea(theme, aspect);
  const column = slot ?? textColumn(theme, aspect);
  const letters = titleLetters(text);
  const extent = wordExtent(letters);
  const height = extent.yMax - extent.yMin;
  const subHeight = Math.ceil(textBoxHeight(subtitle, column.width, theme.type.subtitle[aspect]));
  const gap = subtitle === undefined ? 0 : theme.spacing.md;
  const widthPx = aspect === "16:9" && slot === undefined ? area.width * WIDE_SHARE : column.width * COLUMN_SHARE;
  // The shadow and the swing take some room below and around the word.
  const em = Math.min(widthPx / extent.width, (theme.type.hero[aspect].size * MAX_CAP_HEROES) / CAP_HEIGHT, (area.height - gap - subHeight) / (height + 0.25));
  const word = { width: extent.width * em, height: height * em };
  const block = placeBlock(area, { width: word.width, height: word.height + gap + subHeight }, blockCenterY(theme, aspect, slot));
  const wordBox = { x: block.x, y: block.y, ...word };
  const frame = { x: 0, y: 0, ...frameSize(aspect) };
  return {
    root: slot ?? frame,
    // A scene of its own draws on the whole frame; in a slot, the stage reaches a little past it for the swing and the shadow.
    stage: slot === undefined ? frame : intersect(expand(slot, theme.spacing.lg), frame),
    word: wordBox,
    subtitle: subtitle === undefined ? undefined : { x: column.x, y: block.y + word.height + gap, width: column.width, height: subHeight },
    em,
    letters,
    extent,
  };
}

/** How far the camera stands off the word's axis, as angles from the word's front: above and a little to the left. */
const VIEW_ABOVE_DEG = 8;
const VIEW_LEFT_DEG = 6;

/**
 * The camera that films the word: it shows the settled front face at `em`
 * px per unit, on `layout.word`. It stands above and left of the word,
 * looking straight ahead, its lens shifted (a view offset) so the word still
 * lands on its box: the face keeps its true shape and size while the tops
 * and left sides of the letters, the depth, stay in view.
 */
export function titleCamera(layout: ExtrudedTitleLayout): THREE.PerspectiveCamera {
  const { stage, word, em, extent } = layout;
  const camera = new THREE.PerspectiveCamera(FOV, stage.width / stage.height, 0.1, 1000);
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const distance = stage.height / em / (2 * tan);
  const midY = (extent.yMin + extent.yMax) / 2;
  const up = distance * Math.tan(THREE.MathUtils.degToRad(VIEW_ABOVE_DEG));
  const left = distance * Math.tan(THREE.MathUtils.degToRad(VIEW_LEFT_DEG));
  camera.position.set(-left, midY + up, FRONT_Z + distance);
  camera.lookAt(-left, midY + up, FRONT_Z);
  // The word's centre would show `left` right of and `up` below the view's centre; shift the view onto the box.
  const bx = word.x + word.width / 2 - (stage.x + stage.width / 2);
  const by = word.y + word.height / 2 - (stage.y + stage.height / 2);
  camera.setViewOffset(stage.width, stage.height, left * em - bx, up * em - by, stage.width, stage.height);
  camera.updateMatrixWorld(true);
  return camera;
}
