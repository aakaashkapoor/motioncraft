// The pure parts of GiantType: its prop rules, the word's size and place
// per aspect (set from measured font metrics, so it fills its width exactly),
// and each letter's entrance at a scene-clock ms. Runs in tests.

import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { blockCenterY } from "../layout/block";
import { safeZones } from "../layout/safe";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeSpec } from "../theme/types";
import { faceMetrics, GIANT_CHARS, GIANT_FACES, giantFace, ITALIC_SKEW_DEG, setWord, type GiantFace, type SetWord } from "./giantTypeFaces";
import { fade, tween } from "./motion";

export const GIANT_STYLES = ["heavy", "italic", "serif"] as const;
export type GiantStyle = (typeof GIANT_STYLES)[number];
export const GIANT_ENTRANCES = ["rise", "tilt", "scale", "type"] as const;
export type GiantEntrance = (typeof GIANT_ENTRANCES)[number];

export const TEXT_MAX = 12;
export const KICKER_MAX = 32;
export const TAG_MAX = 24;

/** What is wrong with GiantType props; empty when they are fine. */
export function giantTypeErrors(props: Record<string, unknown>): string[] {
  const { text, style, entrance, rule, kicker, tag, behind } = props;
  const errors: string[] = [];
  if (typeof text !== "string" || text.length < 1 || text.length > TEXT_MAX || !/^\S+( \S+)?$/.test(text)) {
    errors.push(`\`text\` must be one word or two short words of 1-${TEXT_MAX} characters (got ${JSON.stringify(text)})`);
  } else {
    const missing = [...new Set([...text].filter((ch) => !GIANT_CHARS.includes(ch)))];
    if (missing.length > 0) errors.push(`\`text\` has characters GiantType cannot set: ${missing.join(" ")} (letters, digits and . , ! ? ' & - : only)`);
  }
  if (style !== undefined && !(GIANT_STYLES as readonly unknown[]).includes(style)) errors.push(`\`style\` must be one of ${GIANT_STYLES.join(", ")} (got ${JSON.stringify(style)})`);
  if (entrance !== undefined && !(GIANT_ENTRANCES as readonly unknown[]).includes(entrance)) errors.push(`\`entrance\` must be one of ${GIANT_ENTRANCES.join(", ")} (got ${JSON.stringify(entrance)})`);
  if (rule !== undefined && typeof rule !== "boolean") errors.push("`rule` must be true or false");
  if (kicker !== undefined && (typeof kicker !== "string" || kicker.trim() === "" || kicker.length > KICKER_MAX || /[\r\n]/.test(kicker))) errors.push(`\`kicker\` must be one line of 1-${KICKER_MAX} characters`);
  if (tag !== undefined && (typeof tag !== "string" || tag.trim() === "" || tag.length > TAG_MAX || /[\r\n]/.test(tag))) errors.push(`\`tag\` must be one line of 1-${TAG_MAX} characters`);
  if (behind !== undefined) {
    const ok = typeof behind === "object" && behind !== null && typeof (behind as { component?: unknown }).component === "string";
    const props = ok ? (behind as { props?: unknown }).props : undefined;
    if (!ok || (props !== undefined && (typeof props !== "object" || props === null || Array.isArray(props)))) errors.push("`behind` must be { component, props } naming a kit component");
  }
  return errors;
}

// ---- Size and place ----

/** The word's ink spans this share of its target width (the issue's band is 88-94%). */
const WIDTH_SHARE = 0.91;
/** Tracking in em: tight for the heavy sans; the serif keeps its own spacing (tighter, its serifs collide). */
const TRACKING_EM: Record<GiantStyle, number> = { heavy: -0.04, italic: -0.04, serif: 0 };
/** The rule's thickness: this share of the font size, no thinner than RULE_MIN_PX. */
const RULE_SHARE = 0.018;
const RULE_MIN_PX = 4;
/** Room between the kicker and the tag on one row, px; less and the tag goes under the kicker. */
const ROW_GAP_PX = 32;
/** Rough widths, em per character, to decide whether kicker and tag share a row: mono plus the eyebrow's tracking, the italic serif. */
const KICKER_CHAR_EM = 0.6;
const TAG_CHAR_EM = 0.48;

