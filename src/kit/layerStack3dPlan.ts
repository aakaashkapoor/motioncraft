// The pure parts of LayerStack3D (ported from HyperFrames `exploded-stack`):
// its prop rules, the isometric camera, the size and place of the stack and
// its labels per aspect, and where every plate and label is at a scene-clock
// time. No WebGL here, so all of it runs in tests and in server rendering
// (the labels are flat HTML placed from it).
//
// The world: square plates (the source's 4.2 x 0.22 x 4.2) stacked on the y
// axis, the top layer first, about the origin; an orthographic camera looks
// down on them from the source's isometric angle (from (10, 10.7, 10)), so a
// plate's right-hand corner is the rightmost point of its diamond and sits
// level with the plate's middle. That corner is where its label's leader
// starts. One world unit is `k` px on screen.

import * as THREE from "three";
import { isIconName } from "../icons";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import { frameSize, isTall, type Rect } from "../layout/frame";
import { AVG_CHAR_EM, estimateLines } from "../layout/textFit";
import { glyphPad } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { exitMs, fade, tween } from "./motion";

export interface StackLayer {
  /** The layer's name, 1-24 characters. */
  label: string;
  /** A line under the name, up to 40 characters. */
  note?: string;
  /** A bundled icon name, drawn on the plate's top face. */
  icon?: string;
}

export const LAYERS_MIN = 2;
export const LAYERS_MAX = 6;
export const LABEL_MAX = 24;
export const NOTE_MAX = 40;

/** What is wrong with LayerStack3D props; empty when they are fine. */
export function layerStack3DErrors(props: Record<string, unknown>): string[] {
  const { layers, highlight, collapse } = props;
  const errors: string[] = [];
  if (!Array.isArray(layers) || layers.length < LAYERS_MIN || layers.length > LAYERS_MAX) {
    errors.push(`\`layers\` must be a list of ${LAYERS_MIN}-${LAYERS_MAX} layers`);
    return errors;
  }
  layers.forEach((layer: unknown, i) => {
    const { label, note, icon } = (layer ?? {}) as Record<string, unknown>;
    if (typeof label !== "string" || label.trim().length === 0 || label.length > LABEL_MAX) errors.push(`layer ${i + 1}: \`label\` must be a string of 1-${LABEL_MAX} characters`);
    if (note !== undefined && (typeof note !== "string" || note.length > NOTE_MAX)) errors.push(`layer ${i + 1}: \`note\` must be a string of up to ${NOTE_MAX} characters`);
    if (icon !== undefined && (typeof icon !== "string" || !isIconName(icon))) errors.push(`layer ${i + 1}: \`icon\` must be a bundled icon name`);
  });
  if (highlight !== undefined && (typeof highlight !== "number" || !Number.isInteger(highlight) || highlight < 0 || highlight >= layers.length)) {
    errors.push(`\`highlight\` must be a layer index from 0 to ${layers.length - 1}`);
  }
  if (collapse !== undefined && typeof collapse !== "boolean") errors.push("`collapse` must be true or false");
  return errors;
}

// ---- The world and the camera ----

/** A plate: its side, thickness and corner radius (world units): the source's side, a thicker slab so the depth reads. */
export const PLATE = { size: 4.2, thick: 0.3, round: 0.1 } as const;
/** The gap left between plates resting on each other. */
const REST_GAP = 0.02;
/** The gap between plates when apart (the source's 1.55, a little more so each icon shows); more when the labels need it. */
const APART_GAP = 1.8;
/** The most the gap may grow to give the labels room before the type steps down. */
const APART_GAP_MAX = 3.6;
/** Where the camera looks from: the source's isometric angle, a little steeper than true isometric. */
export const CAMERA_FROM = new THREE.Vector3(10, 10.7, 10).normalize();
/** The camera's distance from what it looks at (orthographic: only clipping depends on it). */
const CAMERA_DISTANCE = 50;

