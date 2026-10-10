// The prompt card from the owner's reference: a white card with a small label
// (an icon chip and "Prompt") over the prompt itself. The card lifts in like
// any card (see `cardEntrance`); once it has landed, a caret blinks on the
// empty prompt and the prompt types in (design v3, life #10); as the last key
// lands a shine crosses the card once (life #9), and the caret keeps blinking.
// Not typed, it shows the prompt whole. A `shareId` carries the card across a
// boundary, such as the prompt typed in a hook into the next scene's handoff.
//
// One wide card on the frame's optical center, or centered in its slot; the
// prompt steps down the ramp (title to label) until the card fits.

import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { charsPerLine, estimateTextHeight } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Seed } from "../engine/random";
import { Icon } from "../icons";
import type { Aspect } from "../storyboard/types";
import { withAlpha } from "../theme/color";
import type { Theme, TypeRole, TypeSpec } from "../theme/types";
import { Caret } from "./Caret";
import { cardEntrance, liftShadow, maxCardWidth } from "./Card";
import { useSceneTime, type SceneTime } from "./frameContext";
import { arrive, exitOpacity, fitSequence } from "./motion";
import { Shine } from "./shine";
import type { KitProps } from "./types";
import { caretBlink, typedText, typingSpan, type TypingSpan } from "./typing";

export interface PromptCardProps extends KitProps {
  /** The prompt. */
  text: string;
  /** The small label above it. Default "Prompt". */
  label?: string;
  /** The label's icon (see `ICON_NAMES`). Default "chat". */
  icon?: string;
  /** Types the prompt in once the card has landed (the default); false shows it whole. */
  typed?: boolean;
  /** Pairs the card with one in the next or previous scene for a shared-element transition. */
  shareId?: string;
  /** Varies the typing rhythm; the same seed types the same way every time. Default 0. */
  seed?: Seed;
}

export interface PromptCardLayout {
  /** The card, in frame px. */
  box: Rect;
  /** The prompt's ramp step. */
  text: TypeSpec;
  /** The label's: `label`, semibold. */
  label: TypeSpec;
  /** Diameter of the label's icon chip. */
  chip: number;
  padding: number;
}

/** Steps to try for the prompt, largest first. */
const TEXT_ROLES: readonly TypeRole[] = ["title", "subtitle", "body", "label"];
/** In 16:9 the card takes up to this share of the content area's width (a prompt reads as one or two long lines). */
const WIDE_SHARE = 0.56;
/** Stands in for the caret when estimating the prompt's lines. */
const CARET_ROOM = "_";
/** The chip is this many label line heights across. */
const CHIP_LINES = 1.1;
/** Tint of the chip: the accent at this opacity (as a calm card's icon circle). */
const TINT_OPACITY = 0.14;

const longestWord = (text: string) => Math.max(0, ...text.split(/\s+/).map((word) => word.length));

/** Where the card goes inside `slot` (the content area by default) and the sizes it is set in. Pure. */
export function promptCardLayout(theme: Theme, aspect: Aspect, { text }: Pick<PromptCardProps, "text">, slot?: Rect): PromptCardLayout {
  const area = slot ?? contentArea(theme, aspect);
  const { spacing, hairline, weights, type } = theme;
  const width = aspect === "16:9" ? Math.min(area.width, Math.round(contentArea(theme, aspect).width * WIDE_SHARE)) : maxCardWidth(theme, aspect, area);
  const padding = aspect === "9:16" ? spacing.md : Math.round(spacing.md * 0.8);
  const label = { ...type.label[aspect], weight: weights.semibold };
  const chip = Math.round(label.size * label.lineHeight * CHIP_LINES);
  const inner = width - 2 * (padding + hairline);
  const heightAt = (spec: TypeSpec) => Math.ceil(2 * (padding + hairline) + chip + spacing.xs + estimateTextHeight(text + CARET_ROOM, inner, spec));
  const fits = (spec: TypeSpec) => heightAt(spec) <= area.height && charsPerLine(inner, spec.size) >= longestWord(text);
  const specs = TEXT_ROLES.map((role) => type[role][aspect]);
  const spec = specs.find(fits) ?? specs.at(-1)!;
  const box = placeBlock(area, { width, height: heightAt(spec) }, blockCenterY(theme, aspect, slot));
  return { box, text: spec, label, chip, padding };
}

