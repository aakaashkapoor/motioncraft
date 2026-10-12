// The header a scene sets at the top of its content area: the eyebrow and
// headline of a top-level `SceneFrame` or `Section`. An overlay in a top corner
// shares that row: when its pill would crowd the header's estimated text, the
// scene's content area starts below the pill instead (`sceneAreaUnderOverlays`),
// and the overlay check holds the measured text to the same clearance. Pure.

import { contentArea } from "../layout/caption";
import type { Aspect, Rect } from "../layout/frame";
import { AVG_CHAR_EM, charsPerLine } from "../layout/textFit";
import { frameLineSpec, sceneFrameLayout } from "../kit/SceneFrame";
import { sectionLayout, type SectionContentWidth } from "../kit/Section";
import { DEFAULT_OVERLAY_CORNER, type StoryboardOverlay, type StoryboardScene } from "../storyboard/types";
import type { Theme, TypeSpec } from "../theme/types";
import { grownBy, overlayBox, overlayClearance } from "./layout";

export interface SceneHeaderText {
  eyebrow?: string;
  headline: string;
}

/**
 * Average glyph widths in em, for how wide a line is: mixed case (narrower
 * than `AVG_CHAR_EM`, which the layouts wrap with and which errs wide; the
 * built-in themes' headlines and eyebrows measure 0.43-0.47), and Section's
 * uppercase, spaced-out eyebrow, which `sectionLayout` wraps at 0.82. The
 * overlay check measures the real text, so an estimate a little narrow is
 * still caught.
 */
const LINE_EM = 0.47;
const CAPS_EYEBROW_EM = { wrap: 0.82, line: 0.75 };
const MIXED_EM = { wrap: AVG_CHAR_EM, line: LINE_EM };

const optionalString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/** The eyebrow and headline of a scene whose component sets a header (`SceneFrame`, `Section`); undefined otherwise. */
export function sceneHeaderText(scene: Pick<StoryboardScene, "component" | "props">): SceneHeaderText | undefined {
  if (scene.component !== "SceneFrame" && scene.component !== "Section") return undefined;
  const headline = optionalString(scene.props.headline);
  if (headline === undefined) return undefined;
  const eyebrow = optionalString(scene.props.eyebrow);
  return { headline, ...(eyebrow !== undefined && { eyebrow }) };
}

/** Characters on the longest line of `text` wrapped greedily at `max` characters a line. */
function widestLine(text: string, max: number): number {
  let widest = 0;
  let used = 0;
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const needed = used === 0 ? word.length : used + 1 + word.length;
    used = needed <= max ? needed : Math.min(word.length, max);
    widest = Math.max(widest, used);
  }
  return widest;
}

/** The estimated box of `text` set in `spec` inside `slot`: as wide as its longest line, centered or flush left, as tall as the slot. */
function textExtent(text: string, slot: Rect, spec: TypeSpec, centered: boolean, em = MIXED_EM): Rect {
  const width = Math.min(slot.width, widestLine(text, charsPerLine(slot.width, spec.size, em.wrap)) * spec.size * em.line);
  return { x: centered ? slot.x + (slot.width - width) / 2 : slot.x, y: slot.y, width, height: slot.height };
}

/**
 * Where a scene's header text sits in `area` (the content area by default),
 * estimated without the DOM: one box for the eyebrow line and one for the
 * headline, from the same layout functions the components use. Empty for a
 * scene without a header.
 */
export function sceneHeaderBoxes(theme: Theme, aspect: Aspect, scene: Pick<StoryboardScene, "component" | "props">, area = contentArea(theme, aspect)): Rect[] {
  const text = sceneHeaderText(scene);
  if (text === undefined) return [];
  if (scene.component === "SceneFrame") {
    const layout = sceneFrameLayout(theme, aspect, { ...text, footer: optionalString(scene.props.footer) }, area);
    const boxes = [textExtent(text.headline, layout.headline, theme.type[layout.headlineRole][aspect], true)];
    if (text.eyebrow !== undefined && layout.eyebrow !== undefined) boxes.unshift(textExtent(text.eyebrow, layout.eyebrow, frameLineSpec(theme, aspect), true));
    return boxes;
  }
  const width: SectionContentWidth = scene.props.contentWidth === "wide" ? "wide" : "narrow";
  const layout = sectionLayout(theme, aspect, { ...text, note: optionalString(scene.props.note) }, width, area);
  const centered = layout.arrangement === "below";
  const boxes = [textExtent(text.headline, layout.headline, theme.type[layout.headlineRole][aspect], centered)];
  if (text.eyebrow !== undefined && layout.eyebrow !== undefined) boxes.unshift(textExtent(text.eyebrow, layout.eyebrow, theme.type.eyebrow[aspect], centered, CAPS_EYEBROW_EM));
  return boxes;
}

const meets = (a: Rect, b: Rect): boolean =>
  Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);

/**
 * The content area for `scene` with `overlays` on screen: undefined (the
 * default content area) unless the pill of an overlay shown on the scene in a
 * top corner would come closer than `overlayClearance` to the scene's header;
 * then the area starts that clearance below the lowest such pill, so the
 * header steps down under the tag instead of sharing its row.
 */
export function sceneAreaUnderOverlays(
  theme: Theme,
  aspect: Aspect,
  scene: Pick<StoryboardScene, "id" | "component" | "props">,
  overlays: readonly StoryboardOverlay[],
): Rect | undefined {
  const headers = sceneHeaderBoxes(theme, aspect, scene);
  if (headers.length === 0) return undefined;
  const clearance = overlayClearance(theme);
  const crowding = overlays
    .filter((overlay) => overlay.scenes === undefined || overlay.scenes.includes(scene.id))
    .map((overlay) => ({ corner: overlay.corner ?? DEFAULT_OVERLAY_CORNER, text: overlay.text }))
    .filter(({ corner }) => corner.startsWith("top"))
    .map(({ corner, text }) => overlayBox(theme, aspect, text, corner))
    .filter((pill) => headers.some((header) => meets(grownBy(pill, clearance), header)));
  if (crowding.length === 0) return undefined;
  const area = contentArea(theme, aspect);
  const top = Math.max(...crowding.map((pill) => pill.y + pill.height)) + clearance.y;
  return { ...area, y: top, height: area.y + area.height - top };
}
