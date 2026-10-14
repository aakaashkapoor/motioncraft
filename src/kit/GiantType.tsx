// One huge word that fills the frame edge to edge, the poster-scale title of
// a motion reel: set in the display face at its heaviest (or leaning, or in
// the display serif), its letters rising through a mask, tilting in and
// settling, scaling down out of a blur, or typed behind a hard cursor. An
// accent rule can draw under it, with a small mono kicker and an italic serif
// tag below; another kit component (`behind`) can sit in front of the word,
// overlapping the type. Letters are placed from measured metrics
// (`giantTypeFaces.ts`), so the word's width is exact and it never wraps.

import { SERIF_FAMILY } from "../render/fontFaces";
import { frameSize } from "../layout/frame";
import { contentArea } from "../layout/caption";
import { TEXT_PIECES_ATTRIBUTE, TYPE_FIT_ATTRIBUTE, typeCss } from "../layout/type";
import { entering, useSceneTime } from "./frameContext";
import { detailsTiming, giantTypeEntrance, giantTypeErrors, giantTypeLayout, letterOrigins, typeCursor, type GiantEntrance, type GiantStyle } from "./giantTypePlan";
import { exitOpacity, fade, tween } from "./motion";
import { nestedComponent, type SectionContent } from "./Section";
import type { KitProps } from "./types";

export interface GiantTypeProps extends KitProps {
  /** One word, or two short words: 1-12 characters. */
  text: string;
  /** `heavy` (default): the display face at its heaviest, tight. `italic`: heavy, leaning. `serif`: the display serif. */
  style?: GiantStyle;
  /** How the letters arrive. Default `rise`. */
  entrance?: GiantEntrance;
  /** A thin accent rule under the word that draws left to right. */
  rule?: boolean;
  /** A small mono uppercase line under the rule, up to 32 characters. */
  kicker?: string;
  /** A small italic serif line, right-aligned, up to 24 characters. */
  tag?: string;
  /** A kit component drawn in front of the word, overlapping it. */
  behind?: SectionContent;
}

/** The cursor's width and its gap after the last letter, em; it spans the ink's height. */
const CURSOR_EM = 0.07;
const CURSOR_GAP_EM = 0.05;
/** The word's entry, for the exit's length. */
const ENTRY_MS = 650;

const r2 = (n: number) => Math.round(n * 100) / 100 || 0;

