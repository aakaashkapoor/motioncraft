// A flow diagram: 2-4 short labels in rounded cards joined by arrows, left to
// right when the area is wide enough (the 16:9 content area) and top to bottom
// otherwise (9:16, or a narrow Section slot), with an optional caption under it.
// It builds up in order (node 1, the arrow to node 2 drawing itself, node 2,
// ...) over the scene's entrance, holds, then fades out.

import { interpolate } from "../engine/easing";
import { blockCenterY, placeBlock } from "../layout/block";
import { contentArea, textColumn } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { safeZones } from "../layout/safe";
import { charsPerLine, estimateTextHeight } from "../layout/textFit";
import { fontSize, typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme, TypeRole } from "../theme/types";
import { cardColors } from "../theme/roles";
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

/** Label steps to try, largest first. Labels are set in the `title` step's weight. */
const LABEL_STEPS: readonly TypeRole[] = ["title", "subtitle", "body", "label"];

export interface FlowArrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Where everything goes, in px relative to the area's top-left corner. */
export interface FlowDiagramLayout {
  labelStep: TypeRole;
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
  return { padding: theme.spacing.md, border: theme.spacing.xxs / 2 };
}

/**
 * Lays the diagram out in `slot` (the content area when there is none): equal
 * cards along the flow with an arrow in each gap, the caption under them, the
 * whole block centered (on the frame's optical center without a slot). The
 * flow runs left to right when the area is landscape, unless top to bottom
 * fits larger labels (a narrow Section slot). Uses the
 * largest label step at which every card fits with no word broken; if none
 * fits, the smallest, and the layer-1 checks report the overflow.
 */
export function flowDiagramLayout(
  theme: Theme,
  aspect: Aspect,
  nodes: readonly string[],
  caption?: string,
  slot?: Rect,
): FlowDiagramLayout {
  checkNodes(nodes);
  const area = slot ?? contentArea(theme, aspect);
  const { spacing } = theme;
  const { padding, border } = cardInsets(theme);
  const inset = 2 * (padding + border);
  const count = nodes.length;
  const gap = spacing.xxl;

  // The caption is free-standing text, so it keeps to the text column (clear of the 9:16 right rail).
  const captionWidth = Math.min(area.width, textColumn(theme, aspect).width);
  const captionHeight = caption === undefined ? 0 : estimateTextHeight(caption, captionWidth, theme.type.body[aspect]);
  const captionSpace = caption === undefined ? 0 : spacing.lg + captionHeight;
  const room = area.height - captionSpace;

  // Cards share a row, but never stretch past a third of it; stacked, they are the primary width.
  const stackWidth = Math.min(area.width, safeZones(aspect, theme.safe).primaryWidth);
  const widthOf = (row: boolean) => (row ? Math.min((area.width - (count - 1) * gap) / count, (area.width - 2 * gap) / 3) : stackWidth);
  const cardHeightOf = (row: boolean, step: TypeRole) => {
    const spec = theme.type[step][aspect];
    const width = widthOf(row) - inset;
    const text = Math.max(...nodes.map((label) => estimateTextHeight(label, width, spec)));
    return Math.max(text, spec.size * spec.lineHeight) + inset;
  };
  const heightOf = (row: boolean, step: TypeRole) => (row ? cardHeightOf(row, step) : count * cardHeightOf(row, step) + (count - 1) * gap);
  // Words must fit whole: a label broken mid-word is hard to read.
  const longestWord = Math.max(...nodes.flatMap((label) => label.split(/\s+/).map((word) => word.length)));
  const fitting = (row: boolean) =>
    LABEL_STEPS.find((step) => charsPerLine(widthOf(row) - inset, fontSize(theme, step, aspect)) >= longestWord && heightOf(row, step) <= room);
  // When nothing fits, a few px over is better than a word broken in two.
  const smallest = LABEL_STEPS[LABEL_STEPS.length - 1]!;
  const wholeWords = (row: boolean) => charsPerLine(widthOf(row) - inset, fontSize(theme, smallest, aspect)) >= longestWord;
  const rank = (row: boolean) => {
    const step = fitting(row);
    return step !== undefined ? LABEL_STEPS.indexOf(step) : LABEL_STEPS.length + (wholeWords(row) ? 0 : 1);
  };
  // A landscape area runs left to right, unless top to bottom fits larger labels.
  const horizontal = area.width > area.height && rank(true) <= rank(false);
  const labelStep = fitting(horizontal) ?? smallest;
  const nodeWidth = widthOf(horizontal);
  const left = horizontal ? (area.width - count * nodeWidth - (count - 1) * gap) / 2 : (area.width - nodeWidth) / 2;
  const cardHeight = (step: TypeRole) => cardHeightOf(horizontal, step);
  const diagramHeight = (step: TypeRole) => heightOf(horizontal, step);

  const nodeHeight = cardHeight(labelStep);
  const blockHeight = diagramHeight(labelStep) + captionSpace;
  const top = Math.max(0, placeBlock(area, { width: area.width, height: blockHeight }, blockCenterY(theme, aspect, slot)).y - area.y);
  const rects: Rect[] = nodes.map((_, i) =>
    horizontal
      ? { x: left + i * (nodeWidth + gap), y: top, width: nodeWidth, height: nodeHeight }
      : { x: left, y: top + i * (nodeHeight + gap), width: nodeWidth, height: nodeHeight },
  );

  // Arrows span each gap, leaving a little air at both ends.
  const air = spacing.xs;
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
  if (caption !== undefined) {
    layout.caption = { x: (area.width - captionWidth) / 2, y: diagramBottom + spacing.lg, width: captionWidth, height: captionHeight };
  }
  return layout;
}

/** Progress, 0..1, of build step `index` of `steps` across the entrance. */
function buildStep(progress: number, index: number, steps: number): number {
  const size = ENTER / steps;
  return interpolate(progress, [index * size, (index + 1) * size], [0, 1]);
}

const round = (n: number) => Math.round(n * 100) / 100;

export function FlowDiagram({ progress, theme, aspect, area: slot, nodes, caption }: FlowDiagramProps) {
  const area = slot ?? contentArea(theme, aspect);
  const layout = flowDiagramLayout(theme, aspect, nodes, caption, slot);
  const easing = themeEasing(theme);
  const { colors, fonts, spacing, radius } = theme;
  const card = cardColors(theme);
  const { padding, border } = cardInsets(theme);
  const opacity = interpolate(progress, [1 - EXIT, 1], [1, 0], { easing });

  // Build order: node 0, arrow 0, node 1, arrow 1, ..., node n-1, caption.
  const steps = 2 * nodes.length - 1 + (caption === undefined ? 0 : 1);
  const nodeIn = (i: number) => easing(buildStep(progress, 2 * i, steps));
  const arrowIn = (i: number) => easing(buildStep(progress, 2 * i + 1, steps));
  const stroke = spacing.xxs;
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
            data-block="FlowDiagram"
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
              backgroundColor: card.fill,
              border: `${border}px solid ${card.border}`,
              borderRadius: radius.md,
            }}
          >
            <span
              style={{
                fontFamily: fonts.display,
                ...typeCss(theme.type[layout.labelStep][aspect]),
                fontWeight: theme.type.title[aspect].weight,
                color: card.text,
                overflowWrap: "break-word",
                textWrap: "balance",
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
            ...typeCss(theme.type.body[aspect]),
            color: colors.textMuted,
            textAlign: "center",
            overflowWrap: "break-word",
            textWrap: "balance",
          }}
        >
          {caption}
        </p>
      )}
    </div>
  );
}
