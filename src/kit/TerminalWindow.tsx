// A terminal in the shared window chrome (design v3, life #10). Once the window
// has faded in, each command waits on its prompt with a blinking caret, then
// types with jittered keystrokes behind a solid one; its output fades and rises
// in the moment it has been typed. Once everything has run, a fresh prompt
// waits with a blinking caret. Text stays at the mono step: when the lines
// outgrow the window it scrolls with the `enter` spring (see `terminalSchedule`).
// The same `seed` types the same way on every render.

import type { Seed } from "../engine/random";
import { typeCss } from "../layout/type";
import { useSceneTime } from "./frameContext";
import { syntaxColors } from "./syntaxColors";
import { terminalFrame, terminalSchedule, PROMPT_MARKER, type TerminalLine } from "./terminalSchedule";
import type { KitProps } from "./types";
import { Caret } from "./Caret";
import { caretBlink, typedText } from "./typing";
import { TitleBar, WindowShell, type WindowChromeStyle } from "./AppWindow";
import { windowBox } from "./windowLayout";

export { terminalFrame, terminalSchedule, terminalTiming } from "./terminalSchedule";
export type { TerminalEntry, TerminalEntryFrame, TerminalFrame, TerminalLine, TerminalLineTiming, TerminalSchedule, TerminalScheduleOptions, TerminalScroll } from "./terminalSchedule";

export interface TerminalWindowProps extends KitProps {
  lines: TerminalLine[];
  /** Title bar text. Default "Terminal". */
  title?: string;
  /** Element id for shared-element transitions. */
  shareId?: string;
  chrome?: WindowChromeStyle;
  /** Varies the typing rhythm; the same seed types the same way every time. Default 0. */
  seed?: Seed;
}

/** Rounds a px value for the markup. */
const px = (value: number) => Math.round(value * 100) / 100;

export function TerminalWindow({ progress, theme, aspect, area, lines, title = "Terminal", shareId, chrome = "traffic", seed = 0 }: TerminalWindowProps) {
  const time = useSceneTime(progress);
  const { ms } = time;
  const schedule = terminalSchedule(theme, aspect, lines, { area, time, seed });
  const box = windowBox(theme, aspect, schedule.visibleRows * schedule.rowHeight, area);
  const frame = terminalFrame(theme, schedule, ms);
  const colors = syntaxColors(theme);
  // The entry that has appeared most recently holds the caret.
  let active = -1;
  frame.entries.forEach((entry, i) => {
    if (entry.shown) active = i;
  });

  const marker = (
    <span data-terminal-prompt="" style={{ color: colors.keyword, fontWeight: theme.weights.semibold }}>
      {`${PROMPT_MARKER} `}
    </span>
  );

  const rendered = schedule.entries.map((entry, i) => {
    const state = frame.entries[i]!;
    if (!state.shown) return null;
    const line: TerminalLine | undefined = lines[i];
    const prompt = line === undefined || line.prompt === true;
    // A command's caret blinks on the empty prompt and goes solid as it types; the fresh prompt's blinks for good.
    const holdsCaret = i === active && prompt && (line === undefined || ms < entry.end);
    const caretOpacity = line !== undefined && ms >= entry.typeStart ? 1 : caretBlink(theme, ms - entry.start);
    return (
      <div
        key={i}
        data-terminal-line={i}
        style={{
          minHeight: px(schedule.rows[i]! * schedule.rowHeight),
          opacity: state.opacity,
          ...(state.rise > 0 ? { transform: `translateY(${px(state.rise)}px)` } : {}),
        }}
      >
        {prompt && marker}
        {line !== undefined && (
          <span data-terminal-text={i} style={{ color: line.prompt ? colors.plain : colors.comment }}>
            {line.prompt ? typedText(line.text, entry, ms) : line.text}
          </span>
        )}
        {holdsCaret && <Caret theme={theme} shape="block" opacity={caretOpacity} marker={{ "data-terminal-caret": i }} />}
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
        style={{
          fontFamily: theme.fonts.mono,
          ...typeCss({ ...theme.type.mono[aspect], size: schedule.size }),
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          ...(frame.offset !== 0 ? { transform: `translateY(${px(frame.offset)}px)` } : {}),
        }}
      >
        {rendered}
      </div>
    </WindowShell>
  );
}
