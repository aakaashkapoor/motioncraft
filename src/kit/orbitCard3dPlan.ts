// The pure parts of OrbitCard3D (ported from HyperFrames `orbit-card`): its
// prop rules, the dot sphere, the card's orbit at a scene-clock ms, the card's
// shape and size per aspect, and the painting of its face (icon, title,
// subtitle) onto a 2D canvas context. No WebGL here, so all of it runs in
// tests.
//
// The world: the sphere sits at the origin; the card's round aperture is
// centred on the sphere's vertical axis and the card orbits that axis at
// `orbitRadius`, its face turned outward, so in front (angle 0) the aperture
// frames the sphere behind it. One scene unit is one unit of card width / 4.4,
// the source's card.

import * as THREE from "three";
import { isIconName } from "../icons";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea } from "../layout/caption";
import { frameSize, isTall, type Rect } from "../layout/frame";
import { safeZones } from "../layout/safe";
import type { Aspect } from "../storyboard/types";
import { withAlpha } from "../theme/color";
import type { Theme, TypeSpec } from "../theme/types";

export const DOTS_MIN = 400;
export const DOTS_MAX = 4000;
export const DOTS_DEFAULT = 1600;
export const TITLE_MAX = 32;
export const SUBTITLE_MAX = 60;

/** What is wrong with OrbitCard3D props; empty when they are fine. */
export function orbitCard3DErrors(props: Record<string, unknown>): string[] {
  const { title, subtitle, icon, dots } = props;
  const errors: string[] = [];
  if (typeof title !== "string" || title.trim().length === 0 || title.length > TITLE_MAX) errors.push(`\`title\` must be a string of 1-${TITLE_MAX} characters`);
  if (subtitle !== undefined && (typeof subtitle !== "string" || subtitle.length > SUBTITLE_MAX)) errors.push(`\`subtitle\` must be a string of up to ${SUBTITLE_MAX} characters`);
  if (icon !== undefined && (typeof icon !== "string" || !isIconName(icon))) errors.push("`icon` must be a bundled icon name");
  if (dots !== undefined && (typeof dots !== "number" || !Number.isInteger(dots) || dots < DOTS_MIN || dots > DOTS_MAX)) errors.push(`\`dots\` must be a whole number from ${DOTS_MIN} to ${DOTS_MAX}`);
  return errors;
}

// ---- The dot sphere ----

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Points above this height (unit sphere) are the accent cap, about the top 9%. */
export const CAP_Y = 0.82;

/** `count` points spread evenly over the unit sphere (a Fibonacci sphere), x y z each. Deterministic. */
export function spherePoints(count: number): Float32Array {
  const points = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const a = GOLDEN_ANGLE * i;
    points[3 * i] = Math.cos(a) * ring;
    points[3 * i + 1] = y;
    points[3 * i + 2] = Math.sin(a) * ring;
  }
  return points;
}

