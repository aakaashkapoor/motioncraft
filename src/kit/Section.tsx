// The standard frame for explanatory scenes (design v2, section 4): an optional
// eyebrow, a headline, a content slot holding any other kit component, and an
// optional one-line note at the bottom. In 16:9 narrow content sits beside the
// headline and wide content below it; 9:16 always stacks. Stacked, the text is
// centered on the frame (design v3); beside, it keeps a left edge. The eyebrow
// fades in on the scene's lead, the headline rises word by word (`text.in`),
// the content plays its own entrance as the headline lands, and the note (the
// takeaway) arrives once the content has built.

import { Fragment } from "react";
import { stagger } from "../engine/choreography";
import { contentArea, textColumn } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { headlineColor } from "../theme/roles";
import type { Theme, TypeSpec } from "../theme/types";
import { MotionDelay, useSceneTime } from "./frameContext";
import { kit } from "./index";
import { cascadeStep, exitOpacity, fade, tween } from "./motion";
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
/** Height of a glyph box in em. A tighter line height is shorter, so glyphs poke out of the line box. */
const GLYPH_BOX_EM = 1.4;

/** Room in px kept above and below tightly set text so its glyphs stay inside its box. */
export function glyphPad(spec: TypeSpec): number {
  return Math.ceil(Math.max(0, (GLYPH_BOX_EM - spec.lineHeight) / 2) * spec.size);
}

/** Height of `text` set in `spec` with its glyph padding above and below; 0 without text. */
const height = (text: string | undefined, width: number, spec: TypeSpec, charEm?: number): number =>
  text === undefined ? 0 : estimateTextHeight(text, width, { size: spec.size, lineHeight: spec.lineHeight, charEm }) + 2 * glyphPad(spec);

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

  // The note sits low in the frame: no wider than the text column, so it stays off the right rail.
  const noteWidth = Math.min(area.width, textColumn(theme, aspect).width);
  const noteHeight = height(text.note, noteWidth, type.label[aspect]);
  const bodyHeight = text.note === undefined ? area.height : area.height - noteHeight - spacing.lg;
  const textWidth = arrangement === "beside" ? Math.floor((area.width - spacing.xxl) * TEXT_COLUMN_SHARE) : area.width;

  const eyebrowHeight = height(text.eyebrow, textWidth, type.eyebrow[aspect], EYEBROW_CHAR_EM);
  const eyebrowSpace = text.eyebrow === undefined ? 0 : eyebrowHeight + spacing.xs;
  const maxHeadline = arrangement === "beside" ? bodyHeight - eyebrowSpace : bodyHeight * MAX_STACKED_HEADLINE;
  const headlineAt = (role: SectionLayout["headlineRole"]) => height(text.headline, textWidth, type[role][aspect]);
  const headlineRole = HEADLINE_ROLES.find((role) => headlineAt(role) <= maxHeadline) ?? HEADLINE_ROLES.at(-1)!;
  const headlineHeight = headlineAt(headlineRole);

  // Beside, the text block centers on the content; stacked, it starts at the top.
  const top = arrangement === "beside" ? area.y + Math.max(0, (bodyHeight - eyebrowSpace - headlineHeight) / 2) : area.y;
  const headline = { x: area.x, y: top + eyebrowSpace, width: textWidth, height: headlineHeight };
  let content: Rect;
  if (arrangement === "beside") {
    const x = area.x + textWidth + spacing.xxl;
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
    ...(text.note !== undefined && {
      note: { x: area.x + (area.width - noteWidth) / 2, y: area.y + area.height - noteHeight, width: noteWidth, height: noteHeight },
    }),
  };
}

/** How far a word rises, in em of the headline size. */
const WORD_RISE_EM = 0.4;

export interface SectionTiming {
  /** When the eyebrow fades in, in ms from the scene's start. */
  eyebrow: number;
  /** When each headline word starts its `text.in` rise. */
  words: number[];
  /** How long the content's clock is delayed: its own entrance starts as the headline lands. */
  content: number;
  /** When the note fades in: once the content has built (its cascade done), or a beat after the headline. */
  note: number;
}

/**
 * When each part enters, in ms: the eyebrow on the scene's lead, the words a
 * line after it and `text.in`'s word step apart (tighter for long headlines,
 * so they land in about the first 1.2 s), the content as the last word
 * shows, and the note after the content.
 */
export function sectionTiming(theme: Theme, wordCount: number, parts: { eyebrow?: boolean; content?: boolean } = {}): SectionTiming {
  const { leadMs, fx, cascadeMs, beat } = theme.motion;
  const textIn = theme.motion["text.in"];
  const first = leadMs + (parts.eyebrow === false ? 0 : textIn.lineStaggerMs);
  const step = cascadeStep(theme, wordCount, textIn);
  const words = Array.from({ length: wordCount }, (_, i) => stagger(i, { start: first, step }));
  const lastWord = words.at(-1) ?? first;
  const content = lastWord + fx.ms - leadMs;
  const note = parts.content === false ? lastWord + textIn.ms + beat.ms : content + cascadeMs;
  return { eyebrow: leadMs, words, content, note };
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
  const timing = sectionTiming(theme, words.length, { eyebrow: eyebrow !== undefined, content: content !== undefined });
  const time = useSceneTime(progress);
  const { fx } = theme.motion;
  const textIn = theme.motion["text.in"];
  const Content = content === undefined ? undefined : nestedComponent(content);
  const { colors, fonts, type } = theme;
  const headlineSpec = type[layout.headlineRole][aspect];
  const eyebrowSpec = type.eyebrow[aspect];
  const noteSpec = type.label[aspect];
  const centered = layout.arrangement === "below";
  // Each part keeps its glyph padding inside its box (see `glyphPad`).
  const textStyle = (spec: TypeSpec) => ({
    margin: 0,
    boxSizing: "border-box" as const,
    padding: `${glyphPad(spec)}px 0`,
    ...typeCss(spec),
    overflowWrap: "break-word" as const,
    ...(centered && { textAlign: "center" as const }),
  });

  // A full-frame layer, so nested components position in frame px like a scene.
  return (
    <div data-section="" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", opacity: exitOpacity(theme, time, textIn.ms) }}>
      {eyebrow !== undefined && layout.eyebrow !== undefined && (
        <p
          data-section-part="eyebrow"
          style={{
            ...at(layout.eyebrow),
            ...textStyle(eyebrowSpec),
            opacity: fade(fx, time.ms - timing.eyebrow),
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
          fontFamily: fonts.display,
          color: headlineColor(theme),
          textWrap: "balance",
        }}
      >
        {words.map((word, i) => {
          const since = time.ms - timing.words[i]!;
          const rise = Math.round((1 - tween(textIn, since)) * WORD_RISE_EM * headlineSpec.size * 100) / 100;
          return (
            <Fragment key={i}>
              {i > 0 && " "}
              <span
                data-section-part="word"
                style={{
                  display: "inline-block",
                  maxWidth: "100%",
                  opacity: fade(fx, since),
                  transform: `translateY(${rise}px)`,
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
          <MotionDelay ms={timing.content}>
            <Content {...content!.props} progress={progress} theme={theme} aspect={aspect} area={layout.content} />
          </MotionDelay>
        </div>
      )}
      {note !== undefined && layout.note !== undefined && (
        <p
          data-section-part="note"
          style={{ ...at(layout.note), ...textStyle(noteSpec), opacity: fade(fx, time.ms - timing.note), fontFamily: fonts.body, color: colors.textMuted }}
        >
          {note}
        </p>
      )}
    </div>
  );
}
