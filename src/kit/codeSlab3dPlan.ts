// The pure parts of CodeSlab3D (ported from HyperFrames `code-3d-extrude`):
// its prop rules, the slab's pose at a scene-clock ms, the highlight bands'
// sweep, the slab's size and place per aspect, the camera that films it, and
// the painting of its face (a filename tab and the highlighted code) onto a
// 2D canvas context. No WebGL here, so all of it runs in tests.
//
// The world: the slab's centre rests at the origin, its face toward the
// camera (+z). One scene unit is PX_PER_UNIT screen px at the resting face,
// so the camera shows the settled face at exactly its painted size.

import * as THREE from "three";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea } from "../layout/caption";
import { frameSize, type Rect } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { highlightCode, type CodeToken } from "./highlight";
import { fade } from "./motion";
import { highlightBand, syntaxColors } from "./syntaxColors";
import { fitMonoSize, MONO_ADVANCE, windowMetrics, windowWidth } from "./windowLayout";

export const CODE_LINES_MAX = 14;
export const TITLE_MAX = 40;
const TAB = "  ";

/** `code` as the lines the slab shows: tabs as two spaces, a final newline dropped. */
export function codeLines(code: string): string[] {
  return code.replace(/\t/g, TAB).replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
}

/** What is wrong with CodeSlab3D props; empty when they are fine. */
export function codeSlab3DErrors(props: Record<string, unknown>): string[] {
  const { code, language, highlightLines, title } = props;
  const errors: string[] = [];
  const count = typeof code === "string" ? codeLines(code).length : 0;
  if (typeof code !== "string" || code.trim().length === 0 || count > CODE_LINES_MAX) errors.push(`\`code\` must be 1-${CODE_LINES_MAX} lines of text (got ${count})`);
  if (language !== undefined && (typeof language !== "string" || language.length === 0)) errors.push("`language` must be a language name, e.g. \"ts\"");
  if (highlightLines !== undefined) {
    const ok = Array.isArray(highlightLines) && highlightLines.every((n) => Number.isInteger(n) && n >= 1 && n <= Math.max(1, count)) && new Set(highlightLines).size === highlightLines.length;
    if (!ok) errors.push(`\`highlightLines\` must be distinct line numbers from 1 to ${count}`);
  }
  if (title !== undefined && (typeof title !== "string" || title.trim().length === 0 || title.length > TITLE_MAX)) errors.push(`\`title\` must be a string of 1-${TITLE_MAX} characters`);
  return errors;
}

// ---- The motion ----

/** The slab sets off on the lead and settles face-on here. */
export const SLAB_START_MS = 150;
export const SLAB_SETTLE_MS = 1600;
/** Where the slab starts: tilted on x and y (degrees), and below and behind its rest, in slab heights. */
const TILT_X_DEG = 35;
const TILT_Y_DEG = -20;
const DROP_HEIGHTS = 0.9;
const BACK_HEIGHTS = 2.2;
/** The hold's parallax drift: its size on y and x (degrees) and its period. */
export const DRIFT_DEG = 1.2;
const DRIFT_PERIOD_MS = 7000;
/** The highlight bands sweep in from the settle, each this long, at most this far apart. */
export const BAND_START_MS = SLAB_SETTLE_MS;
const BAND_SWEEP = { ms: 400, curve: "expoOut" as const };
const BAND_STEP_MS = 90;
/** The last band starts no later than this after the first. */
const BAND_SPREAD_MS = 300;

/** Ease-out (GSAP power3.out, the source's slab entrance). */
const easeOutQuart = (t: number) => 1 - (1 - t) ** 4;
const rad = (deg: number) => (deg * Math.PI) / 180;

export interface SlabPose {
  /** How far the entrance has come, 0 -> 1 (eased). */
  done: number;
  /** The slab's turn about x and y, radians, drift included. */
  rotation: { x: number; y: number };
  /** The hold's drift alone, radians (0 until the slab settles). */
  drift: { x: number; y: number };
  /** The slab's offset from rest, in slab heights (y up, z toward the camera). */
  offset: { y: number; z: number };
}

/** The slab's pose at `ms` on the scene clock. */
export function slabPose(ms: number): SlabPose {
  const t = Math.min(1, Math.max(0, (ms - SLAB_START_MS) / (SLAB_SETTLE_MS - SLAB_START_MS)));
  const done = easeOutQuart(t);
  const left = 1 - done;
  const phase = ms <= SLAB_SETTLE_MS ? 0 : (2 * Math.PI * (ms - SLAB_SETTLE_MS)) / DRIFT_PERIOD_MS;
  const drift = { x: rad(DRIFT_DEG * 0.5) * Math.sin(phase * 0.5), y: rad(DRIFT_DEG) * Math.sin(phase) };
  return {
    done,
    rotation: { x: rad(TILT_X_DEG) * left + drift.x, y: rad(TILT_Y_DEG) * left + drift.y },
    drift,
    offset: { y: -DROP_HEIGHTS * left, z: -BACK_HEIGHTS * left },
  };
}