/** The sphere's geometry: `count` positions on the unit sphere and a colour per point (set each frame). */
export function sphereGeometry(count: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(spherePoints(count), 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

// ---- The orbit ----

/** The orbit starts on the scene's lead and lands, face-on, here. */
export const ORBIT_START_MS = 150;
export const ORBIT_LAND_MS = 1800;
/** How far the card travels around the sphere, radians: from behind it to the front. */
const TRAVEL = (220 * Math.PI) / 180;
/** The card's lean back as it sets off (radians), gone as it lands. */
const LEAN = 0.2;
/** The camera starts this much farther away and dollies in as the card lands. */
const DOLLY = 0.14;

/** Ease-out (GSAP power2.out, the source's card entrance). */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export interface OrbitPose {
  /** How far the orbit has come, 0 -> 1 (eased). */
  done: number;
  /** The card's angle about the sphere's vertical axis, radians: 0 in front, facing the camera. */
  angle: number;
  /** Where the card's aperture centre is, on a circle of `radius` about the axis. */
  card: { x: number; z: number };
  /** The card's lean about its horizontal axis, radians. */
  tilt: number;
  /** The camera's distance as a multiple of its landed distance. */
  dolly: number;
  /** How far the camera's sideways drift has left to go, 1 -> 0. */
  drift: number;
}

/** The card's orbit and the camera's move at `ms` on the scene clock, on an orbit of `radius`. */
export function orbitPose(ms: number, radius = 1): OrbitPose {
  const t = Math.min(1, Math.max(0, (ms - ORBIT_START_MS) / (ORBIT_LAND_MS - ORBIT_START_MS)));
  const done = easeOutCubic(t);
  const left = 1 - done;
  const angle = -TRAVEL * left;
  return {
    done,
    angle,
    card: { x: radius * Math.sin(angle), z: radius * Math.cos(angle) },
    tilt: LEAN * left,
    dolly: 1 + DOLLY * left,
    drift: left,
  };
}

// ---- Shape and layout ----

export interface CardShape {
  width: number;
  height: number;
  corner: number;
  /** The aperture: its centre's height above the card's centre, and its radius. */
  hole: { y: number; r: number };
  /** The face's text area: its centre's height (from the card's centre), width and height. */
  copy: { y: number; width: number; height: number };
  /** Extrusion depth of the plate. */
  depth: number;
}

/** Tall aspects: a portrait card, the aperture above the copy. 16:9: squarer, so 45% of the content width fits the height. */
export function cardShape(aspect: Aspect): CardShape {
  return isTall(aspect)
    ? { width: 4.4, height: 5, corner: 0.26, hole: { y: 1, r: 1.05 }, copy: { y: -1.25, width: 3.8, height: 1.95 }, depth: 0.16 }
    : { width: 4.8, height: 4.4, corner: 0.26, hole: { y: 0.95, r: 0.95 }, copy: { y: -1.1, width: 4.2, height: 1.75 }, depth: 0.16 };
}

/** The sphere's radius: a little inside the aperture, which is nearer the camera and so looks larger. */
export const sphereRadius = (shape: CardShape) => shape.hole.r * 0.86;
/** The orbit's radius: clear of the sphere. */
export const orbitRadius = (shape: CardShape) => sphereRadius(shape) + 0.45;

/** How far past its card a card's shadow reaches, in multiples of the theme's shadow blur. */
export const SHADOW_REACH = 1.5;

const expand = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by });
function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, width: Math.min(a.x + a.width, b.x + b.width) - x, height: Math.min(a.y + a.height, b.y + b.height) - y };
}

/** In 16:9 the card is this share of the content area's width. */
const WIDE_CARD_SHARE = 0.45;
/** The card's height may take at most this share of its area's height. */
const FILL_HEIGHT = 0.97;

export interface OrbitCardLayout {
  /** The component's own box, frame px: its slot, or the whole frame. */
  root: Rect;
  /** The box the 3D stage draws in, frame px: the whole frame, or its slot and a margin for the card's shadow. */
  stage: Rect;
  /** Where the landed card is, frame px. */
  box: Rect;
  cardPx: number;
  cardHeightPx: number;
  shape: CardShape;
  /** Screen px per scene unit at the landed card's face. */
  pxPerUnit: number;
  /** The face's text area in screen px. */
  copyPx: { width: number; height: number };
}

/** The card's size and place: the primary width in 9:16 and 4:5, 45% of the content width in 16:9, never taller than its area. */
export function orbitCardLayout(theme: Theme, aspect: Aspect, slot?: Rect): OrbitCardLayout {
  const area = slot ?? contentArea(theme, aspect);
  const shape = cardShape(aspect);
  const preferred = isTall(aspect) ? safeZones(aspect, theme.safe).primaryWidth : Math.round(contentArea(theme, aspect).width * WIDE_CARD_SHARE);
  const cardPx = Math.floor(Math.min(preferred, area.width, (area.height * FILL_HEIGHT * shape.width) / shape.height));
  const pxPerUnit = cardPx / shape.width;
  const cardHeightPx = Math.round(shape.height * pxPerUnit);
  const box = placeBlock(area, { width: cardPx, height: cardHeightPx }, blockCenterY(theme, aspect, slot));
  const frame = { x: 0, y: 0, ...frameSize(aspect) };
  const root = slot ?? frame;
  return {
    root,
    // A scene of its own draws on the whole frame, so the card's shadow and orbit are never cut at the content
    // edge; in a slot, the stage reaches past the slot by the shadow's spread, within the frame.
    stage: slot === undefined ? frame : intersect(expand(slot, theme.cardShadow.blur * SHADOW_REACH), frame),
    box,
    cardPx,
    cardHeightPx,
    shape,
    pxPerUnit,
    copyPx: { width: Math.round(shape.copy.width * pxPerUnit), height: Math.round(shape.copy.height * pxPerUnit) },
  };
}

