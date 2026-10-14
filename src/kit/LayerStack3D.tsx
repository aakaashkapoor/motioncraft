// LayerStack3D, ported from HyperFrames `exploded-stack` (pinned 2905162):
// isometric layer plates arrive as one stack, separate top first, and hold
// apart with a label beside each plate, for architecture and system diagrams.
// With `collapse` they rejoin just before the exit, as the source loops.
//
// The plates are rounded, beveled slabs (see `layerStack3dScene.ts`) filmed
// by an orthographic isometric camera on a `ThreeStage`; the highlighted
// layer takes the accent. The labels are flat HTML (the layer's name and an
// optional note), placed beside each plate's right-hand corner where the
// camera shows it (see `layerStack3dPlan.ts`), with a thin leader line from
// the corner, sliding in as each plate arrives.
//
// Timing (scene clock): the stack rises in on the lead (150 ms), its plates
// separate from 350 ms, top first, 90 ms apart, and are apart by about 1.5 s;
// it holds; with `collapse` the plates rejoin in the last 700 ms before the
// exit; the whole fades out fast onto the last frame. The labels carry the
// motion in the markup, so markup-level timing checks see it, and the plates
// are `ThreeKey`s, so the frame checks see where they are.

import { typeCss } from "../layout/type";
import { accentInk } from "../theme/roles";
import { entering, useSceneTime } from "./frameContext";
import { ENTRY_MS, layerStack3DErrors, layerStackFrame, layerStackLayout, stackCamera, type LayerStackLayout, type StackLayer } from "./layerStack3dPlan";
import { buildLayerStackScene, poseLayerStack, type LayerStackScene } from "./layerStack3dScene";
import { exitOpacity, fade } from "./motion";
import { ThreeStage, type ThreeBuilt, type ThreeContext } from "./three/ThreeStage";
import type { KitProps } from "./types";

export interface LayerStack3DProps extends KitProps {
  /** 2-6 layers, the top layer first. */
  layers: StackLayer[];
  /** A layer drawn in the accent (its index). */
  highlight?: number;
  /** Rejoin the plates into one stack just before the exit. Default false: they stay apart for the hold. */
  collapse?: boolean;
}

/** The leader's dot at a plate's corner, px across. */
const DOT_PX = 12;
/** The leader's stroke, px. */
const LEADER_PX = 2;

interface StackState {
  built: LayerStackScene;
}

export function LayerStack3D(props: LayerStack3DProps) {
  const errors = layerStack3DErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`LayerStack3D: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, layers, highlight, collapse = false } = props;
  const layout: LayerStackLayout = layerStackLayout(theme, aspect, layers, slot);
  const { root, stage, group, plate } = layout;
  const time = useSceneTime(progress);
  const { ms } = entering(time);
  const frame = layerStackFrame(theme, layout, { ms, leftMs: time.leftMs }, collapse);
  const opacity = fade(theme.motion.fx, ms - theme.motion.leadMs) * exitOpacity(theme, time, ENTRY_MS);
  const { colors, fonts, spacing } = theme;

  const build = (): ThreeBuilt<StackState> => {
    const built = buildLayerStackScene(theme, layout, layers, highlight);
    return {
      scene: built.scene,
      camera: stackCamera(layout),
      keys: built.plates.map((object, i) => ({ label: `layer ${i + 1}`, object })),
      state: { built },
    };
  };
  // The frame drawn is the one this render computed: the stage redraws when the scene ms changes.
  const update = (ctx: ThreeContext<StackState>) => {
    poseLayerStack(ctx.state!.built, frame.plates.map((p) => p.y), plate.thick);
  };

  const local = (x: number, y: number) => ({ x: x - root.x, y: y - root.y });
  return (
    <div data-layer-stack="" data-gaps={frame.gaps.map((g) => g.toFixed(4)).join(" ")} style={{ position: "absolute", left: root.x, top: root.y, width: root.width, height: root.height, opacity }}>
      <ThreeStage
        area={{ x: stage.x - root.x, y: stage.y - root.y, width: stage.width, height: stage.height }}
        aspect={aspect}
        progress={progress}
        build={build}
        update={update}
        environment="studio"
        label="LayerStack3D"
      />
      <svg aria-hidden="true" width={root.width} height={root.height} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
        {frame.labels.map((label, i) => {
          const a = local(label.anchor.x, label.anchor.y);
          const e = local(label.end.x, label.end.y);
          const ink = i === highlight ? colors.accent : colors.textMuted;
          return (
            <g key={i} data-stack-leader={i} opacity={label.opacity.toFixed(3)}>
              <line x1={a.x.toFixed(1)} y1={a.y.toFixed(1)} x2={e.x.toFixed(1)} y2={e.y.toFixed(1)} stroke={ink} strokeWidth={LEADER_PX} strokeLinecap="round" />
              <circle cx={a.x.toFixed(1)} cy={a.y.toFixed(1)} r={DOT_PX / 2} fill={ink} />
            </g>
          );
        })}
      </svg>
      <div data-block="LayerStack3D" style={{ position: "absolute", left: group.x - root.x, top: group.y - root.y, width: group.width, height: group.height }}>
        {layers.map((layer, i) => {
          const { box, opacity: shown } = frame.labels[i]!;
          // Inline: the note beside the name, on its baseline; else under it.
          const { inline } = layout.labels[i]!;
          const wrap = inline ? { whiteSpace: "nowrap" as const } : { overflowWrap: "break-word" as const, textWrap: "balance" as const };
          return (
            <div
              key={i}
              data-stack-label={i}
              style={{
                position: "absolute",
                left: box.x - group.x,
                top: box.y - group.y,
                width: box.width,
                minHeight: box.height,
                display: "flex",
                flexDirection: inline ? "row" : "column",
                alignItems: inline ? "baseline" : "stretch",
                justifyContent: "center",
                ...(inline ? { alignContent: "center", flexWrap: "wrap" as const, justifyContent: "flex-start", columnGap: spacing.xs } : {}),
                opacity: Number(shown.toFixed(3)),
              }}
            >
              <div style={{ color: i === highlight ? accentInk(theme) : colors.text, fontFamily: fonts.display, ...typeCss(layout.type.title), ...wrap }}>{layer.label}</div>
              {layer.note !== undefined && (
                <div style={{ marginTop: inline ? 0 : spacing.xxs, color: colors.textMuted, fontFamily: fonts.body, ...typeCss(layout.type.note), ...wrap }}>{layer.note}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