/** The camera's right and up axes in world space. */
const basis = new THREE.Matrix4().lookAt(CAMERA_FROM, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
const RIGHT = new THREE.Vector3().setFromMatrixColumn(basis, 0);
const UP = new THREE.Vector3().setFromMatrixColumn(basis, 1);

interface View {
  x: number;
  y: number;
}
/** A world point in view units: right and up from the origin, as the camera sees it. */
const view = (x: number, y: number, z: number): View => ({ x: RIGHT.x * x + RIGHT.y * y + RIGHT.z * z, y: UP.x * x + UP.y * y + UP.z * z });

/** A plate centred at height `y`: its outline in view units. */
function plateView(y: number): { left: number; right: number; top: number; bottom: number } {
  const h = PLATE.size / 2;
  const t = PLATE.thick / 2;
  const points = [-h, h].flatMap((x) => [y - t, y + t].flatMap((py) => [-h, h].map((z) => view(x, py, z))));
  return {
    left: Math.min(...points.map((p) => p.x)),
    right: Math.max(...points.map((p) => p.x)),
    top: Math.max(...points.map((p) => p.y)),
    bottom: Math.min(...points.map((p) => p.y)),
  };
}
/** The plate's right-hand corner, where its leader starts, at height `y`. */
const anchorView = (y: number) => view(PLATE.size / 2, y, -PLATE.size / 2);

const ONE = plateView(0);
/** A plate's width and height on screen, view units. */
const PLATE_W = ONE.right - ONE.left;
const PLATE_H = ONE.top - ONE.bottom;

// ---- Timing (scene clock) ----

/** The plates start to separate here, top first, one gap after another. */
export const SEPARATE_START_MS = 350;
export const SEPARATE_STAGGER_MS = 90;
/** How long each gap takes to open. */
const OPEN_MS = 800;
/** A label starts this long after its plate's gap starts to open: as the plate arrives. */
const LABEL_DELAY_MS = 450;
/** How far a label slides in from the left, px (the source's 16). */
const LABEL_SLIDE_PX = 16;
/** The stack rises into place from this far below, world units. */
const RISE = 0.6;
/** With `collapse`, the plates rejoin over the last this-many ms before the exit, bottom first. */
export const COLLAPSE_MS = 700;
const COLLAPSE_STAGGER_MS = 50;
/** The entrance's length, for the exit's: the last plate is apart by about 1.5 s. */
export const ENTRY_MS = 1500;

/** Ease-out with a soft first frame, as in the source: separation reads from its first frame on. */
const easeOpen = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t)) ** 1.4) ** 3;
/** Cubic in-out (GSAP power2.inOut), the source's collapse. */
const easeInOut = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
};

// ---- Layout ----

/** Label type steps to try, largest first: the name's step and the note's. */
const STEPS: ReadonlyArray<readonly [TypeRole, TypeRole]> = [
  ["subtitle", "body"],
  ["body", "label"],
  ["label", "label"],
];
/** The label column may take at most this share of the group's width. */
const LABEL_SHARE = { wide: 0.4, tall: 0.6 };
/** The stack may take at most this share of the group's width. */
const STACK_SHARE = { wide: 0.42, tall: 0.62 };
/** The stack is drawn at least this share of the group's width, or the type steps down. */
const STACK_MIN_SHARE = { wide: 0.16, tall: 0.26 };
/** A regular-weight glyph's average width, em. */
const NOTE_CHAR_EM = 0.54;
/** How far a leader drops in tall aspects, as a share of a plate's height on screen. */
const LEADER_DROP = 0.18;
/** A larger type step is kept while its stack is at least this share of the largest stack that fits. */
const PREFER_LARGER_TYPE = 0.85;
/** The group may fill at most this share of its area's height. */
const FILL_HEIGHT = 0.96;

export interface StackLabelLayout {
  /** The note beside the name on one line, or under it. */
  inline: boolean;
  /** Its own height, px. */
  height: number;
}