/** How far each highlighted line's band has swept in at `ms`, 0 -> 1, in the order given. */
export function bandSweeps(ms: number, count: number): number[] {
  const step = count <= 1 ? 0 : Math.min(BAND_STEP_MS, BAND_SPREAD_MS / (count - 1));
  return Array.from({ length: count }, (_, i) => fade(BAND_SWEEP, ms - BAND_START_MS - i * step));
}

// ---- Size and place ----

/** Screen px per scene unit at the resting face. */
export const PX_PER_UNIT = 100;
/** Vertical field of view, degrees. */
export const FOV = 30;
/** A short snippet's slab is still at least this share of the window width. */
const MIN_WIDTH_SHARE = 0.6;
/** How far past the slab its shadow reaches, in multiples of the theme's shadow blur. */
export const SHADOW_REACH = 1.5;

export interface CodeSlabLayout {
  /** The component's own box, frame px: its slot, or the whole frame. */
  root: Rect;
  /** The box the 3D stage draws in, frame px. */
  stage: Rect;
  /** Where the settled slab is (its face and bevel), frame px. */
  box: Rect;
  /** The face (the painted front), px. */
  face: { width: number; height: number };
  /** The mono size and row height of the code, px. */
  size: number;
  rowHeight: number;
  /** Padding around the code, and the title bar's height (0 without a title), px. */
  pad: number;
  bar: number;
  /** The slab's thickness, its bevel and its corner radius, px. */
  depth: number;
  bevel: number;
  corner: number;
}

const expand = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by });
function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, width: Math.min(a.x + a.width, b.x + b.width) - x, height: Math.min(a.y + a.height, b.y + b.height) - y };
}

/**
 * The slab for `lines` of code: the code at the ramp's mono step (smaller
 * only when it would not fit), the slab as wide as the code needs, from 60%
 * of the window width up to the full window width, on the block centre.
 */
export function codeSlabLayout(theme: Theme, aspect: Aspect, lines: readonly string[], titled: boolean, slot?: Rect): CodeSlabLayout {
  const area = slot ?? contentArea(theme, aspect);
  const { width: maxWidth } = windowWidth(theme, aspect, area);
  const { padding: pad, barHeight } = windowMetrics(theme, aspect);
  const bar = titled ? barHeight : 0;
  const bevel = Math.max(6, Math.round(theme.spacing.xs * 0.75));
  const columns = Math.max(1, ...lines.map((l) => l.length));
  const { lineHeight } = theme.type.mono[aspect];
  const rowsHeight = (s: number) => lines.length * Math.round(s * lineHeight);
  const size = fitMonoSize(theme, aspect, (s) => columns * s * MONO_ADVANCE <= maxWidth - 2 * pad - 2 * bevel && rowsHeight(s) + bar + 2 * pad + 2 * bevel <= area.height);
  const rowHeight = Math.round(size * lineHeight);
  const faceWidth = Math.min(maxWidth - 2 * bevel, Math.max(Math.round(maxWidth * MIN_WIDTH_SHARE), Math.ceil(columns * size * MONO_ADVANCE + 2 * pad)));
  const faceHeight = bar + 2 * pad + lines.length * rowHeight;
  const placed = placeBlock(area, { width: faceWidth + 2 * bevel, height: faceHeight + 2 * bevel }, blockCenterY(theme, aspect, slot));
  const box = { x: Math.round(placed.x), y: Math.round(placed.y), width: faceWidth + 2 * bevel, height: faceHeight + 2 * bevel };
  const frame = { x: 0, y: 0, ...frameSize(aspect) };
  return {
    root: slot ?? frame,
    // A scene of its own draws on the whole frame; in a slot, the stage reaches past it by the shadow's spread.
    stage: slot === undefined ? frame : intersect(expand(slot, theme.cardShadow.blur * SHADOW_REACH), frame),
    box,
    face: { width: faceWidth, height: faceHeight },
    size,
    rowHeight,
    pad,
    bar,
    depth: Math.round(Math.max(40, faceWidth * 0.07)),
    bevel,
    corner: theme.radius.md,
  };
}

/** The z of the slab's front face (scene units), with the slab centred on z = 0. */
export const frontZ = (layout: CodeSlabLayout) => (layout.depth / 2 + layout.bevel) / PX_PER_UNIT;

/** How far the camera stands off the slab's axis, as angles from the slab's centre: above and to the left. */
const VIEW_ABOVE_DEG = 16;
const VIEW_LEFT_DEG = 11;

/**
 * The camera that films the slab: it shows the settled face at its painted
 * size, on `box`. It stands above and to the left of the slab, looking
 * straight ahead with its lens shifted (a view offset) so the slab still
 * lands on its box: a face parallel to the lens keeps its true shape and
 * size, while the slab's top and left side, the depth, stay in view.
 */
