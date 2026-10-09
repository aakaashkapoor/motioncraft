// A flow diagram: 2-4 short labels in rounded cards joined by arrows, left to
// right in 16:9 and top to bottom in 9:16, with an optional caption under it.
// It builds up in order (node 1, the arrow to node 2 drawing itself, node 2,
// ...) over the scene's entrance, holds, then fades out.

import { interpolate } from "../engine/easing";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { charsPerLine, estimateTextHeight } from "../layout/textFit";
import { fontSize } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeStep } from "../theme/types";
import { themeEasing } from "./motion";
import type { KitProps } from "./types";

export interface FlowDiagramProps extends KitProps {
  /** 2-4 short labels, in flow order. */
  nodes: readonly string[];
  /** Text under the diagram. */
  caption?: string;
}

export const MIN_FLOW_NODES = 2;
export const MAX_FLOW_NODES = 4;

const ENTER = 0.2;
const EXIT = 0.1;

/** Label sizes to try, largest first. */
const LABEL_STEPS: readonly TypeStep[] = ["title", "subtitle", "body"];
const LABEL_LINE_HEIGHT = 1.15;
const CAPTION_LINE_HEIGHT = 1.25;

export interface FlowArrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Where everything goes, in px relative to the content area's top-left corner. */
export interface FlowDiagramLayout {
  labelStep: TypeStep;
  nodes: Rect[];
  arrows: FlowArrow[];
  caption?: Rect;
}

function checkNodes(nodes: readonly string[]): void {
  if (!Array.isArray(nodes) || nodes.length < MIN_FLOW_NODES || nodes.length > MAX_FLOW_NODES) {
    throw new Error(`FlowDiagram: needs ${MIN_FLOW_NODES}-${MAX_FLOW_NODES} nodes, got ${Array.isArray(nodes) ? nodes.length : typeof nodes}`);
  }
}

/** Card padding and border width, from the theme spacing. */
function cardInsets(theme: Theme): { padding: number; border: number } {
  return { padding: theme.spacing.md, border: theme.spacing.xs / 2 };
}

/**
 * Lays the diagram out in the content area: equal cards along the flow with an
 * arrow in each gap, the caption under them, the whole block centered. Uses
 * the largest label size at which every card fits with no word broken; if none
 * fits, the smallest, and the layer-1 checks report the overflow.
 */
export function flowDiagramLayout(theme: Theme, aspect: Aspect, nodes: readonly string[], caption?: string): FlowDiagramLayout {
  checkNodes(nodes);
  const area = contentArea(theme, aspect);
  const { spacing } = theme;
  const { padding, border } = cardInsets(theme);
  const inset = 2 * (padding + border);
  const horizontal = aspect === "16:9";
  const count = nodes.length;
  const gap = spacing.xl;

  const captionSize = fontSize(theme, "body", aspect);
  const captionHeight =
    caption === undefined ? 0 : estimateTextHeight(caption, area.width, { size: captionSize, lineHeight: CAPTION_LINE_HEIGHT });
  const captionSpace = caption === undefined ? 0 : spacing.lg + captionHeight;
  const room = area.height - captionSpace;

  // Cards share the row in 16:9, but never stretch past a third of it.
  const nodeWidth = horizontal ? Math.min((area.width - (count - 1) * gap) / count, (area.width - 2 * gap) / 3) : area.width;
  const left = horizontal ? (area.width - count * nodeWidth - (count - 1) * gap) / 2 : 0;
  const cardHeight = (step: TypeStep) => {
    const size = fontSize(theme, step, aspect);
    const text = Math.max(...nodes.map((label) => estimateTextHeight(label, nodeWidth - inset, { size, lineHeight: LABEL_LINE_HEIGHT })));
    return Math.max(text, size * LABEL_LINE_HEIGHT) + inset;
  };
  const diagramHeight = (step: TypeStep) => (horizontal ? cardHeight(step) : count * cardHeight(step) + (count - 1) * gap);
  // Words must fit whole: a label broken mid-word is hard to read.
  const longestWord = Math.max(...nodes.flatMap((label) => label.split(/\s+/).map((word) => word.length)));
  const wordsFit = (step: TypeStep) => charsPerLine(nodeWidth - inset, fontSize(theme, step, aspect)) >= longestWord;
  const labelStep =
    LABEL_STEPS.find((step) => wordsFit(step) && diagramHeight(step) <= room) ?? LABEL_STEPS[LABEL_STEPS.length - 1]!;

  const nodeHeight = cardHeight(labelStep);
  const top = Math.max(0, (area.height - diagramHeight(labelStep) - captionSpace) / 2);
  const rects: Rect[] = nodes.map((_, i) =>
    horizontal
      ? { x: left + i * (nodeWidth + gap), y: top, width: nodeWidth, height: nodeHeight }
      : { x: 0, y: top + i * (nodeHeight + gap), width: nodeWidth, height: nodeHeight },
  );

  // Arrows span each gap, leaving a little air at both ends.
  const air = spacing.sm;
  const arrows: FlowArrow[] = rects.slice(1).map((next, i) => {
    const prev = rects[i]!;
    if (horizontal) {
      const y = prev.y + prev.height / 2;
      return { x1: prev.x + prev.width + air, y1: y, x2: next.x - air, y2: y };
    }
    const x = prev.x + prev.width / 2;
    return { x1: x, y1: prev.y + prev.height + air, x2: x, y2: next.y - air };
  });

  const diagramBottom = top + diagramHeight(labelStep);
  const layout: FlowDiagramLayout = { labelStep, nodes: rects, arrows };
  if (caption !== undefined) layout.caption = { x: 0, y: diagramBottom + spacing.lg, width: area.width, height: captionHeight };
  return layout;
}

