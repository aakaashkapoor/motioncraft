// A layer-1 warning for line-by-line headlines (`lines` on Headline and
// TitleCard) with a line cued so late that it has not landed when the scene
// starts to leave: it would only show in the render, as a line that flickers
// in and out or never reads. Cues resolve on the scene's words: the voice's
// measured times when the narration is spoken, else their even estimate. Pure.

import { headlineTiming, headlineWords, type HeadlineMotion } from "../kit/headlineMotion";
import { lineStarts, type HeadlineLine } from "../kit/headlineLines";
import { resolveCue } from "../kit/cues";
import { sceneWords } from "../kit/sceneWords";
import type { TimedWord } from "../kit/captionWords";
import { sceneComponents } from "../storyboard/components";
import type { Storyboard } from "../storyboard/types";
import type { Theme } from "../theme/types";

/** Where each component that takes lines keeps its motion, and when its first line starts by default. */
const TAKES_LINES: Record<string, { motion: string; firstMs: (theme: Theme, props: Record<string, unknown>) => number }> = {
  Headline: { motion: "motion", firstMs: (theme) => theme.motion.leadMs },
  TitleCard: {
    motion: "titleMotion",
    firstMs: (theme, props) => {
      const step = theme.motion["text.in"].lineStaggerMs;
      return theme.motion.leadMs + (props.logo === undefined ? 0 : 2 * step) + (props.kicker === undefined ? 0 : step);
    },
  },
};

/**
 * One warning per line (of a Headline or TitleCard, top-level or nested) that
 * lands after the scene starts to leave. `durations` are the scenes' lengths in
 * ms; `narration` the spoken scenes' words on the audio clock. A number cue
 * inside a delayed slot is taken on the scene clock, so it may land a little later.
 */
export function headlineLineWarnings(storyboard: Storyboard, theme: Theme, durations: Record<string, number>, narration: Record<string, { words: TimedWord[] }>): string[] {
  const outMs = theme.motion["text.out"].ms;
  return storyboard.scenes.flatMap((scene) => {
    const durationMs = durations[scene.id];
    if (durationMs === undefined) return [];
    const endMs = durationMs - 1000 / storyboard.fps;
    const words = scene.narration === undefined ? [] : sceneWords(theme, scene.narration, endMs, narration[scene.id]?.words);
    const leaveMs = endMs - outMs;
    return sceneComponents(scene).flatMap(({ component, props }) => {
      const takes = TAKES_LINES[component];
      if (takes === undefined || !Array.isArray(props.lines)) return [];
      const lines = props.lines as HeadlineLine[];
      const motion = props[takes.motion] as HeadlineMotion | undefined;
      const say = (message: string) => `warn [headline-lines] scene "${scene.id}": ${component} ${message}`;
      let starts: number[];
      try {
        const cues = lines.map((line) => (line.at === undefined ? undefined : resolveCue(line.at, words, Number.NaN)));
        starts = lineStarts(
          theme,
          lines.map((line) => line.text),
          cues.map((ms) => (ms === undefined || Number.isNaN(ms) ? undefined : ms)),
          takes.firstMs(theme, props),
          motion,
        );
      } catch (error) {
        return [say(error instanceof Error ? error.message : String(error))];
      }
      return starts.flatMap((start, i) => {
        const { landed } = headlineTiming(theme, headlineWords(lines[i]!.text), start, motion);
        if (landed <= leaveMs) return [];
        return [
          say(
            `lines[${i}] starts at ${Math.round(start)} ms and lands at ${Math.round(landed)} ms, after the scene starts to leave at ${Math.round(leaveMs)} ms; cue it earlier or lengthen the scene`,
          ),
        ];
      });
    });
  });
}
