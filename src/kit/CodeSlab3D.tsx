// CodeSlab3D, ported from HyperFrames `code-3d-extrude` (pinned 2905162):
// syntax-highlighted code on a beveled 3D slab that rises from below and
// behind, tilted, turns through space under the studio lights and settles
// face-on and readable, then holds with a slow parallax drift. The hero shot
// for developer videos.
//
// The slab is an extruded rounded rect in the theme's surface (see
// `codeSlab3dScene.ts`), its face the code painted with the existing
// highlighter, the theme's syntax colours and mono font at 2x onto a canvas
// texture, once the fonts are loaded. With a `title` the face has a filename
// tab. The settled face is filmed at its painted size, so the code is at the
// ramp's mono step (see `codeSlab3dPlan.ts`).
//
// Timing (scene clock): the slab sets off on the lead (150 ms) and settles at
// 1.6 s (an ease-out, the source's power3.out); the highlighted lines' accent
// bands sweep in from the left as it settles, done by about 2.3 s; it holds
// with a drift under 2 degrees; the whole fades out fast onto the last frame.
// The DOM carries the entrance and the bands (`data-slab`,
// `data-slab-bands`), so markup-level timing checks see them; the slab and
// each painted line are `ThreeKey`s, so the frame checks see where they are.

import { entering, useSceneTime } from "./frameContext";
import { bandSweeps, codeLines, codeSlab3DErrors, codeSlabLayout, slabCamera, slabPose, slabTokens, SLAB_SETTLE_MS, SLAB_START_MS, type CodeSlabLayout } from "./codeSlab3dPlan";
import { buildCodeSlabScene, poseCodeSlab, type CodeSlabScene } from "./codeSlab3dScene";
import { exitOpacity, fade } from "./motion";
import { ThreeStage, type ThreeBuilt, type ThreeContext } from "./three/ThreeStage";
import { useThreeAsset } from "./three/useThreeAsset";
import type { KitProps } from "./types";
import type { Theme } from "../theme/types";
import type { Aspect } from "../storyboard/types";

export interface CodeSlab3DProps extends KitProps {
  /** The code, 1-14 lines. */
  code: string;
  /** A Prism language name or short name, e.g. "ts", "python", "sh". Default "ts". */
  language?: string;
  /** 1-based line numbers drawn on an accent band, swept in once the slab settles. */
  highlightLines?: number[];
  /** A filename, shown in a tab on the slab. */
  title?: string;
}

interface SlabState {
  built: CodeSlabScene;
  layout: CodeSlabLayout;
}

/** The fonts the face is painted in, loaded before the stage mounts (the canvas would draw a fallback otherwise). */
function loadFonts(theme: Theme, aspect: Aspect, size: number): Promise<unknown> {
  const { type, fonts, weights } = theme;
  const fontSet = (globalThis as { document?: Document }).document?.fonts;
  if (fontSet === undefined) return Promise.resolve();
  return Promise.all([fontSet.load(`${type.mono[aspect].weight} ${size}px ${fonts.mono}`), fontSet.load(`${weights.medium} ${type.label[aspect].size}px ${fonts.mono}`)]);
}

export function CodeSlab3D(props: CodeSlab3DProps) {
  const errors = codeSlab3DErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`CodeSlab3D: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, code, language = "ts", highlightLines = [], title } = props;
  const layout = codeSlabLayout(theme, aspect, codeLines(code), title !== undefined, slot);
  const { root, stage } = layout;
  const time = useSceneTime(progress);
  const { ms } = entering(time);
  const pose = slabPose(ms);
  const bands = bandSweeps(ms, highlightLines.length);
  const opacity = fade(theme.motion.fx, ms - SLAB_START_MS) * exitOpacity(theme, time, SLAB_SETTLE_MS - SLAB_START_MS);
  const fontsReady = useThreeAsset(`code-slab fonts: ${theme.fonts.mono} ${layout.size}`, () => loadFonts(theme, aspect, layout.size)) !== undefined;

  const build = (): ThreeBuilt<SlabState> => {
    const built = buildCodeSlabScene(theme, aspect, layout, slabTokens(code, language), title, highlightLines);
    return {
      scene: built.scene,
      camera: slabCamera(layout),
      keys: [
        { label: "code slab", object: built.body },
        ...built.text.map(({ mesh, line }, i) => ({ label: `code line ${i + 1}`, object: mesh, text: line.text, color: theme.colors[line.color] })),
      ],
      state: { built, layout },
    };
  };
  // `now` is the stage's own scene ms; the entrance runs on `entering` (a settled opening runs ahead).
  const update = (ctx: ThreeContext<SlabState>, now: number) => {
    const { built, layout: placed } = ctx.state!;
    const at = now + (ms - time.ms);
    poseCodeSlab(built, slabPose(at), placed);
    built.paintBands(bandSweeps(at, highlightLines.length));
  };

  return (
    <div
      data-code-slab=""
      data-slab={pose.done.toFixed(4)}
      data-slab-bands={bands.length === 0 ? undefined : bands.map((b) => b.toFixed(4)).join(" ")}
      style={{ position: "absolute", left: root.x, top: root.y, width: root.width, height: root.height, opacity }}
    >
      {fontsReady && (
        <ThreeStage
          area={{ x: stage.x - root.x, y: stage.y - root.y, width: stage.width, height: stage.height }}
          aspect={aspect}
          progress={progress}
          build={build}
          update={update}
          environment="studio"
          label="CodeSlab3D"
        />
      )}
    </div>
  );
}