export interface GiantTypeText {
  text: string;
  style?: GiantStyle;
  rule?: boolean;
  kicker?: string;
  tag?: string;
}

export interface GiantTypeLayout {
  face: GiantFace;
  /** The word's font size, px. */
  size: number;
  tracking: number;
  skewDeg: number;
  /** The width the word is measured against: the slot's, else the content area's (in 9:16 the safe text column). */
  target: number;
  /** The word set in em (letters, ink extents). */
  word: SetWord;
  /** The ink's left edge and width on the frame, px. */
  inkLeft: number;
  inkWidth: number;
  inkHeight: number;
  /** The whole block on the frame: the word's ink, then the rule and the kicker/tag rows. */
  box: Rect;
  /** Within the box: the baseline, where each glyph's line box starts (its top), and the line box's height. */
  baseline: number;
  lineTop: number;
  lineHeight: number;
  /** Within the box: the rule, and the rows under it (top). Undefined when not drawn. */
  rule?: Rect;
  kickerTop?: number;
  tagTop?: number;
  kickerSpec: TypeSpec;
  tagSpec: TypeSpec;
  /** The ink box padded so blur and overshoot are not clipped, em of the font size. */
  clipPad: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The kicker's type: the eyebrow step (uppercase, spaced) in the mono family. */
export const kickerSpec = (theme: Theme, aspect: Aspect): TypeSpec => theme.type.eyebrow[aspect];
/** The tag's type: the label step, in the italic serif. */
export const tagSpec = (theme: Theme, aspect: Aspect): TypeSpec => ({ ...theme.type.label[aspect], weight: 400, tracking: 0 });

/**
 * The word sized so its ink spans WIDTH_SHARE of the target width, smaller
 * only when the block would not fit the area's height; the block centered on
 * the frame (the slot when nested) and on its optical center.
 */
export function giantTypeLayout(theme: Theme, aspect: Aspect, props: GiantTypeText, slot?: Rect): GiantTypeLayout {
  const style = props.style ?? "heavy";
  const { spacing } = theme;
  const content = slot ?? contentArea(theme, aspect);
  // The safe text column (the slot when nested): in 9:16 the platform's UI covers the frame's sides.
  const target = content.width;
  const centerX = content.x + content.width / 2;
  // In 9:16 the column's right edge reaches the platform's button rail: the word stays above the rail.
  const rails = slot !== undefined ? [] : safeZones(aspect, theme.safe).keepOut.filter((k) => k.x < centerX + target / 2 && k.x + k.width > centerX - target / 2 && k.y > content.y);
  const railTop = Math.min(content.y + content.height, ...rails.map((k) => k.y - spacing.md));
  const area = { ...content, height: railTop - content.y };
  const face = giantFace(theme.fonts.display, style === "serif");
  const tracking = TRACKING_EM[style];
  const skewDeg = style === "italic" ? ITALIC_SKEW_DEG : 0;
  const word = setWord(props.text, face, tracking, style === "italic");
  const metrics = faceMetrics(face);

  const kSpec = kickerSpec(theme, aspect);
  const tSpec = tagSpec(theme, aspect);
  const kickerHeight = props.kicker === undefined ? 0 : Math.ceil(kSpec.size * kSpec.lineHeight);
  const tagHeight = props.tag === undefined ? 0 : Math.ceil(tSpec.size * tSpec.lineHeight);

  // Everything under the word, for a font size (the rule's thickness follows it).
  const under = (size: number, inkWidth: number) => {
    const ruleGap = props.rule === true ? spacing.lg : 0;
    const ruleHeight = props.rule === true ? Math.max(RULE_MIN_PX, Math.round(size * RULE_SHARE)) : 0;
    const rows = kickerHeight + tagHeight > 0;
    const kickerWidth = (props.kicker?.length ?? 0) * KICKER_CHAR_EM * kSpec.size;
    const tagWidth = (props.tag?.length ?? 0) * TAG_CHAR_EM * tSpec.size;
    const shared = kickerHeight === 0 || tagHeight === 0 || kickerWidth + ROW_GAP_PX + tagWidth <= inkWidth;
    const rowsGap = rows ? (props.rule === true ? spacing.md : spacing.lg) : 0;
    const rowsHeight = shared ? Math.max(kickerHeight, tagHeight) : kickerHeight + spacing.xs + tagHeight;
    return { ruleGap, ruleHeight, rowsGap, rowsHeight, shared, total: ruleGap + ruleHeight + rowsGap + (rows ? rowsHeight : 0) };
  };

  const inkEm = word.top + word.bottom;
  // The ink spans WIDTH_SHARE of the target, unless the letters' text boxes (wider than the ink, more so leaning) would then leave the target.
  let size = Math.min((WIDTH_SHARE * target) / word.width, target / (word.boxRight - word.boxLeft));
  // A very short word could be taller than the area: then height decides.
  const fit = (s: number) => s * inkEm + under(s, s * word.width).total <= area.height;
  if (!fit(size)) size = Math.max(1, (area.height - under(size, size * word.width).total) / inkEm);
  while (!fit(size) && size > 1) size -= 1;
  size = Math.floor(size * 100) / 100;

  const inkWidth = round(size * word.width);
  const inkHeight = round(size * inkEm);
  const parts = under(size, inkWidth);
  const height = Math.ceil(inkHeight + parts.total);
  // The ink is centered, then moved only as far as keeps the text boxes inside the target (a lean overhangs one side more).
  const boxLeft = centerX - inkWidth / 2 - (word.left - word.boxLeft) * size;
  const boxRight = centerX + inkWidth / 2 + (word.boxRight - word.right) * size;
  const shift = Math.max(0, centerX - target / 2 - boxLeft) - Math.max(0, boxRight - (centerX + target / 2));
  const inkLeft = round(centerX - inkWidth / 2 + shift);
  const optical = blockCenterY(theme, aspect, slot);
  const center = rails.length > 0 ? Math.min(optical, area.y + area.height / 2) : optical;
  const y = round(Math.min(area.y + area.height - height, Math.max(area.y, center - height / 2)));

  const baseline = round(size * word.top);
  const lineHeight = round(size * (metrics.ascent + metrics.descent));
  const ruleTop = inkHeight + parts.ruleGap;
  const rowsTop = ruleTop + parts.ruleHeight + parts.rowsGap;
  return {
    face,
    size,
    tracking,
    skewDeg,
    target,
    word,
    inkLeft,
    inkWidth,
    inkHeight,
    box: { x: inkLeft, y, width: inkWidth, height },
    baseline,
    lineTop: round(baseline - size * metrics.ascent),
    lineHeight,
    ...(props.rule === true && { rule: { x: 0, y: round(ruleTop), width: inkWidth, height: parts.ruleHeight } }),
    ...(props.kicker !== undefined && { kickerTop: round(rowsTop) }),
    ...(props.tag !== undefined && { tagTop: round(parts.shared ? rowsTop : rowsTop + kickerHeight + spacing.xs) }),
    kickerSpec: kSpec,
    tagSpec: tSpec,
    clipPad: 0.12,
  };
}

/** The letters' x on the box, px: each glyph's pen origin, the ink's left edge at 0. */
export function letterOrigins(layout: GiantTypeLayout): number[] {
  return layout.word.letters.map((l) => round((l.x - layout.word.left) * layout.size));
}

// ---- Motion ----

/** Letters rising through the mask start this far apart. */
const RISE_STEP_MS = 30;
/** Tilted letters start this far apart, rotated this much on alternating sides, and this far below (em). */
const TILT_STEP_MS = 40;
const TILT_DEG = 7;
const TILT_DROP_EM = 0.18;
/** `scale` arrives from this scale with this much blur (em of the font size). */
const SCALE_FROM = 1.15;
const SCALE_BLUR_EM = 0.06;
/** Typed letters appear this far apart, closer when the last would come after TYPE_SPAN_MS; the cursor stays this long after. */
const TYPE_STEP_MS = 70;
const TYPE_SPAN_MS = 700;
const TYPE_CURSOR_HOLD_MS = 300;

export interface LetterPose {
  /** 0 before the letter starts to arrive, 1 once it has landed. */
  progress: number;
  opacity: number;
  /** Down from rest: in mask heights for `rise`, em for `tilt`. */
  drop: number;
  rotate: number;
  scale: number;
  /** Blur in em of the font size. */
  blur: number;
}

const REST: LetterPose = { progress: 1, opacity: 1, drop: 0, rotate: 0, scale: 1, blur: 0 };
const r3 = (n: number) => Math.round(n * 1000) / 1000 || 0;

/** When typed letter `i` of `n` appears, scene ms. */
export function typedAt(theme: Theme, i: number, n: number): number {
  const step = n > 1 ? Math.min(TYPE_STEP_MS, TYPE_SPAN_MS / (n - 1)) : TYPE_STEP_MS;
  return theme.motion.leadMs + i * step;
}

/** Whether the hard cursor shows at `ms`, and after which letter (its index; -1 before the first). */
export function typeCursor(theme: Theme, n: number, ms: number): { shown: boolean; after: number } {
  const start = theme.motion.leadMs;
  const last = typedAt(theme, n - 1, n);
  let after = -1;
  for (let i = 0; i < n; i++) if (ms >= typedAt(theme, i, n)) after = i;
  return { shown: ms >= start && ms < last + TYPE_CURSOR_HOLD_MS, after };
}

/** Letter `i` of `n` (spaces count) `ms` into the scene. */
export function giantTypeEntrance(theme: Theme, entrance: GiantEntrance, i: number, n: number, ms: number): LetterPose {
  const { motion } = theme;
  const lead = motion.leadMs;
  switch (entrance) {
    case "rise": {
      const t = ms - (lead + i * RISE_STEP_MS);
      const p = tween(motion["text.in"], t);
      return t >= motion["text.in"].ms ? REST : { ...REST, progress: r3(p), drop: r3(1 - p) };
    }
    case "tilt": {
      const t = ms - (lead + i * TILT_STEP_MS);
      if (t >= motion.enter.ms) return REST;
      const p = tween(motion.enter, t);
      const side = i % 2 === 0 ? -1 : 1;
      return { ...REST, progress: r3(Math.min(1, Math.max(0, p))), opacity: r3(fade(motion.fx, t)), drop: r3((1 - p) * TILT_DROP_EM), rotate: r3((1 - p) * TILT_DEG * side) };
    }
    case "scale": {
      const token = motion["enter.hero"];
      const t = ms - lead;
      if (t >= token.ms) return REST;
      const p = tween(token, t);
      const f = fade(token, t);
      // It fades in with the scale, so the word is whole only once it is back inside its width.
      return { ...REST, progress: r3(f), opacity: r3(f), scale: r3(SCALE_FROM - (SCALE_FROM - 1) * p), blur: r3((1 - f) * SCALE_BLUR_EM) };
    }
    case "type": {
      const shown = ms >= typedAt(theme, i, n);
      return shown ? REST : { ...REST, progress: 0, opacity: 0 };
    }
  }
}

/** When the word has landed, scene ms: the last letter's arrival ends. */
export function landedMs(theme: Theme, entrance: GiantEntrance, n: number): number {
  const { motion } = theme;
  const lead = motion.leadMs;
  switch (entrance) {
    case "rise":
      return lead + (n - 1) * RISE_STEP_MS + motion["text.in"].ms;
    case "tilt":
      return lead + (n - 1) * TILT_STEP_MS + motion.enter.ms;
    case "scale":
      return lead + motion["enter.hero"].ms;
    case "type":
      return typedAt(theme, n - 1, n) + TYPE_CURSOR_HOLD_MS;
  }
}

/** The rule and the lines under it start this long before the word lands, no later than DETAILS_LATEST_MS. */
const DETAILS_LEAD_MS = 250;
const DETAILS_LATEST_MS = 900;
/** The kicker and the tag follow the rule by this much. */
const ROWS_AFTER_MS = 150;

/** When the rule starts to draw, and when the kicker and tag arrive, scene ms. */
export function detailsTiming(theme: Theme, entrance: GiantEntrance, n: number): { rule: number; rows: number } {
  const rule = Math.min(DETAILS_LATEST_MS, landedMs(theme, entrance, n) - DETAILS_LEAD_MS);
  return { rule, rows: rule + ROWS_AFTER_MS };
}

export { GIANT_FACES, ITALIC_SKEW_DEG };