export interface PromptCardTiming {
  /** The prompt typing in, in ms from the scene's start: its caret shows once the card has landed. */
  typing: TypingSpan;
  /** When the shine sets off: as the last key lands. */
  shine: number;
}

/** When the prompt types and the card shines; given the scene's time, typing that would run into the exit speeds up. */
export function promptCardTiming(theme: Theme, text: string, time?: SceneTime, seed: Seed = 0): PromptCardTiming {
  const { leadMs, enter } = theme.motion;
  const start = leadMs + enter.ms;
  const natural = typingSpan(theme, text, start, seed);
  const pace = time === undefined ? 1 : fitSequence(theme, time, start, natural.end, enter.ms);
  const typing = pace === 1 ? natural : typingSpan(theme, text, start, seed, pace);
  return { typing, shine: typing.end };
}

export function PromptCard({ progress, theme, aspect, area: slot, text, label = "Prompt", icon = "chat", typed = true, shareId, seed = 0 }: PromptCardProps) {
  const area = slot ?? contentArea(theme, aspect);
  const layout = promptCardLayout(theme, aspect, { text }, slot);
  const { box, padding, chip } = layout;
  const { colors, fonts, spacing, radius, hairline } = theme;
  const time = useSceneTime(progress);
  const { ms } = time;
  const { leadMs, enter } = theme.motion;
  const entrance = cardEntrance(arrive(theme, ms, leadMs), theme);
  const timing = promptCardTiming(theme, text, time, seed);
  const { typing } = timing;
  const shown = typed ? typedText(text, typing, ms) : text;
  // The caret blinks on the empty prompt, holds solid while keys land, and blinks again once it is typed.
  const caretOn = ms >= typing.start;
  const caret = !caretOn ? 0 : ms >= typing.typeStart && ms < typing.end && typed ? 1 : caretBlink(theme, ms - (ms < typing.typeStart ? typing.start : typing.end));
  const shineMs = typed ? ms - timing.shine : ms - (leadMs + enter.ms);

  return (
    <div style={{ position: "absolute", left: area.x, top: area.y, width: area.width, height: area.height, opacity: exitOpacity(theme, time, enter.ms) }}>
      <div
        data-block="PromptCard"
        {...(shareId === undefined ? {} : { "data-share-id": shareId })}
        style={{
          position: "absolute",
          left: box.x - area.x,
          top: box.y - area.y,
          width: box.width,
          height: box.height,
          boxSizing: "border-box",
          padding,
          backgroundColor: colors.surface,
          border: `${hairline}px solid ${colors.border}`,
          borderRadius: radius.md,
          boxShadow: liftShadow(theme, entrance.lift),
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: spacing.xs,
          ...entrance.style,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
          <div
            style={{
              flex: "none",
              width: chip,
              height: chip,
              borderRadius: "50%",
              backgroundColor: withAlpha(colors.accent, TINT_OPACITY),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={icon} size={Math.round(chip * 0.55)} color={colors.accent} />
          </div>
          <div data-prompt-label="" style={{ color: colors.textMuted, fontFamily: fonts.body, ...typeCss(layout.label) }}>
            {label}
          </div>
        </div>
        <div style={{ color: colors.text, fontFamily: fonts.body, ...typeCss(layout.text), overflowWrap: "break-word" }}>
          <span data-prompt-text="">{shown}</span>
          {caretOn && <Caret theme={theme} shape="bar" opacity={Math.round(caret * 1000) / 1000} marker={{ "data-prompt-caret": "" }} />}
        </div>
        {shineMs >= 0 && <Shine theme={theme} size={{ width: box.width, height: box.height }} elapsedMs={shineMs} radius={radius.md} />}
      </div>
    </div>
  );
}