/** Progress, 0..1, of build step `index` of `steps` across the entrance. */
function buildStep(progress: number, index: number, steps: number): number {
  const size = ENTER / steps;
  return interpolate(progress, [index * size, (index + 1) * size], [0, 1]);
}

const round = (n: number) => Math.round(n * 100) / 100;

export function FlowDiagram({ progress, theme, aspect, nodes, caption }: FlowDiagramProps) {
  const area = contentArea(theme, aspect);
  const layout = flowDiagramLayout(theme, aspect, nodes, caption);
  const easing = themeEasing(theme);
  const { colors, fonts, spacing, radius } = theme;
  const { padding, border } = cardInsets(theme);
  const opacity = interpolate(progress, [1 - EXIT, 1], [1, 0], { easing });

  // Build order: node 0, arrow 0, node 1, arrow 1, ..., node n-1, caption.
  const steps = 2 * nodes.length - 1 + (caption === undefined ? 0 : 1);
  const nodeIn = (i: number) => easing(buildStep(progress, 2 * i, steps));
  const arrowIn = (i: number) => easing(buildStep(progress, 2 * i + 1, steps));
  const stroke = spacing.xs;
  const head = spacing.md * 0.75;

  return (
    <div
      style={{
        position: "absolute",
        left: area.x,
        top: area.y,
        width: area.width,
        height: area.height,
        opacity,
      }}
    >
      <svg
        width={area.width}
        height={area.height}
        viewBox={`0 0 ${area.width} ${area.height}`}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
      >
        {layout.arrows.map((arrow, i) => {
          const length = Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1);
          const drawn = arrowIn(i);
          // Unit vector along the arrow and its normal, for the head.
          const ux = (arrow.x2 - arrow.x1) / length;
          const uy = (arrow.y2 - arrow.y1) / length;
          const back = (s: number) => `${round(arrow.x2 - ux * head + -uy * head * s)},${round(arrow.y2 - uy * head + ux * head * s)}`;
          return (
            <g key={i} data-key-element={`arrow ${i + 1}`} fill="none" stroke={colors.accent} strokeWidth={stroke} strokeLinejoin="round">
              <line
                x1={round(arrow.x1)}
                y1={round(arrow.y1)}
                x2={round(arrow.x2)}
                y2={round(arrow.y2)}
                // A butt cap, so an arrow not yet drawn leaves no dot behind.
                strokeLinecap="butt"
                strokeDasharray={round(length)}
                strokeDashoffset={round(length * (1 - drawn))}
              />
              <polyline
                points={`${back(-1)} ${round(arrow.x2)},${round(arrow.y2)} ${back(1)}`}
                strokeLinecap="round"
                opacity={round(interpolate(drawn, [0.7, 1], [0, 1]))}
              />
            </g>
          );
        })}
      </svg>
      {nodes.map((label, i) => {
        const rect = layout.nodes[i]!;
        const shown = nodeIn(i);
        return (
          <div
            key={i}
            data-flow-node={i}
            style={{
              position: "absolute",
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              boxSizing: "border-box",
              padding,
              opacity: shown,
              transform: `scale(${round(interpolate(shown, [0, 1], [0.9, 1]))})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              backgroundColor: colors.surface,
              border: `${border}px solid ${colors.accent}`,
              borderRadius: radius,
            }}
          >
            <span
              style={{
                fontFamily: fonts.display,
                fontSize: fontSize(theme, layout.labelStep, aspect),
                fontWeight: 700,
                lineHeight: LABEL_LINE_HEIGHT,
                color: colors.text,
                overflowWrap: "break-word",
                maxWidth: "100%",
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
      {caption !== undefined && layout.caption !== undefined && (
        <p
          style={{
            position: "absolute",
            left: layout.caption.x,
            top: layout.caption.y,
            width: layout.caption.width,
            margin: 0,
            opacity: easing(buildStep(progress, steps - 1, steps)),
            fontFamily: fonts.body,
            fontSize: fontSize(theme, "body", aspect),
            lineHeight: CAPTION_LINE_HEIGHT,
            color: colors.muted,
            textAlign: "center",
            overflowWrap: "break-word",
          }}
        >
          {caption}
        </p>
      )}
    </div>
  );
}
