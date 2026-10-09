// The standard frame for explanatory scenes (design v2, section 4): an optional
// eyebrow, a headline, a content slot holding any other kit component, and an
// optional one-line note at the bottom. In 16:9 narrow content sits beside the
// headline and wide content below it; 9:16 always stacks. The eyebrow fades in
// first, the headline rises word by word, then the content and the note arrive.

import { Fragment } from "react";
import { stagger } from "../engine/choreography";
import { expoOut, interpolate } from "../engine/easing";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { estimateTextHeight } from "../layout/textFit";
import type { Aspect } from "../storyboard/types";
import { headlineColor } from "../theme/roles";
import type { Theme, TypeSpec } from "../theme/types";
import { kit } from "./index";
import { themeEasing } from "./motion";
import type { KitProps } from "./types";

/** A nested kit component: the scene shape, without id or narration. */
export interface SectionContent {
  component: string;
  props?: Record<string, unknown>;
}

/** `narrow` content (a stat, a card) fits beside the headline in 16:9; `wide` content (a diagram) goes below. */
export type SectionContentWidth = "narrow" | "wide";

export interface SectionProps extends KitProps {
  headline: string;
  /** Small muted label above the headline. */
  eyebrow?: string;
  /** The component that fills the content slot. */
  content?: SectionContent;
  /** How much room the content wants in 16:9. Default "narrow". */
  contentWidth?: SectionContentWidth;
  /** One quiet line at the bottom. */
  note?: string;
}

export interface SectionText {
  eyebrow?: string;
  headline: string;
  note?: string;
}

export interface SectionLayout {
  arrangement: "beside" | "below";
  /** The ramp role the headline is set in: `title` when `headline` would crowd out the content. */
  headlineRole: "headline" | "title";
  eyebrow?: Rect;
  headline: Rect;
  /** The content slot, passed to the nested component as its `area`. */
  content: Rect;
  note?: Rect;
}

/** Headline roles to try, largest first. */
const HEADLINE_ROLES = ["headline", "title"] as const;
/** In a stack, the headline may take at most this share of the height. */
const MAX_STACKED_HEADLINE = 0.4;
/** In 16:9 beside, the text column's share of the width (after the gutter). */
const TEXT_COLUMN_SHARE = 0.48;
// The eyebrow is uppercase and widely tracked: wider than average text.
const EYEBROW_CHAR_EM = 0.82;
/** Height of a glyph box in em. A tight headline line height is shorter, so glyphs poke out of the line box. */
const GLYPH_BOX_EM = 1.4;

/** Room in px kept above and below tightly set text so its glyphs stay inside its box. */
export function glyphPad(spec: TypeSpec): number {
  return Math.ceil(Math.max(0, (GLYPH_BOX_EM - spec.lineHeight) / 2) * spec.size);
}

const height = (text: string | undefined, width: number, spec: TypeSpec, charEm?: number): number =>
  text === undefined ? 0 : estimateTextHeight(text, width, { size: spec.size, lineHeight: spec.lineHeight, charEm });

/**
 * Where each part goes, in frame px, inside `area` (the content area by
 * default). The note sits at the bottom; the content slot takes the room left
 * beside or below the headline. If even the smaller headline role does not
 * fit, it overflows visibly and the layer-1 checks report it.
 */
export function sectionLayout(
  theme: Theme,
  aspect: Aspect,
  text: SectionText,
  contentWidth: SectionContentWidth = "narrow",
  area: Rect = contentArea(theme, aspect),
): SectionLayout {
  const { spacing, type } = theme;
  const arrangement = aspect === "16:9" && contentWidth === "narrow" ? "beside" : "below";

  const noteHeight = height(text.note, area.width, type.caption[aspect]);
  const bodyHeight = text.note === undefined ? area.height : area.height - noteHeight - spacing.lg;
  const textWidth = arrangement === "beside" ? Math.floor((area.width - spacing.xl) * TEXT_COLUMN_SHARE) : area.width;

  const eyebrowHeight = height(text.eyebrow, textWidth, type.eyebrow[aspect], EYEBROW_CHAR_EM);
  const eyebrowSpace = text.eyebrow === undefined ? 0 : eyebrowHeight + spacing.sm;
  const maxHeadline = arrangement === "beside" ? bodyHeight - eyebrowSpace : bodyHeight * MAX_STACKED_HEADLINE;
  const headlineAt = (role: SectionLayout["headlineRole"]) =>
    height(text.headline, textWidth, type[role][aspect]) + 2 * glyphPad(type[role][aspect]);
  const headlineRole = HEADLINE_ROLES.find((role) => headlineAt(role) <= maxHeadline) ?? HEADLINE_ROLES.at(-1)!;
  const headlineHeight = headlineAt(headlineRole);

  // Beside, the text block centers on the content; stacked, it starts at the top.
  const top = arrangement === "beside" ? area.y + Math.max(0, (bodyHeight - eyebrowSpace - headlineHeight) / 2) : area.y;
  const headline = { x: area.x, y: top + eyebrowSpace, width: textWidth, height: headlineHeight };
  let content: Rect;
  if (arrangement === "beside") {
    const x = area.x + textWidth + spacing.xl;
    content = { x, y: area.y, width: area.x + area.width - x, height: bodyHeight };
  } else {
    const y = headline.y + headlineHeight + spacing.lg;
    content = { x: area.x, y, width: area.width, height: Math.max(0, area.y + bodyHeight - y) };
  }

  return {
    arrangement,
    headlineRole,
    ...(text.eyebrow !== undefined && { eyebrow: { x: area.x, y: top, width: textWidth, height: eyebrowHeight } }),
    headline,
    content,
    ...(text.note !== undefined && { note: { x: area.x, y: area.y + area.height - noteHeight, width: area.width, height: noteHeight } }),
  };
}

