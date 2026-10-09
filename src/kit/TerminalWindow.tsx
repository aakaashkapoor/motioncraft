// A terminal in the shared window chrome. Once the window has faded in, prompt
// lines are typed character by character (`text.in`'s per-character step)
// behind a prompt marker with a caret; output lines appear the instant the
// command before them has been typed. Once everything has run, a fresh prompt
// waits with a smoothly blinking caret. The window keeps its final size
// throughout, so lines appear without anything moving.

import { interpolate } from "../engine/easing";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import { estimateLines } from "../layout/textFit";
import { TYPE_FIT_ATTRIBUTE, typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { useSceneTime, type SceneTime } from "./frameContext";
import { fitSequence } from "./motion";
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

/** When a line appears and, for prompt lines, when typing starts and ends, in ms from the scene's start. */
export interface TerminalLineTiming {
  start: number;
  typeStart: number;
  end: number;
}

/** Pause on an empty prompt before typing starts, in characters' worth of time. */
const PAUSE_CHARS = 6;
/** The idle caret's blink period: on for half of it (design v3, life #10). */
const CARET_BLINK_MS = 1060;
const PROMPT_MARKER = "$";
/** Stands in for the caret when counting a line's characters: one more, on the last word. */
const CARET_ROOM = "_";

/**
 * Every line's timing, in ms. The first line appears once the window has
 * faded in; each line after appears when the one before it ends; a prompt
 * line then pauses and types its text at `text.in`'s per-character step, and
 * an output line ends as it appears. Given the scene's time, typing that would
 * run into the exit speeds up to finish before it.
 */
export function terminalTiming(theme: Theme, lines: readonly TerminalLine[], time?: SceneTime): TerminalLineTiming[] {
  const { leadMs, fx, enter } = theme.motion;
  const typeStart = leadMs + fx.ms;
  const units = lines.reduce((sum, line) => sum + (line.prompt ? PAUSE_CHARS + line.text.length : 0), 0);
  const natural = theme.motion["text.in"].charStaggerMs;
  const unit = time === undefined ? natural : natural * fitSequence(theme, time, typeStart, typeStart + units * natural, enter.ms);
  let at = typeStart;
  return lines.map((line) => {
    const start = at;
    if (!line.prompt) return { start, typeStart: start, end: start };
    const typeStart = start + PAUSE_CHARS * unit;
    at = typeStart + line.text.length * unit;
    return { start, typeStart, end: at };
  });
}

/** Caret opacity `ms` into idling: a smooth blink, fully on as it starts. */
function blink(ms: number): number {
  return 0.5 + 0.5 * Math.cos((2 * Math.PI * ms) / CARET_BLINK_MS);
}


function terminalLayout(theme: Theme, aspect: Aspect, lines: readonly TerminalLine[], slot: Rect | undefined) {
  const area = slot ?? contentArea(theme, aspect);
  const { inner } = windowWidth(theme, aspect, area);
  const { lineHeight } = theme.type.mono[aspect];
  // Every line plus the fresh prompt at the end; prompt lines carry the marker and leave room for
  // the caret. Lines wrap at their spaces (`pre-wrap`), breaking a word only when it is too long.
  const texts = [...lines.map((line) => (line.prompt ? `${PROMPT_MARKER} ${line.text}${CARET_ROOM}` : line.text)), `${PROMPT_MARKER} ${CARET_ROOM}`];
  const heightAt = (size: number) =>
    texts.reduce((sum, text) => sum + Math.max(1, estimateLines(text, inner, size, MONO_ADVANCE)), 0) * size * lineHeight;
  const size = fitMonoSize(theme, aspect, (s) => heightAt(s) <= maxInnerHeight(theme, aspect, area));
  return { size, box: windowBox(theme, aspect, heightAt(size), slot) };
}

export function TerminalWindow({ progress, theme, aspect, area, lines, title = "Terminal", shareId, chrome = "traffic" }: TerminalWindowProps) {
  const { size, box } = terminalLayout(theme, aspect, lines, area);
  const time = useSceneTime(progress);
  const { ms } = time;
  const timing = terminalTiming(theme, lines, time);
  const colors = syntaxColors(theme);
  const mono = theme.type.mono[aspect];
  const idleFrom = timing.at(-1)?.end ?? theme.motion.leadMs + theme.motion.fx.ms;
  const finished = ms >= idleFrom;
  // The line that has appeared most recently holds the caret.
  let active = -1;
  timing.forEach((t, i) => {
    if (t.start <= ms) active = i;
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
        opacity: solid ? 1 : blink(ms - idleFrom),
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
    if (t.start > ms) return null;
    const typed = line.prompt ? line.text.slice(0, Math.floor(interpolate(ms, [t.typeStart, t.end], [0, line.text.length]))) : line.text;
    const holdsCaret = line.prompt === true && i === active && ms < t.end;
    return (
      <div key={i} data-terminal-line={i}>
        {line.prompt && marker}
        <span data-terminal-text={i} style={{ color: line.prompt ? colors.plain : colors.comment }}>
          {typed}
        </span>
        {holdsCaret && caret(i, ms >= t.typeStart)}
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
