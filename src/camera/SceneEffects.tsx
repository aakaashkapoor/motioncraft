// A scene's effects in the render path, drawn inside its camera world so
// they move with camera shots. A ring or highlight is an overlay at the
// target's measured box (on the layer of the target's depth); a shake or
// pulse moves the target itself, through a style rule on its `shareId`
// scoped to the scene's world, with the individual `translate` and `scale`
// properties so it adds to the component's own transform.

import { KEY_ATTRIBUTE } from "../checks/measure";
import { useCueMs } from "../kit/cues";
import { useSceneTime } from "../kit/frameContext";
import { exitOpacity } from "../kit/motion";
import { SHARE_ATTRIBUTE } from "../render/sharedMeasure";
import type { Aspect, SceneEffect } from "../storyboard/types";
import { roleColor } from "../theme/roles";
import type { Theme } from "../theme/types";
import { EFFECTS_ATTRIBUTE } from "./effectsAttribute";
import { CameraLayer } from "./Camera";
import { DEFAULT_PULSE_MS, DEFAULT_SHAKE_MS, effectBox, HIGHLIGHT_ALPHA, highlightSweep, pulseScale, RING_STROKE_PX, ringDraw, shakeOffset, EFFECT_PADDING_PX } from "./effectMotion";
import { CAMERA_DEPTHS, type CameraDepth } from "./rig";
import type { SceneTargets, ShotTargetBox } from "./shots";

/** A CSS string literal, safe inside a `<style>` element. */
function cssString(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&").replace(/\n/g, "\\a ").replace(/</g, "\\3c ")}"`;
}

export interface SceneEffectsProps {
  sceneId: string;
  effects: readonly SceneEffect[];
  /** Measured boxes of ring and highlight targets, by effect index. One without a box is not drawn. */
  targets?: SceneTargets;
  progress: number;
  theme: Theme;
  aspect: Aspect;
}

/** The ms since each effect's cue, on the scene clock. */
function useElapsed(effects: readonly SceneEffect[], ms: number): number[] {
  // One hook per effect, in a fixed order: a scene's effects do not change between frames.
  return effects.map((effect) => ms - useCueMs(effect.at));
}

function Overlay({ effect, box, elapsed, theme, opacity }: { effect: SceneEffect; box: ShotTargetBox; elapsed: number; theme: Theme; opacity: number }) {
  const color = roleColor(theme, effect.color ?? "accent");
  const { x, y, width, height } = effectBox(box.rect);
  const radius = theme.radius.md + EFFECT_PADDING_PX;
  const place = { position: "absolute" as const, left: x, top: y, width, height, opacity, pointerEvents: "none" as const };
  if (effect.kind === "ring") {
    const draw = ringDraw(theme, elapsed);
    if (draw <= 0) return null;
    const inset = RING_STROKE_PX / 2;
    return (
      <svg data-effect="ring" {...{ [KEY_ATTRIBUTE]: "effect ring" }} width={width} height={height} style={{ ...place, overflow: "visible" }}>
        <rect
          x={inset}
          y={inset}
          width={width - RING_STROKE_PX}
          height={height - RING_STROKE_PX}
          rx={radius - inset}
          pathLength={1}
          fill="none"
          stroke={color}
          strokeWidth={RING_STROKE_PX}
          strokeLinecap="round"
          strokeDasharray="1 1"
          strokeDashoffset={1 - draw}
        />
      </svg>
    );
  }
  const sweep = highlightSweep(theme, elapsed);
  if (sweep <= 0) return null;
  return (
    <div data-effect="highlight" {...{ [KEY_ATTRIBUTE]: "effect highlight" }} style={{ ...place, overflow: "hidden", borderRadius: radius }}>
      <div data-effect-band="" style={{ width: Math.round(width * sweep * 100) / 100, height: "100%", backgroundColor: color, opacity: HIGHLIGHT_ALPHA }} />
    </div>
  );
}

/** The named depth a measured target is on, if it is one of `CAMERA_DEPTHS` other than the world's own. */
function depthName(depth: number): CameraDepth | undefined {
  if (depth === 1) return undefined;
  return (Object.keys(CAMERA_DEPTHS) as CameraDepth[]).find((name) => CAMERA_DEPTHS[name] === depth);
}

/** The style rules that shake and pulse targets right now, scoped to the scene's world. */
function motionRules(sceneId: string, effects: readonly SceneEffect[], elapsed: readonly number[]): string {
  const moves = new Map<string, { x: number; scale: number }>();
  effects.forEach((effect, i) => {
    if (effect.kind !== "shake" && effect.kind !== "pulse") return;
    const move = moves.get(effect.target) ?? { x: 0, scale: 1 };
    if (effect.kind === "shake") move.x += shakeOffset(elapsed[i]!, effect.durationMs ?? DEFAULT_SHAKE_MS);
    else move.scale *= pulseScale(elapsed[i]!, effect.durationMs ?? DEFAULT_PULSE_MS);
    moves.set(effect.target, move);
  });
  return [...moves]
    .filter(([, move]) => move.x !== 0 || move.scale !== 1)
    .map(([target, { x, scale }]) => {
      const props = [x === 0 ? "" : `translate:${Math.round(x * 100) / 100}px 0`, scale === 1 ? "" : `scale:${Math.round(scale * 10000) / 10000}`].filter(Boolean);
      return `[${EFFECTS_ATTRIBUTE}=${cssString(sceneId)}] [${SHARE_ATTRIBUTE}=${cssString(target)}]{${props.join(";")}}`;
    })
    .join("");
}

/**
 * The scene's effects at the current frame: overlays for rings and
 * highlights, and a style rule for shakes and pulses. Draw it inside the
 * scene's `CameraWorld`, after the scene's component, with the world marked
 * `EFFECTS_ATTRIBUTE` = `sceneId`.
 */
export function SceneEffects({ sceneId, effects, targets, progress, theme, aspect }: SceneEffectsProps) {
  const time = useSceneTime(progress);
  const elapsed = useElapsed(effects, time.ms);
  const opacity = exitOpacity(theme, time, theme.motion.enter.ms);
  const rules = motionRules(sceneId, effects, elapsed);
  return (
    <>
      {rules !== "" && <style>{rules}</style>}
      {effects.map((effect, i) => {
        const box = targets?.[i];
        if (box === undefined || (effect.kind !== "ring" && effect.kind !== "highlight")) return null;
        const overlay = <Overlay key={i} effect={effect} box={box} elapsed={elapsed[i]!} theme={theme} opacity={opacity} />;
        const depth = depthName(box.depth);
        return depth === undefined ? overlay : (
          <CameraLayer key={i} depth={depth} aspect={aspect}>
            {overlay}
          </CameraLayer>
        );
      })}
    </>
  );
}
