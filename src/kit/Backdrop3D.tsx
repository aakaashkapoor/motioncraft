// Backdrop3D: abstract full-bleed 3D spectacle behind content, after the
// looks of a motion reel. Four variants: "helix", a glowing torus of small
// coloured squares (reference: an indigo field); "blobs", glossy iridescent
// metaballs drifting and merging (near-black); "city", an isometric block of
// grey and accent bars rising in a wave (near-black); "tunnel", ink rings with
// one in the accent, flown into forever (lime). It fills its slot, or the
// whole frame, and draws only
// theme colours: the ink, the accent, the ink's quieter steps and the
// palette's swatches other than the ground, so it reads on every field.
// Unlit materials where the reference glows (helix, tunnel), glow faked with
// soft quads (no bloom); the blobs are lit by the studio environment, the city by the studio rig.
//
// `intensity` ("calm" or "busy") sets density and speed; `seed` the layout.
//
// Timing (scene clock): it rises in from the lead (150 ms) and is whole and
// readable by 1.4 s, then keeps moving gently for the hold (on the canvas
// only); the whole fades out fast onto the last frame. The DOM carries the
// entrance (`data-backdrop-rise`), so markup-level timing checks see it.

import { entering, useSceneTime, useVisibleRect } from "./frameContext";
import { backdrop3DErrors, backdropRise, BACKDROP_SETTLE_MS, BACKDROP_START_MS, type BackdropIntensity, type BackdropVariant } from "./backdrop3dPlan";
import { BACKDROP_BUILDERS } from "./backdrop3dVariants";
import { exitOpacity, fade } from "./motion";
import { ThreeStage, type ThreeBuilt, type ThreeContext, type ThreeStageSize } from "./three/ThreeStage";
import type { KitProps } from "./types";

export interface Backdrop3DProps extends KitProps {
  /** The look: "helix", "blobs", "city" or "tunnel". */
  variant: BackdropVariant;
  /** "calm" (default) or "busy": density and speed. */
  intensity?: BackdropIntensity;
  /** Picks the layout; the same seed always draws the same frames. Default 1. */
  seed?: number;
}

export function Backdrop3D(props: Backdrop3DProps) {
  const errors = backdrop3DErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`Backdrop3D: ${errors.join("; ")}`);
  const { progress, theme, aspect, area, variant, intensity = "calm", seed = 1 } = props;
  const builder = BACKDROP_BUILDERS[variant];
  const visible = useVisibleRect(aspect);
  const root = area ?? visible;
  const time = useSceneTime(progress);
  const { ms } = entering(time);
  const rise = backdropRise(ms);
  const opacity = fade(theme.motion.fx, ms - BACKDROP_START_MS) * exitOpacity(theme, time, BACKDROP_SETTLE_MS - BACKDROP_START_MS);

  const build = (size: ThreeStageSize): ThreeBuilt => builder.build(theme, seed, intensity, size);
  // `now` is the stage's own scene ms; the entrance runs on `entering` (a settled opening runs ahead).
  const update = (ctx: ThreeContext, now: number) => builder.pose(ctx.state, now + (ms - time.ms));

  return (
    <div
      data-backdrop={variant}
      data-backdrop-rise={rise.toFixed(4)}
      style={{ position: "absolute", left: root.x, top: root.y, width: root.width, height: root.height, opacity, pointerEvents: "none" }}
    >
      <ThreeStage area={{ x: 0, y: 0, width: root.width, height: root.height }} aspect={aspect} progress={progress} build={build} update={update} label="Backdrop3D" environment={builder.environment} />
    </div>
  );
}
