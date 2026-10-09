// The standard frame for explanatory scenes (design v2, section 4): an optional
// eyebrow, a headline, a content slot holding any other kit component, and an
// optional one-line note at the bottom. In 16:9 narrow content sits beside the
// headline and wide content below it; 9:16 always stacks. Stacked, the text is
// centered on the frame (design v3); beside, it keeps a left edge. The eyebrow
// fades in on the scene's lead, the headline rises word by word (`text.in`,
// see `HeadlineText`), the content plays its own entrance as the headline
// lands, and the note (the takeaway) arrives once the content has built.

import { contentArea, textColumn } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { glyphPad, textBoxHeight, typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { headlineColor } from "../theme/roles";
import type { Theme, TypeSpec } from "../theme/types";
import { MotionDelay, useSceneTime } from "./frameContext";
import { HeadlineText } from "./Headline";
import { headlineTiming, headlineWords, type HeadlineMotion, type MarkStyle } from "./headlineMotion";
import { kit } from "./index";
import { exitOpacity, fade } from "./motion";
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
  /** How the headline lands: word by word (the default), as a whole, or character by character. */
  headlineMotion?: HeadlineMotion;
  /** One or two words of the headline set in the accent. */
  emphasis?: string | string[];
  /** One word of the headline marked by a sweep of the accent once it has landed. */
  mark?: string;
  markStyle?: MarkStyle;
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
  const noteHeight = textBoxHeight(text.note, noteWidth, type.label[aspect]);
  const bodyHeight = text.note === undefined ? area.height : area.height - noteHeight - spacing.lg;
  const textWidth = arrangement === "beside" ? Math.floor((area.width - spacing.xxl) * TEXT_COLUMN_SHARE) : area.width;

  const eyebrowHeight = textBoxHeight(text.eyebrow, textWidth, type.eyebrow[aspect], EYEBROW_CHAR_EM);
  const eyebrowSpace = text.eyebrow === undefined ? 0 : eyebrowHeight + spacing.xs;
  const maxHeadline = arrangement === "beside" ? bodyHeight - eyebrowSpace : bodyHeight * MAX_STACKED_HEADLINE;
  const headlineAt = (role: SectionLayout["headlineRole"]) => textBoxHeight(text.headline, textWidth, type[role][aspect]);
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

export interface SectionTiming {
  /** When the eyebrow fades in, in ms from the scene's start. */
  eyebrow: number;
  /** When the headline starts to land. */
  headline: number;
  /** When each headline word starts to rise (all with the line in `whole`, each with its first character in `chars`). */
  words: number[];
  /** How long the content's clock is delayed: its own entrance starts as the headline lands. */
  content: number;
  /** When the note fades in: once the content has built (its cascade done), or a beat after the headline. */
  note: number;
}

export interface SectionTimingParts {
  eyebrow?: boolean;
  content?: boolean;
  /** How the headline lands. Default `words`. */
  motion?: HeadlineMotion;
}

/**
 * When each part enters, in ms: the eyebrow on the scene's lead, the headline
 * a line after it (by default word by word, `text.in`'s step apart, tighter
 * for long headlines so they land in about the first 1.2 s; see
 * `headlineTiming`), the content as the last word shows, and the note after
 * the content. `words` is the headline's words, or how many there are.
 */
export function sectionTiming(theme: Theme, words: number | readonly string[], parts: SectionTimingParts = {}): SectionTiming {
  const { leadMs, fx, cascadeMs, beat } = theme.motion;
  const textIn = theme.motion["text.in"];
  const first = leadMs + (parts.eyebrow === false ? 0 : textIn.lineStaggerMs);
  const list = typeof words === "number" ? Array.from({ length: words }, () => "") : words;
  const starts = headlineTiming(theme, list, first, parts.motion ?? "words").words;
  const lastWord = starts.at(-1) ?? first;
  const content = lastWord + fx.ms - leadMs;
  const note = parts.content === false ? lastWord + textIn.ms + beat.ms : content + cascadeMs;
  return { eyebrow: leadMs, headline: first, words: starts, content, note };
}

/** The kit component a layout's `content` names; `owner` names the layout in errors. */
export function nestedComponent(owner: string, content: SectionContent) {
  if (typeof content !== "object" || content === null || typeof content.component !== "string") {
    throw new Error(`${owner}: content must be { component, props }`);
  }
  if (!Object.hasOwn(kit, content.component)) {
    throw new Error(`${owner}: unknown component "${content.component}" in content (kit has: ${Object.keys(kit).join(", ")})`);
  }
  return kit[content.component]!;
}

/** Section marks each headline word as one of its parts. */
const WORD_PART = { "data-section-part": "word" } as const;

const at = (rect: Rect) => ({ position: "absolute" as const, left: rect.x, top: rect.y, width: rect.width, height: rect.height });

export function Section({ progress, theme, aspect, area, headline, eyebrow, content, contentWidth = "narrow", note, ...headlineProps }: SectionProps) {
  const { headlineMotion = "words", emphasis, mark, markStyle } = headlineProps;
  const layout = sectionLayout(theme, aspect, { headline, eyebrow, note }, contentWidth, area);
  const timing = sectionTiming(theme, headlineWords(headline), { eyebrow: eyebrow !== undefined, content: content !== undefined, motion: headlineMotion });
  const time = useSceneTime(progress);
  const { fx } = theme.motion;
  const textIn = theme.motion["text.in"];
  const Content = content === undefined ? undefined : nestedComponent("Section", content);
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
        <HeadlineText
          text={headline}
          theme={theme}
          spec={headlineSpec}
          time={time}
          start={timing.headline}
          motion={headlineMotion}
          emphasis={emphasis}
          mark={mark}
          markStyle={markStyle}
          wordAttributes={WORD_PART}
        />
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
