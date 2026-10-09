// A terminal in the shared window chrome. Prompt lines are typed character by
// character behind a prompt marker with a caret; output lines appear the instant the
// command before them has been typed. Once everything has run, a fresh prompt
// waits with a smoothly blinking caret. The window keeps its final size
// throughout, so lines appear without anything moving.

import { interpolate } from "../engine/easing";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { TYPE_FIT_ATTRIBUTE, typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { syntaxColors } from "./syntaxColors";
import type { KitProps } from "./types";
import { TitleBar, WindowShell, type WindowChromeStyle } from "./AppWindow";
import { fitMonoSize, MONO_ADVANCE, maxInnerHeight, windowBox, windowWidth } from "./windowLayout";

export interface TerminalLine {
  /** A typed command (true) or program output (default). */
  prompt?: boolean;
  text: string;
}

export interface TerminalWindowProps extends KitProps {
  lines: TerminalLine[];
  /** Title bar text. Default "Terminal". */
  title?: string;
  /** Element id for shared-element transitions. */
  shareId?: string;
  chrome?: WindowChromeStyle;
}

/** When a line appears and, for prompt lines, when typing starts and ends, as fractions of the scene. */
export interface TerminalLineTiming {
  start: number;
  typeStart: number;
  end: number;
}

/** Typing runs between these fractions of the scene. */
const TYPE_START = 0.12;
const TYPE_END = 0.7;
/** Pause on an empty prompt before typing starts, in characters' worth of time. */
const PAUSE_CHARS = 6;
/** Caret blinks per scene while idle. */
const BLINKS = 6;
const PROMPT_MARKER = "$";

/**
 * Every line's timing. Each line appears when the one before it ends; a prompt
 * line then pauses and types its text at an even rate, and an output line
 * ends as it appears. All typing fits between `TYPE_START` and `TYPE_END`.
 */
export function terminalTiming(lines: readonly TerminalLine[]): TerminalLineTiming[] {
  const units = lines.reduce((sum, line) => sum + (line.prompt ? PAUSE_CHARS + line.text.length : 0), 0);
  const unit = units === 0 ? 0 : (TYPE_END - TYPE_START) / units;
  let at = TYPE_START;
  return lines.map((line) => {
    const start = at;
    if (!line.prompt) return { start, typeStart: start, end: start };
    const typeStart = start + PAUSE_CHARS * unit;
    at = typeStart + line.text.length * unit;
    return { start, typeStart, end: at };
  });
}

/** Caret opacity while idle: a smooth blink, fully on at the scene's start. */
function blink(progress: number): number {
  return 0.5 + 0.5 * Math.cos(2 * Math.PI * BLINKS * progress);
}

/** Rows a line takes when wrapped at `columns` characters. */
function rows(chars: number, columns: number): number {
  return Math.max(1, Math.ceil(chars / Math.max(1, columns)));
}

function terminalLayout(theme: Theme, aspect: Aspect, lines: readonly TerminalLine[], area: Rect) {
  const { inner } = windowWidth(theme, aspect, area);
  const { lineHeight } = theme.type.mono[aspect];
  const prefix = PROMPT_MARKER.length + 1;
  // Every line plus the fresh prompt at the end; prompt lines leave room for the caret.
  const widths = [...lines.map((line) => line.text.length + (line.prompt ? prefix + 1 : 0)), prefix + 1];
  const heightAt = (size: number) => {
    const columns = Math.floor(inner / (size * MONO_ADVANCE));
    return widths.reduce((sum, chars) => sum + rows(chars, columns), 0) * size * lineHeight;
  };
  const size = fitMonoSize(theme, aspect, (s) => heightAt(s) <= maxInnerHeight(theme, aspect, area));
  return { size, box: windowBox(theme, aspect, heightAt(size), area) };
}

export function TerminalWindow({ progress, theme, aspect, area, lines, title = "Terminal", shareId, chrome = "traffic" }: TerminalWindowProps) {
  const { size, box } = terminalLayout(theme, aspect, lines, area ?? contentArea(theme, aspect));
  const timing = terminalTiming(lines);
  const colors = syntaxColors(theme);
  const mono = theme.type.mono[aspect];
  const finished = progress >= (timing.at(-1)?.end ?? TYPE_START);
  // The line that has appeared most recently holds the caret.
  let active = -1;
  timing.forEach((t, i) => {
    if (t.start <= progress) active = i;
  });

  const caret = (line: number, solid: boolean) => (
    <span
      data-terminal-caret={line}
      style={{
        display: "inline-block",
        width: "0.6em",
        height: "1.15em",
        marginLeft: "0.08em",
        verticalAlign: "text-bottom",
        backgroundColor: theme.colors.accent,
        opacity: solid ? 1 : blink(progress),
      }}
    />
  );
  const marker = (
    <span data-terminal-prompt="" style={{ color: colors.keyword, fontWeight: theme.weights.semibold }}>
      {`${PROMPT_MARKER} `}
    </span>
  );

  const rendered = lines.map((line, i) => {
    const t = timing[i]!;
    if (t.start > progress) return null;
    const typed = line.prompt
      ? line.text.slice(0, Math.floor(interpolate(progress, [t.typeStart, t.end], [0, line.text.length])))
      : line.text;
    const holdsCaret = line.prompt === true && i === active && progress < t.end;
    return (
      <div key={i} data-terminal-line={i}>
        {line.prompt && marker}
        <span data-terminal-text={i} style={{ color: line.prompt ? colors.plain : colors.comment }}>
          {typed}
        </span>
        {holdsCaret && caret(i, progress >= t.typeStart)}
      </div>
    );
  });

  return (
    <WindowShell
      progress={progress}
      theme={theme}
      aspect={aspect}
      area={box}
      kind="terminal"
      shareId={shareId}
      titleBar={<TitleBar theme={theme} aspect={aspect} title={title} chrome={chrome} />}
    >
      <div
        // The mono step, shrunk to fit when the lines need it.
        {...(size < mono.size ? { [TYPE_FIT_ATTRIBUTE]: "" } : {})}
        style={{
          fontFamily: theme.fonts.mono,
          ...typeCss({ ...mono, size }),
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {rendered}
        {finished && (
          <div data-terminal-line={lines.length}>
            {marker}
            {caret(lines.length, false)}
          </div>
        )}
      </div>
    </WindowShell>
  );
}