// ---- The face ----

/** The parts of a 2D canvas context the face is painted with. */
export type FaceContext = Pick<
  CanvasRenderingContext2D,
  "font" | "fillStyle" | "textBaseline" | "textAlign" | "letterSpacing" | "clearRect" | "beginPath" | "arc" | "fill" | "fillText" | "measureText" | "save" | "restore"
>;

/** A line of text painted on the face: its box in the copy box's px, and the theme colour it is painted in. */
export interface FaceLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: "text" | "textMuted";
}

export type DrawIcon = (ctx: FaceContext, name: string, x: number, y: number, size: number, color: string) => void;

export interface FaceInput {
  theme: Theme;
  aspect: Aspect;
  layout: OrbitCardLayout;
  title: string;
  subtitle?: string;
  icon?: string;
  /** Draws a bundled icon (a 24-unit line icon) at `x`, `y` (its top-left), `size` px square. */
  drawIcon: DrawIcon;
}

const font = (spec: TypeSpec, family: string) => `${spec.weight} ${spec.size}px ${family}`;

/** `text` broken into lines no wider than `width` at the context's current font. */
function wrap(ctx: FaceContext, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line === "" ? word : `${line} ${word}`;
    if (line !== "" && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== "") lines.push(line);
  return lines;
}

/** Title steps to try, largest first; the subtitle takes the step below. */
const STEPS = [
  ["title", "subtitle"],
  ["subtitle", "body"],
  ["body", "label"],
  ["label", "label"],
] as const;
/** At most this many lines of title and of subtitle. */
const MAX_LINES = 2;
const TINT_OPACITY = 0.14;

type Orientation = "row" | "column";

/** Shrink factors to try on the smallest step when nothing on the ramp fits. */
const SHRINK = [0.9, 0.8, 0.7, 0.6, 0.5];
const scaled = (spec: TypeSpec, scale: number): TypeSpec => (scale === 1 ? spec : { ...spec, size: Math.round(spec.size * scale) });

/**
 * Paints the card's copy (an icon badge and the title and subtitle, in the
 * theme's card colours and fonts) into a box `layout.copyPx` in screen px,
 * centred in it; the context is in screen px (scale it for a sharper
 * texture). Like a flat `Card`: the badge sits beside the text while the
 * title fits one line, above it otherwise; text with a subtitle keeps a left
 * edge, a title alone is centred. Returns where each line of text went.
 */