export interface LayerStackLayout {
  aspect: Aspect;
  count: number;
  /** The component's own box: its slot, or the whole frame. */
  root: Rect;
  /** The box it lays out in: its slot, or the content area. */
  area: Rect;
  /** The box the 3D stage draws in: the whole frame, or its slot and a margin for the shadow. */
  stage: Rect;
  /** The settled stack and its labels together, frame px. */
  group: Rect;
  /** Screen px per world unit. */
  k: number;
  /** Where the world origin (the stack's centre) is on the frame, px. */
  origin: View;
  /** The gap between plates when apart, world units. */
  gap: number;
  plate: typeof PLATE;
  /** The leader from a plate's corner to its label: right `dx` and down `dy`, px. */
  leader: { dx: number; dy: number };
  /** Between a leader's end and its label, px. */
  labelGap: number;
  /** The label column's width, px. */
  labelWidth: number;
  type: { title: TypeSpec; note: TypeSpec };
  labels: StackLabelLayout[];
}

/** Average glyph width in em: `AVG_CHAR_EM` is for bold text; a note is set regular, a little narrower. */
const charEm = (spec: TypeSpec) => (spec.weight >= 600 ? AVG_CHAR_EM : NOTE_CHAR_EM) + Math.max(0, spec.tracking);
/** Estimated width of `text` set in `spec` on one line, px. */
const lineWidth = (text: string, spec: TypeSpec) => Math.ceil(text.length * spec.size * charEm(spec));
const linesOf = (text: string, width: number, spec: TypeSpec) => estimateLines(text, width, spec.size, charEm(spec));
/** The widest line of `text` wrapped (greedily, by the estimate) to `width`, px. */
function wrappedWidth(text: string, width: number, spec: TypeSpec): number {
  let widest = 0;
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line === "" ? word : `${line} ${word}`;
    if (line !== "" && lineWidth(next, spec) > width) {
      widest = Math.max(widest, lineWidth(line, spec));
      line = word;
    } else line = next;
  }
  return Math.min(width, Math.max(widest, lineWidth(line, spec)));
}
const textHeight = (text: string, width: number, spec: TypeSpec) => linesOf(text, width, spec) * spec.size * spec.lineHeight + 2 * glyphPad(spec);

/** Plate heights (world y of each plate's centre, top first) with each gap opened by `gaps` (0..1) of `gap`, about the stack's centre. */
function plateHeights(count: number, gaps: readonly number[], gap: number): number[] {
  const ys = [0];
  for (let i = 1; i < count; i++) ys.push(ys[i - 1]! - (PLATE.thick + REST_GAP + gap * (gaps[i - 1] ?? 0)));
  const mid = (ys[0]! + ys[count - 1]!) / 2;
  return ys.map((y) => y - mid);
}

/** Where a settled stack and its labels are, in px about the world origin (y down). */
function settledBoxes(count: number, k: number, gap: number, leader: { dx: number; dy: number }, labelGap: number, labelWidth: number, labels: readonly StackLabelLayout[]): { plates: Rect[]; labels: Rect[] } {
  const ys = plateHeights(count, Array<number>(count - 1).fill(1), gap);
  const plates = ys.map((y) => {
    const v = plateView(y);
    return { x: k * v.left, y: -k * v.top, width: k * (v.right - v.left), height: k * (v.top - v.bottom) };
  });
  const boxes = ys.map((y, i) => {
    const a = anchorView(y);
    const height = labels[i]!.height;
    return { x: k * a.x + leader.dx + labelGap, y: -k * a.y + leader.dy - height / 2, width: labelWidth, height };
  });
  return { plates, labels: boxes };
}

function unionOf(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, width: Math.max(...rects.map((r) => r.x + r.width)) - x, height: Math.max(...rects.map((r) => r.y + r.height)) - y };
}

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, width: Math.min(a.x + a.width, b.x + b.width) - x, height: Math.min(a.y + a.height, b.y + b.height) - y };
}