export function GiantType(props: GiantTypeProps) {
  const errors = giantTypeErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`GiantType: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, text, style = "heavy", entrance = "rise", rule = false, kicker, tag, behind } = props;
  const Behind = behind === undefined ? undefined : nestedComponent("GiantType", behind);
  const { colors, fonts, spacing, motion } = theme;
  const layout = giantTypeLayout(theme, aspect, { text, style, rule, kicker, tag }, slot);
  const { box, size, word } = layout;
  const time = useSceneTime(progress);
  const { ms } = entering(time);
  const chars = [...text];
  const n = chars.length;
  const origins = letterOrigins(layout);
  const details = detailsTiming(theme, entrance, n);
  const pad = r2(layout.clipPad * size);

  // `scale` moves the word as one; the other entrances move each letter.
  const whole = entrance === "scale" ? giantTypeEntrance(theme, "scale", 0, n, ms) : undefined;
  const glyphBaseline = r2(layout.baseline - layout.lineTop);
  // The mask clips the rise at the foot of the ink; to the sides it reaches past every letter's text box.
  const side = r2(size);
  const offsetX = entrance === "rise" ? side : 0;
  const offsetY = entrance === "rise" ? pad : 0;

  const letters = word.letters.map((letter, i) => {
    if (letter.char === " ") return null;
    const pose = whole === undefined ? giantTypeEntrance(theme, entrance, i, n, ms) : undefined;
    const transforms: string[] = [];
    if (pose !== undefined && pose.drop !== 0) {
      // `rise` drops by mask heights; `tilt` by em.
      const px = entrance === "rise" ? pose.drop * (layout.inkHeight + 2 * pad) : pose.drop * size;
      transforms.push(`translateY(${r2(px)}px)`);
    }
    if (pose !== undefined && pose.rotate !== 0) transforms.push(`rotate(${pose.rotate}deg)`);
    if (layout.skewDeg !== 0) transforms.push(`skewX(${-layout.skewDeg}deg)`);
    const middle = r2(((letter.left + letter.right) / 2 - letter.x) * size);
    return (
      <span
        key={i}
        data-gianttype-letter={i}
        style={{
          position: "absolute",
          left: r2(origins[i]! + offsetX),
          top: r2(layout.lineTop + offsetY),
          height: layout.lineHeight,
          lineHeight: `${layout.lineHeight}px`,
          ...(pose !== undefined && pose.opacity !== 1 && { opacity: pose.opacity }),
          ...(transforms.length > 0 && { transform: transforms.join(" "), transformOrigin: `${middle}px ${glyphBaseline}px` }),
        }}
      >
        {letter.char}
      </span>
    );
  });

  const cursor = entrance === "type" ? typeCursor(theme, n, ms) : undefined;
  const cursorEl =
    cursor?.shown === true ? (
      <span
        data-gianttype-cursor=""
        style={{
          position: "absolute",
          left: r2((cursor.after < 0 ? 0 : (word.letters[cursor.after]!.right - word.left + CURSOR_GAP_EM) * size)),
          top: 0,
          width: r2(CURSOR_EM * size),
          height: layout.inkHeight,
          backgroundColor: colors.text,
        }}
      />
    ) : null;

  const face = layout.face;
  const wordEl = (
    <div
      data-block="GiantType"
      data-gianttype-word=""
      // Sized to fill its width, not set on a ramp step.
      {...{ [TEXT_PIECES_ATTRIBUTE]: "", [TYPE_FIT_ATTRIBUTE]: "" }}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: layout.inkWidth,
        height: layout.inkHeight,
        zIndex: 1,
        fontFamily: `"${face.family}", ${face.key === "serif" ? "serif" : "sans-serif"}`,
        fontWeight: face.weight,
        fontSize: size,
        fontKerning: "normal",
        whiteSpace: "pre",
        color: colors.text,
        ...(whole !== undefined && {
          opacity: whole.opacity,
          ...(whole.scale !== 1 && { transform: `scale(${whole.scale})` }),
          ...(whole.blur > 0 && { filter: `blur(${r2(whole.blur * size)}px)` }),
        }),
      }}
    >
      {entrance === "rise" ? (
        // Letters rise from under the mask: a box as big as the ink, padded so nothing at rest is cut.
        <div data-gianttype-mask="" style={{ position: "absolute", left: -side, top: -pad, width: r2(layout.inkWidth + 2 * side), height: r2(layout.inkHeight + 2 * pad), overflow: "hidden" }}>
          {letters}
        </div>
      ) : (
        letters
      )}
      {cursorEl}
    </div>
  );

  const rows = (start: number) => ({ opacity: r2(fade(motion.fx, ms - start)), transform: `translateY(${r2((1 - tween(motion.fx, ms - start)) * spacing.xs)}px)` });
  const frame = frameSize(aspect);
  const behindArea = slot ?? contentArea(theme, aspect);

  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height, opacity: r2(exitOpacity(theme, time, ENTRY_MS)) }}>
      {wordEl}
      {layout.rule !== undefined && (
        <div
          data-gianttype-rule=""
          style={{
            position: "absolute",
            left: layout.rule.x,
            top: layout.rule.y,
            width: layout.rule.width,
            height: layout.rule.height,
            backgroundColor: colors.accent,
            transformOrigin: "left center",
            transform: `scaleX(${r2(tween(motion.mark, ms - details.rule))})`,
          }}
        />
      )}
      {kicker !== undefined && layout.kickerTop !== undefined && (
        <div
          data-gianttype-kicker=""
          style={{
            position: "absolute",
            left: 0,
            top: layout.kickerTop,
            fontFamily: fonts.mono,
            ...typeCss(layout.kickerSpec),
            textTransform: "uppercase",
            whiteSpace: "pre",
            color: colors.textMuted,
            ...rows(details.rows),
          }}
        >
          {kicker}
        </div>
      )}
      {tag !== undefined && layout.tagTop !== undefined && (
        <div
          data-gianttype-tag=""
          style={{
            position: "absolute",
            right: 0,
            top: layout.tagTop,
            fontFamily: `"${SERIF_FAMILY}", serif`,
            fontStyle: "italic",
            ...typeCss(layout.tagSpec),
            whiteSpace: "pre",
            color: colors.text,
            ...rows(details.rows),
          }}
        >
          {tag}
        </div>
      )}
      {Behind !== undefined && (
        // In frame px, like a scene's main block, drawn after (and above) the word.
        <div data-gianttype-behind="" style={{ position: "absolute", left: -box.x, top: -box.y, width: frame.width, height: frame.height, zIndex: 2, pointerEvents: "none" }}>
          <Behind {...(behind!.props ?? {})} progress={progress} theme={theme} aspect={aspect} area={behindArea} />
        </div>
      )}
    </div>
  );
}