export function paintCardFace(ctx: FaceContext, { theme, aspect, layout, title, subtitle, icon, drawIcon }: FaceInput): FaceLine[] {
  const { colors, fonts, type, spacing } = theme;
  const { width, height } = layout.copyPx;
  ctx.clearRect(0, 0, width, height);
  const label = subtitle === undefined;

  // `scale` shrinks the smallest step, for a card too small for the ramp (a narrow slot).
  const plan = (step: (typeof STEPS)[number], orientation: Orientation, scale = 1) => {
    const row = orientation === "row";
    const titleSpec = scaled({ ...type[step[0]][aspect], weight: type.title[aspect].weight }, scale);
    const subSpec = scaled({ ...type[step[1]][aspect], weight: theme.weights.regular }, scale);
    const badge = icon === undefined ? 0 : Math.round(titleSpec.size * 1.6);
    const gap = badge === 0 ? 0 : row ? spacing.sm : spacing.xs;
    const textWidth = row ? width - badge - gap : width;
    ctx.font = font(titleSpec, fonts.display);
    ctx.letterSpacing = `${titleSpec.tracking * titleSpec.size}px`;
    const titleLines = wrap(ctx, title, textWidth);
    const titleWidth = Math.max(...titleLines.map((l) => ctx.measureText(l).width));
    ctx.font = font(subSpec, fonts.body);
    ctx.letterSpacing = `${subSpec.tracking * subSpec.size}px`;
    const subLines = subtitle === undefined ? [] : wrap(ctx, subtitle, textWidth);
    const subWidth = Math.max(0, ...subLines.map((l) => ctx.measureText(l).width));
    const titleLine = titleSpec.size * titleSpec.lineHeight;
    const subLine = subSpec.size * subSpec.lineHeight;
    const textHeight = titleLines.length * titleLine + (subLines.length > 0 ? spacing.xxs + subLines.length * subLine : 0);
    const textW = Math.max(titleWidth, subWidth);
    const blockWidth = row ? badge + gap + textW : Math.max(badge, textW);
    const blockHeight = row ? Math.max(badge, textHeight) : badge + gap + textHeight;
    const fits = titleLines.length <= MAX_LINES && subLines.length <= MAX_LINES && blockHeight <= height && textW <= textWidth;
    return { row, titleSpec, subSpec, badge, gap, titleLines, subLines, titleLine, subLine, textHeight, textW, blockWidth, blockHeight, fits };
  };
  const orientations: Orientation[] = icon === undefined ? ["row"] : ["row", "column"];
  const candidates = STEPS.flatMap((step) => orientations.map((o) => plan(step, o)));
  // The title on one line at one of the two largest steps; else the largest step that fits.
  const p =
    candidates.slice(0, 2 * orientations.length).find((c) => c.fits && c.titleLines.length === 1) ??
    candidates.find((c) => c.fits) ??
    SHRINK.flatMap((scale) => orientations.map((o) => plan(STEPS[STEPS.length - 1]!, o, scale))).find((c) => c.fits) ??
    plan(STEPS[STEPS.length - 1]!, orientations[orientations.length - 1]!, SHRINK[SHRINK.length - 1]);

  const left = Math.max(0, (width - p.blockWidth) / 2);
  const top = (height - p.blockHeight) / 2;
  // A title alone centres, unless it shares a row with its badge.
  const centred = label && !(p.row && p.badge > 0);
  ctx.save();
  if (icon !== undefined) {
    const cx = centred ? width / 2 : left + p.badge / 2;
    const cy = p.row ? top + p.blockHeight / 2 : top + p.badge / 2;
    ctx.fillStyle = withAlpha(colors.accent, TINT_OPACITY);
    ctx.beginPath();
    ctx.arc(cx, cy, p.badge / 2, 0, Math.PI * 2);
    ctx.fill();
    const iconSize = Math.round(p.badge * 0.55);
    drawIcon(ctx, icon, cx - iconSize / 2, cy - iconSize / 2, iconSize, colors.accent);
  }
  const x = centred ? width / 2 : p.row ? left + p.badge + p.gap : left;
  let y = p.row ? top + (p.blockHeight - p.textHeight) / 2 : top + p.badge + p.gap;
  ctx.textAlign = centred ? "center" : "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colors.text;
  ctx.font = font(p.titleSpec, fonts.display);
  ctx.letterSpacing = `${p.titleSpec.tracking * p.titleSpec.size}px`;
  const painted: FaceLine[] = [];
  const paint = (line: string, lineHeight: number, color: FaceLine["color"]) => {
    ctx.fillText(line, x, y + lineHeight / 2);
    const w = ctx.measureText(line).width;
    painted.push({ text: line, x: centred ? x - w / 2 : x, y, width: w, height: lineHeight, color });
    y += lineHeight;
  };
  for (const line of p.titleLines) paint(line, p.titleLine, "text");
  if (p.subLines.length > 0) {
    y += spacing.xxs;
    ctx.fillStyle = colors.textMuted;
    ctx.font = font(p.subSpec, fonts.body);
    ctx.letterSpacing = `${p.subSpec.tracking * p.subSpec.size}px`;
    for (const line of p.subLines) paint(line, p.subLine, "textMuted");
  }
  ctx.restore();
  return painted;
}
