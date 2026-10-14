// ExtrudedTitle, ported from HyperFrames `extruded-logo` (pinned 2905162):
// beveled 3D letters flip up one by one, the word swings so the studio light
// runs across the bevels, then settles face-on and readable for the hold. The
// 3D opener and end-card title.
//
// Each letter is Geist Bold extruded about 0.35 of its cap height, beveled,
// in the finish's material (matte, glossy or chrome) in the ink, the
// `accentLetters` in the accent; a soft contact shadow lies under the word
// (see `extrudedTitleScene.ts`). The word is sized and placed per aspect and
// filmed from a little above and to the left, so the letters' tops and sides
// show the depth while the face keeps its laid-out size (see
// `extrudedTitlePlan.ts`). A `subtitle` is a flat line of HTML under it.
//
// Timing (scene clock): the first letter flips up on the lead (150 ms), the
// rest 70 ms apart (tighter for a long word); the word, turned 25 degrees,
// swings face-on by 1.6 s and then sways under 2 degrees through the hold; the
// subtitle rises in as the word settles; the whole fades out fast onto the
// last frame. The DOM carries the flip and the swing (`data-title-flip`,
// `data-title-swing`), so markup-level timing checks see the entrance; the
// letters are one `ThreeKey` read as 3D text, so the frame checks see the word.

import { entering, useSceneTime } from "./frameContext";
import { extrudedTitleErrors, extrudedTitleLayout, FLIP_START_MS, letterPose, SETTLE_MS, SUBTITLE_START_MS, titleCamera, wordPose, type ExtrudedFinish, type ExtrudedTitleLayout } from "./extrudedTitlePlan";
import { buildExtrudedTitleScene, poseExtrudedTitle, type ExtrudedTitleScene } from "./extrudedTitleScene";
import { arrive, exitOpacity, fade } from "./motion";
import { ThreeStage, type ThreeBuilt, type ThreeContext } from "./three/ThreeStage";
import type { KitProps } from "./types";
import { typeCss } from "../layout/type";

export interface ExtrudedTitleProps extends KitProps {
  /** The word, 1-24 characters on one line (basic Latin letters, digits and punctuation). */
  text: string;
  /** The letters' material. Default "glossy". */
  finish?: ExtrudedFinish;
  /** A flat line under the word, fading in once it settles. */
  subtitle?: string;
  /** Indices into `text` of letters drawn in the accent. Default none. */
  accentLetters?: number[];
}

/** How far the subtitle rises as it arrives, in multiples of the theme's small spacing. */
const SUBTITLE_RISE = 1;

export function ExtrudedTitle(props: ExtrudedTitleProps) {
  const errors = extrudedTitleErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`ExtrudedTitle: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, text, finish = "glossy", subtitle, accentLetters = [] } = props;
  const layout = extrudedTitleLayout(theme, aspect, text, subtitle, slot);
  const { root, stage } = layout;
  const time = useSceneTime(progress);
  const { ms } = entering(time);
  const count = layout.letters.length;
  const flip = layout.letters.reduce((sum, _, i) => sum + letterPose(ms, i, count).done, 0) / count;
  const swing = wordPose(ms).done;
  const opacity = fade(theme.motion.fx, ms - FLIP_START_MS) * exitOpacity(theme, time, SETTLE_MS - FLIP_START_MS);
  const sub = arrive(theme, ms, SUBTITLE_START_MS);
  const { colors, fonts, type, spacing } = theme;

  const build = (): ThreeBuilt<{ built: ExtrudedTitleScene; layout: ExtrudedTitleLayout }> => {
    const built = buildExtrudedTitleScene(theme, layout, finish, accentLetters);
    return {
      scene: built.scene,
      camera: titleCamera(layout),
      keys: [{ label: "3D title", object: built.glyphs, text, color: colors.text }],
      state: { built, layout },
    };
  };
  // `now` is the stage's own scene ms; the entrance runs on `entering` (a settled opening runs ahead).
  const update = (ctx: ThreeContext<{ built: ExtrudedTitleScene; layout: ExtrudedTitleLayout }>, now: number) => {
    poseExtrudedTitle(ctx.state!.built, now + (ms - time.ms));
  };

  return (
    <div
      data-extruded-title=""
      data-title-flip={flip.toFixed(4)}
      data-title-swing={swing.toFixed(4)}
      style={{ position: "absolute", left: root.x, top: root.y, width: root.width, height: root.height, opacity }}
    >
      <ThreeStage
        area={{ x: stage.x - root.x, y: stage.y - root.y, width: stage.width, height: stage.height }}
        aspect={aspect}
        progress={progress}
        build={build}
        update={update}
        environment="studio"
        label="ExtrudedTitle"
      />
      {subtitle !== undefined && layout.subtitle !== undefined && (
        <p
          data-title-subtitle=""
          style={{
            position: "absolute",
            left: layout.subtitle.x - root.x,
            top: layout.subtitle.y - root.y,
            width: layout.subtitle.width,
            margin: 0,
            textAlign: "center",
            fontFamily: fonts.body,
            ...typeCss(type.subtitle[aspect]),
            color: colors.textMuted,
            overflowWrap: "break-word",
            textWrap: "balance",
            opacity: sub.opacity,
            transform: `translateY(${((1 - sub.move) * spacing.sm * SUBTITLE_RISE).toFixed(2)}px)`,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