/**
 * The stack's size and place, and its labels': the stack at the left of the
 * group, a label right of each plate (level with its corner in 16:9, below-
 * right of it in 9:16 and 4:5, where the leader drops), the group centred in
 * its area. Tall aspects keep the labels inside the text column, clear of the
 * 9:16 button rail. The plates spread wider than the source's when the labels
 * need the room; the type steps down when they cannot.
 */
export function layerStackLayout(theme: Theme, aspect: Aspect, layers: readonly StackLayer[], slot?: Rect): LayerStackLayout {
  const area = slot ?? contentArea(theme, aspect);
  const tall = isTall(aspect);
  const column = textColumn(theme, aspect);
  // Horizontally, the group keeps to the text column (the labels are text).
  const x0 = Math.max(area.x, column.x);
  const x1 = Math.min(area.x + area.width, column.x + column.width);
  const bounds = { x: x0, y: area.y, width: x1 - x0, height: area.height };
  const count = layers.length;
  const { spacing } = theme;
  // In tall aspects the leader drops, a share of the plate's height on screen, so the label sits below-right of the corner.
  const leaderFor = (k: number) => ({ dx: spacing.xl, dy: tall ? Math.round(Math.min(spacing.lg, k * PLATE_H * LEADER_DROP)) : 0 });
  const labelGap = spacing.xs;
  const share = tall ? "tall" : "wide";

  const limit = { width: bounds.width, height: bounds.height * FILL_HEIGHT };
  const kMin = (STACK_MIN_SHARE[share] * bounds.width) / PLATE_W;
  // The widest the label column may be: its share, and the room the smallest stack leaves.
  const widest = Math.floor(Math.min(bounds.width * LABEL_SHARE[share], bounds.width - spacing.xl - labelGap - STACK_MIN_SHARE[share] * bounds.width));

  /** The largest stack that fits with labels of `labelWidth` and these heights: its `k`, gap and the group's height. */
  const fit = (labelWidth: number, labels: StackLabelLayout[]) => {
    // Labels one pitch apart need their height and a gap between them.
    const pitchNeeded = Math.max(...labels.map((l) => l.height)) + spacing.xs;
    let k = Math.min((bounds.width - spacing.xl - labelGap - labelWidth) / PLATE_W, (STACK_SHARE[share] * bounds.width) / PLATE_W);
    let gap = APART_GAP;
    let height = Number.POSITIVE_INFINITY;
    for (let tries = 0; tries < 100 && k >= kMin; tries++) {
      const pitch = Math.max(k * (PLATE.thick + REST_GAP + APART_GAP) * UP.y, pitchNeeded);
      gap = pitch / (k * UP.y) - PLATE.thick - REST_GAP;
      const boxes = settledBoxes(count, k, gap, leaderFor(k), labelGap, labelWidth, labels);
      height = unionOf([...boxes.plates, ...boxes.labels]).height;
      if (height <= limit.height) break;
      k *= 0.98;
    }
    return { k, gap, height, fits: height <= limit.height && k >= kMin && gap <= APART_GAP_MAX };
  };

  const candidates = STEPS.flatMap((step, rank) => {
    const title: TypeSpec = { ...theme.type[step[0]][aspect], weight: theme.weights.semibold };
    const note: TypeSpec = { ...theme.type[step[1]][aspect], weight: theme.weights.regular };
    const stacked = (labelWidth: number): StackLabelLayout[] =>
      layers.map((l) => ({
        inline: false,
        height: Math.ceil(textHeight(l.label, labelWidth, title) + (l.note === undefined ? 0 : spacing.xxs + textHeight(l.note, labelWidth, note))),
      }));
    // The name on its own line, the note under it, wrapped to the column: as wide as the longest line, or narrower so the stack can grow.
    const natural = Math.min(widest, Math.max(...layers.map((l) => Math.max(lineWidth(l.label, title), l.note === undefined ? 0 : lineWidth(l.note, note)))));
    const narrowest = Math.max(...layers.map((l) => Math.max(lineWidth(l.label, title), ...(l.note ?? "").split(/\s+/).map((w) => lineWidth(w, note)))));
    const widths = [...new Set(Array.from({ length: 6 }, (_, i) => Math.floor(natural - ((natural - Math.min(natural, narrowest)) * i) / 5)))];
    // Each column as wide as its widest wrapped line, so the group's box (and its centring) follows the text.
    const options = widths.map((width) => ({
      labelWidth: Math.max(...layers.map((l) => Math.max(wrappedWidth(l.label, width, title), l.note === undefined ? 0 : wrappedWidth(l.note, width, note)))),
      labels: stacked(width),
    }));
    // Or the note beside the name on one line, where the labels have the width and not the height.
    const inlineWidth = Math.max(...layers.map((l) => lineWidth(l.label, title) + (l.note === undefined ? 0 : spacing.xs + lineWidth(l.note, note))));
    if (layers.some((l) => l.note !== undefined) && inlineWidth <= widest) {
      const height = Math.ceil(Math.max(title.size * title.lineHeight + 2 * glyphPad(title), note.size * note.lineHeight + 2 * glyphPad(note)));
      options.push({ labelWidth: inlineWidth, labels: layers.map(() => ({ inline: true, height })) });
    }
    return options.map((o) => ({ ...o, rank, title, note, ...fit(o.labelWidth, o.labels) }));
  });
  // The largest type step whose best stack is nearly the largest of any. Nothing fits: the largest stack whose group fits the height, else the shortest group.
  const fitting = candidates.filter((c) => c.fits);
  const bestK = Math.max(...fitting.map((c) => c.k));
  const p =
    fitting.length > 0
      ? fitting.filter((c) => c.k >= bestK * PREFER_LARGER_TYPE).sort((a, b) => a.rank - b.rank || b.k - a.k)[0]!
      : [...candidates].sort((a, b) => Number(b.height <= limit.height) - Number(a.height <= limit.height) || (a.height <= limit.height ? b.k - a.k : a.height - b.height))[0]!;

  const leader = leaderFor(p.k);
  const boxes = settledBoxes(count, p.k, p.gap, leader, labelGap, p.labelWidth, p.labels);
  const u = unionOf([...boxes.plates, ...boxes.labels]);
  const group = placeBlock(bounds, { width: u.width, height: u.height }, blockCenterY(theme, aspect, slot));
  const origin = { x: group.x - u.x, y: group.y - u.y };
  const frame = { x: 0, y: 0, ...frameSize(aspect) };
  const margin = spacing.xl;
  const stage =
    slot === undefined
      ? frame
      : (() => {
          const r = intersect({ x: slot.x - margin, y: slot.y - margin, width: slot.width + 2 * margin, height: slot.height + 2 * margin }, frame);
          const x = Math.round(r.x);
          const y = Math.round(r.y);
          return { x, y, width: Math.round(r.x + r.width) - x, height: Math.round(r.y + r.height) - y };
        })();
  return {
    aspect,
    count,
    root: slot ?? frame,
    area,
    stage,
    group,
    k: p.k,
    origin,
    gap: p.gap,
    plate: PLATE,
    leader,
    labelGap,
    labelWidth: p.labelWidth,
    type: { title: p.title, note: p.note },
    labels: p.labels,
  };
}