const EYEBROW_ENTER = 0.12;
const WORDS_START = 0.06;
const WORD_ENTER = 0.14;
/** Gap between word starts, at most; long headlines squeeze into `WORDS_SPAN`. */
const WORD_STEP = 0.04;
const WORDS_SPAN = 0.18;
/** The content starts this long after the last word does. */
const CONTENT_DELAY = 0.08;
const NOTE_DELAY = 0.12;
const NOTE_ENTER = 0.12;
const EXIT = 0.1;
/** How far a word rises, in em of the headline size. */
const WORD_RISE_EM = 0.4;

export interface SectionTiming {
  eyebrow: [number, number];
  /** [start, end] of each headline word's rise. */
  words: Array<[number, number]>;
  /** When the content starts; it plays out over the rest of the scene. */
  content: number;
  note: [number, number];
}

/** When each part enters, as fractions of the scene: eyebrow, headline words, content, note. */
export function sectionTiming(wordCount: number): SectionTiming {
  const step = wordCount > 1 ? Math.min(WORD_STEP, WORDS_SPAN / (wordCount - 1)) : 0;
  const words = Array.from({ length: wordCount }, (_, i): [number, number] => {
    const start = stagger(i, { start: WORDS_START, step });
    return [start, start + WORD_ENTER];
  });
  const content = (words.at(-1)?.[0] ?? WORDS_START) + CONTENT_DELAY;
  const noteStart = content + NOTE_DELAY;
  return { eyebrow: [0, EYEBROW_ENTER], words, content, note: [noteStart, noteStart + NOTE_ENTER] };
}

function nestedComponent(content: SectionContent) {
  if (typeof content !== "object" || content === null || typeof content.component !== "string") {
    throw new Error("Section: content must be { component, props }");
  }
  if (!Object.hasOwn(kit, content.component)) {
    throw new Error(`Section: unknown component "${content.component}" in content (kit has: ${Object.keys(kit).join(", ")})`);
  }
  return kit[content.component]!;
}

const at = (rect: Rect) => ({ position: "absolute" as const, left: rect.x, top: rect.y, width: rect.width, height: rect.height });

export function Section({ progress, theme, aspect, area, headline, eyebrow, content, contentWidth = "narrow", note }: SectionProps) {
  const layout = sectionLayout(theme, aspect, { headline, eyebrow, note }, contentWidth, area);
  const words = headline.trim().split(/\s+/).filter(Boolean);
  const timing = sectionTiming(words.length);
  const easing = themeEasing(theme);
  const fadeIn = ([start, end]: [number, number], curve = easing) => interpolate(progress, [start, end], [0, 1], { easing: curve });
  const Content = content === undefined ? undefined : nestedComponent(content);
  const contentProgress = interpolate(progress, [timing.content, 1], [0, 1]);
  const { colors, fonts, type } = theme;
  const headlineSpec = type[layout.headlineRole][aspect];
  const eyebrowSpec = type.eyebrow[aspect];
  const noteSpec = type.caption[aspect];
  const textStyle = (spec: TypeSpec) => ({
    margin: 0,
    fontSize: spec.size,
    fontWeight: spec.weight,
    letterSpacing: `${spec.tracking}em`,
    lineHeight: spec.lineHeight,
    overflowWrap: "break-word" as const,
  });

  // A full-frame layer, so nested components position in frame px like a scene.
  return (
    <div data-section="" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", opacity: interpolate(progress, [1 - EXIT, 1], [1, 0], { easing }) }}>
      {eyebrow !== undefined && layout.eyebrow !== undefined && (
        <p
          data-section-part="eyebrow"
          style={{
            ...at(layout.eyebrow),
            ...textStyle(eyebrowSpec),
            opacity: fadeIn(timing.eyebrow),
            fontFamily: fonts.body,
            textTransform: "uppercase",
            color: colors.textMuted,
          }}
        >
          {eyebrow}
        </p>
      )}
      <h1
        data-section-part="headline"
        style={{
          ...at(layout.headline),
          ...textStyle(headlineSpec),
          boxSizing: "border-box",
          padding: `${glyphPad(headlineSpec)}px 0`,
          fontFamily: fonts.display,
          color: headlineColor(theme),
        }}
      >
        {words.map((word, i) => {
          const shown = fadeIn(timing.words[i]!, expoOut);
          return (
            <Fragment key={i}>
              {i > 0 && " "}
              <span
                data-section-part="word"
                style={{
                  display: "inline-block",
                  maxWidth: "100%",
                  opacity: shown,
                  transform: `translateY(${(1 - shown) * WORD_RISE_EM * headlineSpec.size}px)`,
                }}
              >
                {word}
              </span>
            </Fragment>
          );
        })}
      </h1>
      {Content !== undefined && (
        <div data-section-part="content" style={{ display: "contents" }}>
          <Content {...content!.props} progress={contentProgress} theme={theme} aspect={aspect} area={layout.content} />
        </div>
      )}
      {note !== undefined && layout.note !== undefined && (
        <p
          data-section-part="note"
          style={{ ...at(layout.note), ...textStyle(noteSpec), opacity: fadeIn(timing.note), fontFamily: fonts.body, color: colors.textMuted }}
        >
          {note}
        </p>
      )}
    </div>
  );
}
