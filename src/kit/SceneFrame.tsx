// The scene frame from the owner's reference (design v3): every content scene
// carries the same header in the same place, a grey eyebrow and a bold
// headline centered at the top, its content block centered in the room below,
// and a takeaway footer centered at the bottom. The same in 9:16 and 16:9
// (unlike Section, which sets narrow content beside its headline in 16:9).
// The header lands first, the eyebrow then the headline (as a whole by
// default; see `HeadlineText`); the content plays its own entrance as the
// headline lands; the footer lands once the content has built.

import { contentArea, textColumn } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { glyphPad, textBoxHeight, typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { headlineColor } from "../theme/roles";
import type { Theme, TypeSpec } from "../theme/types";
import { MotionDelay, useSceneTime } from "./frameContext";
import { HeadlineText } from "./Headline";
import { headlineWords, linePose, wordLeaving, type HeadlineMotion, type MarkStyle } from "./headlineMotion";
import { exitOpacity } from "./motion";
import { nestedComponent, sectionTiming, type SectionContent } from "./Section";
import type { KitProps } from "./types";

export interface SceneFrameProps extends KitProps {
  headline: string;
  /** A short grey line above the headline, in sentence case. */
  eyebrow?: string;
  /** The component in the content block. */
  content?: SectionContent;
  /** The takeaway: one line at the bottom, after the content has built. */
  footer?: string;
  /** How the headline lands: as a whole (the default), word by word, or character by character. */
  headlineMotion?: HeadlineMotion;
  /** One or two words of the headline set in the accent. */
  emphasis?: string | string[];
  /** One word of the headline marked by a sweep of the accent once it has landed. */
  mark?: string;
  markStyle?: MarkStyle;
}

export interface SceneFrameText {
  eyebrow?: string;
  headline: string;
  footer?: string;
}

export interface SceneFrameLayout {
  /** The ramp step the headline is set in: `title` when `headline` would crowd out the content. */
  headlineRole: "headline" | "title";
  eyebrow?: Rect;
  headline: Rect;
  /** The content block's slot, passed to the nested component as its `area`. */
  content: Rect;
  footer?: Rect;
}

/** Headline steps to try, largest first. */
const HEADLINE_ROLES = ["headline", "title"] as const;
/** The header may take at most this share of the room above the footer. */
const MAX_HEADER_SHARE = 0.4;

/** The eyebrow and footer: the `label` step, semibold (the reference's grey eyebrow and takeaway line). */
export function frameLineSpec(theme: Theme, aspect: Aspect): TypeSpec {
  return { ...theme.type.label[aspect], weight: theme.weights.semibold };
}

/**
 * Where each part goes, in frame px, inside `area` (the content area by
 * default): the header across the top, at the same place on every scene; the
 * footer at the bottom, no wider than the text column; the content in the room
 * between. A headline too tall for the header steps down to `title`; if even
 * that does not fit, it overflows visibly and the layer-1 checks report it.
 */
export function sceneFrameLayout(theme: Theme, aspect: Aspect, text: SceneFrameText, area: Rect = contentArea(theme, aspect)): SceneFrameLayout {
  const { spacing, type } = theme;
  const line = frameLineSpec(theme, aspect);
  const footerWidth = Math.min(area.width, textColumn(theme, aspect).width);
  const footerHeight = textBoxHeight(text.footer, footerWidth, line);
  const bottom = area.y + area.height - (text.footer === undefined ? 0 : footerHeight + spacing.lg);

  const eyebrowHeight = textBoxHeight(text.eyebrow, area.width, line);
  const top = area.y + (text.eyebrow === undefined ? 0 : eyebrowHeight + spacing.xs);
  const headlineAt = (role: SceneFrameLayout["headlineRole"]) => textBoxHeight(text.headline, area.width, type[role][aspect]);
  const headlineRole = HEADLINE_ROLES.find((role) => headlineAt(role) <= (bottom - area.y) * MAX_HEADER_SHARE) ?? HEADLINE_ROLES.at(-1)!;
  const headline = { x: area.x, y: top, width: area.width, height: headlineAt(headlineRole) };
  const contentY = headline.y + headline.height + spacing.lg;

  return {
    headlineRole,
    ...(text.eyebrow !== undefined && { eyebrow: { x: area.x, y: area.y, width: area.width, height: eyebrowHeight } }),
    headline,
    content: { x: area.x, y: contentY, width: area.width, height: Math.max(0, bottom - contentY) },
    ...(text.footer !== undefined && {
      footer: { x: area.x + (area.width - footerWidth) / 2, y: area.y + area.height - footerHeight, width: footerWidth, height: footerHeight },
    }),
  };
}

export interface SceneFrameTiming {
  /** When the eyebrow lands, in ms from the scene's start: on the scene's lead. */
  eyebrow: number;
  /** When the headline starts to land: a line after the eyebrow. */
  headline: number;
  /** How long the content's clock is delayed: its own entrance starts as the headline lands. */
  content: number;
  /** When the footer lands: once the content has built (its cascade done), or a beat after the headline. */
  footer: number;
}

/** When each part lands, in ms (the same choreography as `sectionTiming`, the headline landing whole by default). */
export function sceneFrameTiming(
  theme: Theme,
  words: readonly string[],
  parts: { eyebrow?: boolean; content?: boolean; motion?: HeadlineMotion } = {},
): SceneFrameTiming {
  const timing = sectionTiming(theme, words, { ...parts, motion: parts.motion ?? "whole" });
  return { eyebrow: timing.eyebrow, headline: timing.headline, content: timing.content, footer: timing.note };
}

const at = (rect: Rect) => ({ position: "absolute" as const, left: rect.x, top: rect.y, width: rect.width, height: rect.height });

export function SceneFrame({ progress, theme, aspect, area, headline, eyebrow, content, footer, headlineMotion = "whole", emphasis, mark, markStyle }: SceneFrameProps) {
  const layout = sceneFrameLayout(theme, aspect, { eyebrow, headline, footer }, area);
  const timing = sceneFrameTiming(theme, headlineWords(headline), { eyebrow: eyebrow !== undefined, content: content !== undefined, motion: headlineMotion });
  const time = useSceneTime(progress);
  const Content = content === undefined ? undefined : nestedComponent("SceneFrame", content);
  const { colors, fonts, type } = theme;
  const headlineSpec = type[layout.headlineRole][aspect];
  const lineSpec = frameLineSpec(theme, aspect);
  const leaving = wordLeaving(theme, 0, 1, time.leftMs);
  // Each part keeps its glyphs inside its box (see `glyphPad`), centered on the frame.
  const textStyle = (spec: TypeSpec) => ({
    margin: 0,
    boxSizing: "border-box" as const,
    padding: `${glyphPad(spec)}px 0`,
    ...typeCss(spec),
    overflowWrap: "break-word" as const,
    textAlign: "center" as const,
  });
  // The eyebrow and footer land as whole lines, like the headline.
  const lands = (spec: TypeSpec, start: number) => {
    const pose = linePose(theme, spec.size * spec.lineHeight, time.ms - start, leaving);
    return { opacity: pose.opacity, transform: `translateY(${pose.y}px)` };
  };

  // A full-frame layer, so nested components position in frame px like a scene.
  return (
    <div data-scene-frame="" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", opacity: exitOpacity(theme, time, theme.motion["text.in"].ms) }}>
      {eyebrow !== undefined && layout.eyebrow !== undefined && (
        <p data-frame-part="eyebrow" style={{ ...at(layout.eyebrow), ...textStyle(lineSpec), ...lands(lineSpec, timing.eyebrow), fontFamily: fonts.body, color: colors.textMuted }}>
          {eyebrow}
        </p>
      )}
      <h1 data-frame-part="headline" style={{ ...at(layout.headline), ...textStyle(headlineSpec), fontFamily: fonts.display, color: headlineColor(theme), textWrap: "balance" }}>
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
        />
      </h1>
      {Content !== undefined && (
        <div data-frame-part="content" style={{ display: "contents" }}>
          <MotionDelay ms={timing.content}>
            <Content {...content!.props} progress={progress} theme={theme} aspect={aspect} area={layout.content} />
          </MotionDelay>
        </div>
      )}
      {footer !== undefined && layout.footer !== undefined && (
        <p data-frame-part="footer" style={{ ...at(layout.footer), ...textStyle(lineSpec), ...lands(lineSpec, timing.footer), fontFamily: fonts.body, color: colors.text }}>
          {footer}
        </p>
      )}
    </div>
  );
}
