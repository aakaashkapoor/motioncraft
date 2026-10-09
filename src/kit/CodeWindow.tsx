// Syntax-highlighted code in window chrome, with line numbers. Optional
// `highlightLines` pick out lines once the code is on screen: they get an
// accent-tinted band while the others dim. Optional `reveal` brings the lines
// in one by one. The type shrinks until the longest line and every row fit.

import { interpolate } from "../engine/easing";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import { mixColors } from "../theme/color";
import type { Theme } from "../theme/types";
import { highlightCode, type CodeToken } from "./highlight";
import { themeEasing } from "./motion";
import { HIGHLIGHT_TINT, syntaxColors } from "./syntaxColors";
import type { KitProps } from "./types";
import { WindowChrome } from "./WindowChrome";
import { fitMonoSize, MONO_ADVANCE, maxInnerHeight, windowBox, windowMetrics, windowWidth } from "./windowLayout";

export interface CodeWindowProps extends KitProps {
  code: string;
  /** A Prism language name, e.g. "typescript", "python", "bash". Default "typescript". */
  language?: string;
  /** Title bar text, e.g. a file name. */
  title?: string;
  /** 1-based line numbers to pick out; the others dim. */
  highlightLines?: number[];
  /** Bring the lines in one by one instead of all at once. */
  reveal?: boolean;
  /** Show line numbers. Default true. */
  lineNumbers?: boolean;
  /** Element id for shared-element transitions. */
  shareId?: string;
}

/** With `reveal`, lines come in between these fractions of the scene. */
const REVEAL_START = 0.08;
const REVEAL_END = 0.55;
/** How long one line takes to fade in, as a fraction of the scene. */
const LINE_FADE = 0.08;
/** Dimming of the non-highlighted lines starts here (after the reveal, if any) and takes `DIM_FADE`. */
const DIM_START = 0.2;
const DIM_FADE = 0.12;
/** Opacity of a dimmed line. */
const DIM_OPACITY = 0.35;
/** Gap between the line numbers and the code, in characters. */
const GUTTER_GAP = 2;
const TAB = "  ";

function codeLayout(theme: Theme, aspect: Aspect, lines: readonly CodeToken[][], gutter: number, area: Rect) {
  const { inner } = windowWidth(theme, aspect, area);
  const { lineHeight } = theme.type.mono[aspect];
  const columns = gutter + Math.max(1, ...lines.map((line) => line.reduce((n, t) => n + t.text.length, 0)));
  const maxHeight = maxInnerHeight(theme, aspect, area);
  const size = fitMonoSize(
    theme,
    aspect,
    (s) => columns * s * MONO_ADVANCE <= inner && lines.length * s * lineHeight <= maxHeight,
  );
  const rowHeight = Math.round(size * lineHeight);
  return { size, rowHeight, box: windowBox(theme, aspect, lines.length * rowHeight, area) };
}

export function CodeWindow({
  progress,
  theme,
  aspect,
  area,
  code,
  language = "typescript",
  title,
  highlightLines = [],
  reveal = false,
  lineNumbers = true,
  shareId,
}: CodeWindowProps) {
  const lines = highlightCode(code.replace(/\t/g, TAB), language);
  const digits = String(lines.length).length;
  const gutter = lineNumbers ? digits + GUTTER_GAP : 0;
  const { size, rowHeight, box } = codeLayout(theme, aspect, lines, gutter, area ?? contentArea(theme, aspect));
  const colors = syntaxColors(theme);
  const easing = themeEasing(theme);
  const mono = theme.type.mono[aspect];
  // Lines run into the window's side padding, so a highlight band spans the window.
  const { padding } = windowMetrics(theme, aspect);
  const picked = new Set(highlightLines);
  const dimStart = reveal ? REVEAL_END : DIM_START;
  const dim = picked.size === 0 ? 0 : interpolate(progress, [dimStart, dimStart + DIM_FADE], [0, 1], { easing });
  const step = lines.length > 1 ? (REVEAL_END - LINE_FADE - REVEAL_START) / (lines.length - 1) : 0;

  return (
    <WindowChrome progress={progress} theme={theme} aspect={aspect} box={box} title={title} shareId={shareId}>
      <div style={{ fontFamily: theme.fonts.mono, fontWeight: mono.weight, letterSpacing: `${mono.tracking}em` }}>
        {lines.map((tokens, i) => {
          const number = i + 1;
          const lit = picked.has(number);
          const start = REVEAL_START + i * step;
          const shown = reveal ? interpolate(progress, [start, start + LINE_FADE], [0, 1], { easing }) : 1;
          const opacity = shown * (lit ? 1 : 1 - dim * (1 - DIM_OPACITY));
          return (
            <div
              key={i}
              data-code-line={number}
              data-code-highlight={lit ? number : undefined}
              style={{
                display: "flex",
                height: rowHeight,
                marginLeft: -padding,
                marginRight: -padding,
                paddingLeft: padding,
                paddingRight: padding,
                fontSize: size,
                lineHeight: `${rowHeight}px`,
                whiteSpace: "pre",
                opacity,
                backgroundColor: lit ? mixColors(theme.colors.surface, theme.colors.accent, HIGHLIGHT_TINT * dim) : undefined,
                boxShadow: lit && dim > 0 ? `inset ${theme.hairline * 2}px 0 0 ${theme.colors.accent}` : undefined,
              }}
            >
              {lineNumbers && (
                <span
                  data-line-number={number}
                  style={{ flex: "none", width: `${gutter}ch`, paddingRight: `${GUTTER_GAP}ch`, boxSizing: "border-box", textAlign: "right", color: colors.comment }}
                >
                  {number}
                </span>
              )}
              <span>
                {tokens.map((token, j) => (
                  <span key={j} data-token={token.role} style={{ color: colors[token.role] }}>
                    {token.text}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </WindowChrome>
  );
}