export function slabCamera(layout: CodeSlabLayout): THREE.PerspectiveCamera {
  const { stage, box } = layout;
  const camera = new THREE.PerspectiveCamera(FOV, stage.width / stage.height, 0.1, 500);
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const distance = stage.height / PX_PER_UNIT / (2 * tan);
  const front = frontZ(layout);
  const up = distance * Math.tan(THREE.MathUtils.degToRad(VIEW_ABOVE_DEG));
  const left = distance * Math.tan(THREE.MathUtils.degToRad(VIEW_LEFT_DEG));
  camera.position.set(-left, up, front + distance);
  camera.lookAt(-left, up, front);
  // The slab's centre would show `left` right of and `up` below the view's centre; shift the view onto the box.
  const bx = box.x + box.width / 2 - (stage.x + stage.width / 2);
  const by = box.y + box.height / 2 - (stage.y + stage.height / 2);
  camera.setViewOffset(stage.width, stage.height, left * PX_PER_UNIT - bx, up * PX_PER_UNIT - by, stage.width, stage.height);
  camera.updateMatrixWorld(true);
  return camera;
}

// ---- The face ----

/** The parts of a 2D canvas context the face is painted with. */
export type SlabFaceContext = Pick<
  CanvasRenderingContext2D,
  "font" | "fillStyle" | "strokeStyle" | "lineWidth" | "textBaseline" | "textAlign" | "letterSpacing" | "clearRect" | "fillRect" | "beginPath" | "roundRect" | "fill" | "clip" | "fillText" | "measureText" | "save" | "restore"
>;

/** A line of text painted on the face: its box in face px, and the theme colour it reads as. */
export interface SlabLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: "text" | "textMuted";
}

export interface SlabFaceInput {
  theme: Theme;
  aspect: Aspect;
  layout: CodeSlabLayout;
  /** The code, highlighted (see `highlightCode`). */
  tokens: CodeToken[][];
  title?: string;
  /** Highlighted lines (1-based) and how far each band has swept in, 0 -> 1. */
  bands: ReadonlyArray<{ line: number; sweep: number }>;
}

/** The slab's code, highlighted, by line. */
export const slabTokens = (code: string, language: string): CodeToken[][] => highlightCode(codeLines(code).join("\n"), language);

/**
 * Paints the face in face px (scale the context for a sharper texture): the
 * theme's surface in a rounded rect; with a title, a bar holding a filename
 * tab; the code in the theme's mono font and syntax colours, each
 * highlighted line on an accent-tinted band with an accent edge, swept in
 * from the left. Returns where each line of text went.
 */
export function paintSlabFace(ctx: SlabFaceContext, { theme, aspect, layout, tokens, title, bands }: SlabFaceInput): SlabLine[] {
  const { colors, fonts, type, radius, hairline } = theme;
  const { face, pad, bar, rowHeight, size, corner } = layout;
  const syntax = syntaxColors(theme);
  const mono = type.mono[aspect];
  const painted: SlabLine[] = [];
  ctx.clearRect(0, 0, face.width, face.height);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, face.width, face.height, corner);
  ctx.clip();
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 0, face.width, face.height);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${mono.tracking * size}px`;

  if (title !== undefined && bar > 0) {
    const label = type.label[aspect];
    ctx.fillStyle = colors.surfaceAlt;
    ctx.fillRect(0, 0, face.width, bar);
    ctx.fillStyle = colors.border;
    ctx.fillRect(0, bar - hairline, face.width, hairline);
    ctx.font = `${theme.weights.medium} ${label.size}px ${fonts.mono}`;
    const textWidth = ctx.measureText(title).width;
    const tabPad = Math.round(label.size * 0.9);
    const tabTop = Math.round(bar * 0.22);
    const tab = { x: pad - tabPad, y: tabTop, width: Math.min(face.width - pad, textWidth + 2 * tabPad), height: bar - tabTop };
    ctx.fillStyle = colors.surface;
    ctx.beginPath();
    ctx.roundRect(tab.x, tab.y, tab.width, tab.height + hairline, [radius.sm, radius.sm, 0, 0]);
    ctx.fill();
    ctx.fillStyle = colors.text;
    const mid = tab.y + tab.height / 2;
    ctx.fillText(title, pad, mid);
    painted.push({ text: title, x: pad, y: mid - (label.size * label.lineHeight) / 2, width: textWidth, height: label.size * label.lineHeight, color: "text" });
  }

  const top = bar + pad;
  const edge = Math.max(4, hairline * 3);
  for (const { line, sweep } of bands) {
    if (sweep <= 0) continue;
    const y = top + (line - 1) * rowHeight;
    ctx.fillStyle = highlightBand(theme);
    ctx.fillRect(0, y, face.width * sweep, rowHeight);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(0, y, edge, rowHeight);
  }

  ctx.font = `${mono.weight} ${size}px ${fonts.mono}`;
  tokens.forEach((lineTokens, i) => {
    const y = top + i * rowHeight;
    let x = pad;
    let start: number | undefined;
    for (const token of lineTokens) {
      const width = ctx.measureText(token.text).width;
      if (token.text.trim() !== "") {
        ctx.fillStyle = syntax[token.role];
        start ??= x;
      }
      ctx.fillText(token.text, x, y + rowHeight / 2);
      x += width;
    }
    const text = lineTokens.map((t) => t.text).join("");
    if (start !== undefined) painted.push({ text: text.trim(), x: start, y, width: x - start, height: rowHeight, color: "text" });
  });
  ctx.restore();
  return painted;
}