/** The orthographic camera that films the stack as `layout` places it: one world unit is `layout.k` px on its stage. */
export function stackCamera(layout: LayerStackLayout): THREE.OrthographicCamera {
  const { stage, k, origin } = layout;
  const w = stage.width / (2 * k);
  const h = stage.height / (2 * k);
  const camera = new THREE.OrthographicCamera(-w, w, h, -h, 1, CAMERA_DISTANCE * 2);
  // The world point at the stage's centre.
  const aim = RIGHT.clone()
    .multiplyScalar((stage.x + stage.width / 2 - origin.x) / k)
    .addScaledVector(UP, -(stage.y + stage.height / 2 - origin.y) / k);
  camera.position.copy(aim).addScaledVector(CAMERA_FROM, CAMERA_DISTANCE);
  camera.up.set(0, 1, 0);
  camera.lookAt(aim);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

// ---- A frame ----

export interface StackFrameLabel {
  /** Where the label's text box is, frame px. */
  box: Rect;
  /** The plate's corner, where the leader starts, and where the leader has reached, frame px. */
  anchor: View;
  end: View;
  opacity: number;
}

export interface StackFrame {
  /** How far each gap is open (top gap first), 0 -> 1. */
  gaps: number[];
  /** Each plate's height (world y of its centre) and its box on the frame. */
  plates: Array<{ y: number; box: Rect }>;
  labels: StackFrameLabel[];
}

/** The scene clock as the stack reads it: ms into the scene, and ms left until its end. */
export interface StackTime {
  ms: number;
  leftMs: number;
}

/**
 * Where everything is at `time`: the stack rising in on the lead, its gaps
 * opening top first, each label sliding in as its plate arrives; with
 * `collapse`, the gaps closing bottom first (and the labels fading) in the
 * last 700 ms before the exit.
 */
export function layerStackFrame(theme: Theme, layout: LayerStackLayout, time: StackTime, collapse: boolean): StackFrame {
  const { count, k, origin, gap, leader, labelGap, labelWidth } = layout;
  const { ms, leftMs } = time;
  const rise = -RISE * (1 - tween(theme.motion.enter, ms - theme.motion.leadMs));
  // With `collapse`: how far into the collapse, which ends as the exit starts.
  const closing = collapse ? exitMs(theme, ENTRY_MS) + COLLAPSE_MS - leftMs : Number.NEGATIVE_INFINITY;
  const closeFor = COLLAPSE_MS - (count - 2) * COLLAPSE_STAGGER_MS;
  const gaps = Array.from({ length: count - 1 }, (_, j) => {
    const open = easeOpen((ms - SEPARATE_START_MS - j * SEPARATE_STAGGER_MS) / OPEN_MS);
    // The bottom gap closes first.
    const close = easeInOut((closing - (count - 2 - j) * COLLAPSE_STAGGER_MS) / closeFor);
    return open * (1 - close);
  });
  const fadeOut = 1 - fade(theme.motion.fx, closing);
  const toFrame = (v: View): View => ({ x: origin.x + k * v.x, y: origin.y - k * v.y });
  const ys = plateHeights(count, gaps, gap).map((y) => y + rise);
  const plates = ys.map((y) => {
    const v = plateView(y);
    const topLeft = toFrame({ x: v.left, y: v.top });
    return { y, box: { x: topLeft.x, y: topLeft.y, width: k * (v.right - v.left), height: k * (v.top - v.bottom) } };
  });
  const labels = ys.map((y, i) => {
    const anchor = toFrame(anchorView(y));
    const since = ms - SEPARATE_START_MS - i * SEPARATE_STAGGER_MS - LABEL_DELAY_MS;
    const shown = fade(theme.motion.fx, since) * fadeOut;
    const slide = (1 - tween(theme.motion.fx, since)) * LABEL_SLIDE_PX;
    const height = layout.labels[i]!.height;
    // Whole px, as in the source: a fractional offset rasterises text differently frame to frame.
    const box = { x: Math.round(anchor.x + leader.dx + labelGap + slide), y: Math.round(anchor.y + leader.dy - height / 2), width: labelWidth, height };
    const end = { x: anchor.x + leader.dx * shown, y: anchor.y + leader.dy * shown };
    return { box, anchor, end, opacity: shown };
  });
  return { gaps, plates, labels };
}
