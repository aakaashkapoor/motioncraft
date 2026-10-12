// The render page gives each scene its narration words on the scene clock
// (`useSceneWords`): the voice's measured times after the scene's lead, or an
// even spread over the narration when no audio is cached.

import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTimeline, exitMs, kit, resolveTheme, type Storyboard } from "../src/index";
import { evenWordTimes, type TimedWord } from "../src/kit/captionWords";
import { useCueMs } from "../src/kit/cues";
import { useSceneWords } from "../src/kit/frameContext";
import { Frame } from "../src/render/page";

const NARRATION = "Split the bill in seconds.";
const PROBE = "SceneWordsProbe";

function SceneWordsProbe() {
  const words = useSceneWords();
  return <pre data-probe="">{JSON.stringify({ words, bill: useCueMs({ word: "bill" }, -1) })}</pre>;
}

beforeAll(() => {
  kit[PROBE] = SceneWordsProbe as (typeof kit)[string];
});
afterAll(() => {
  delete kit[PROBE];
});

const sb: Storyboard = {
  title: "Words",
  aspect: "9:16",
  fps: 30,
  theme: "light",
  captionStyle: "off",
  scenes: [
    { id: "a", component: PROBE, props: {}, narration: NARRATION, durationMs: 3000 },
    { id: "b", component: PROBE, props: {}, durationMs: 2000 },
  ],
};
const theme = resolveTheme(sb);
const timeline = buildTimeline(sb, {}, theme);

function probed(frame: number, narration?: Record<string, { words: TimedWord[] }>): Array<{ words: TimedWord[]; bill: number }> {
  const html = renderToStaticMarkup(<Frame storyboard={sb} theme={theme} timeline={timeline} frame={frame} narration={narration} />);
  return [...html.matchAll(/<pre data-probe="">([^<]*)<\/pre>/g)].map((m) => JSON.parse(m[1]!.replaceAll("&quot;", '"')));
}

const measured: TimedWord[] = NARRATION.split(" ").map((text, i) => ({ text, startMs: 50 + i * 300, endMs: 50 + i * 300 + 250 }));

describe("SceneWordsContext on the render page", () => {
  it("gives a scene its measured words, shifted onto the scene clock by the lead", () => {
    const [scene] = probed(10, { a: { words: measured } });
    const { leadMs } = theme.motion;
    expect(scene!.words).toEqual(measured.map((w) => ({ ...w, startMs: w.startMs + leadMs, endMs: w.endMs + leadMs })));
    expect(scene!.bill).toBe(50 + 2 * 300 + leadMs);
  });

  it("spreads the narration evenly when no audio is cached", () => {
    const [scene] = probed(10);
    const endMs = ((timeline.scenes[0]!.frames - 1) * 1000) / timeline.fps;
    const expected = evenWordTimes(NARRATION, theme.motion.leadMs, endMs - exitMs(theme, theme.motion.fx.ms));
    expect(scene!.words).toEqual(expected);
    expect(scene!.bill).toBe(expected[2]!.startMs);
  });

  it("falls back to the even spread when the measured words do not match the narration", () => {
    const [scene] = probed(10, { a: { words: measured.slice(0, 2) } });
    expect(scene!.words.map((w) => w.text)).toEqual(NARRATION.split(" "));
    expect(scene!.words[0]!.startMs).toBe(theme.motion.leadMs);
  });

  it("gives a scene without narration no words", () => {
    const last = timeline.totalFrames - 1;
    const scenes = probed(last);
    expect(scenes.at(-1)!.words).toEqual([]);
  });
});
