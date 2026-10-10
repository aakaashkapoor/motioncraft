// Design v3, section D: every kit component times its motion in milliseconds
// from the scene clock, so a scene's length decides only how long the hold
// lasts. Each component is drawn frame by frame in a 3 s and a 9 s scene: its
// entrance must play identically and finish at the same ms in both, start at
// 100-200 ms, and its exit must land on the last frame of each.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SceneClockContext, kit, lightTheme, type Aspect } from "../src/index";

const FPS = 30;
const SHORT = 90;
const LONG = 270;
const msOf = (frame: number) => (frame * 1000) / FPS;

const CARDS = [
  { icon: "chat", title: "Prompt", subtitle: "Describe it" },
  { icon: "code", title: "Plan", subtitle: "Scenes" },
  { icon: "check", title: "Check", subtitle: "Layout" },
  { icon: "play", title: "Render", subtitle: "MP4" },
];

/** Props for every component in the kit, small enough to play out in 3 s. */
const SAMPLES: Record<string, Record<string, unknown>> = {
  TitleCard: { kicker: "motioncraft", title: "Videos from a prompt", subtitle: "Every frame is code" },
  Caption: { text: "A one-line prompt becomes a plan." },
  BigNumber: { value: 1280, suffix: "+", label: "videos rendered" },
  FlowDiagram: { nodes: ["Prompt", "Plan", "Render"], caption: "Three steps" },
  StepList: { title: "How it works", items: ["Write the prompt", "Check the plan", "Render"], highlight: 1 },
  Section: {
    eyebrow: "How it works",
    headline: "Three steps to a video",
    content: { component: "CardRow", props: { cards: CARDS.slice(0, 3) } },
    note: "All on your machine",
  },
  AppWindow: { title: "Plan", content: { component: "StepList", props: { items: ["Hook", "Steps", "Ending"] } } },
  BrowserWindow: { url: "https://example.com/docs", content: { component: "TitleCard", props: { title: "Docs" } } },
  TerminalWindow: { lines: [{ prompt: true, text: "npm run render" }, { text: "done in 4.2s" }] },
  CodeWindow: { code: "const a = 1;\nconst b = 2;\nexport { a, b };", highlightLines: [2], reveal: true },
  ChatWindow: {
    channel: "releases",
    messages: [
      { author: "Maya Chen", time: "9:41", text: "Is the intro ready?" },
      { author: "Render Bot", time: "9:42", text: "Rendered in 4.2 s", badge: "APP" },
    ],
  },
  Arrow: { from: { x: 240, y: 500 }, to: { x: 820, y: 1000 }, curve: 0.3, label: "next" },
  Card: { icon: "chat", title: "The prompt", subtitle: "A launch intro", highlighted: true },
  CardRow: { cards: CARDS, highlight: 2 },
  FeatureList: {
    title: "Why it works",
    items: [
      { icon: "shield", text: "Runs locally" },
      { icon: "code", text: "Code-drawn frames" },
      { icon: "check", text: "Checked layouts" },
    ],
  },
  VideoClip: { src: "clips/demo.mp4" },
  Image: { src: "photos/hero.png" },
  Pinned: {
    pinned: { component: "AppWindow", props: { title: "Plan", shareId: "plan" } },
    content: { component: "CardRow", props: { cards: CARDS.slice(0, 3) } },
  },
  Handoff: {
    from: { component: "Card", props: { icon: "chat", title: "The prompt" } },
    to: { component: "AppWindow", props: { title: "Plan", content: { component: "StepList", props: { items: ["Hook", "Steps"] } } } },
    label: "plan",
  },
  Headline: { text: "Videos from a prompt", motion: "words", emphasis: "prompt", mark: "Videos" },
  SceneFrame: {
    eyebrow: "How it works",
    headline: "Three steps to a video",
    content: { component: "CardRow", props: { cards: CARDS.slice(0, 3) } },
    footer: "All on your machine",
    mark: "video",
  },
  PromptCard: { text: "A launch video", shareId: "prompt" },
  EndCard: { name: "motioncraft", line: "Prompt in, video out", accent: "Open source", card: { component: "PromptCard", props: { text: "A launch video", typed: false } } },
};

/** Media fill the frame from the first frame: no entrance, no exit. */
const STILL = new Set(["VideoClip", "Image"]);

/**
 * Life, not entrance: the idle caret blinks for as long as the terminal (or a
 * typed prompt) is on screen, a drawn connector's dot flows, lighting nodes, until the exit, and
 * the caption lights each word as the narration, spread over the scene, says it.
 */
const normalize = (html: string) =>
  html
    .replace(/(data-terminal-caret="\d+" style="[^"]*?)opacity:[^;"]*;?/g, "$1")
    .replace(/(data-prompt-caret="" style="[^"]*?)opacity:[^;"]*;?/g, "$1")
    .replace(/(<g data-flow-dot="")[^>]*>/g, "$1>")
    .replace(/(data-flow-glow="" style="[^"]*?)opacity:[^;"]*;?/g, "$1")
    .replace(/(data-caption-word="\d+" style=")[^"]*"/g, '$1"');

function draw(name: string, aspect: Aspect, frames: number, frame: number): string {
  const Component = kit[name]!;
  const html = renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames }}>
      {/* `progress` is what the page passes alongside the clock; the clock wins. */}
      <Component {...SAMPLES[name]} progress={frame / (frames - 1)} theme={lightTheme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
  return normalize(html);
}

/** The last frame before the exit can begin in the 3 s scene: the exit token's longest, plus a frame. */
const HOLD_END = Math.floor((msOf(SHORT - 1) - lightTheme.motion.exit.maxMs) / msOf(1)) - 1;

/** The first frame from which the markup no longer changes, up to `last`. */
function settledAt(frames: string[], last: number): number {
  let settled = last;
  while (settled > 0 && frames[settled - 1] === frames[last]) settled--;
  return settled;
}

describe("kit motion runs on the scene clock", () => {
  it("has a sample for every component in the kit", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(Object.keys(kit).sort());
  });

  describe.each(["9:16", "16:9"] as const)("%s", (aspect) => {
    it.each(Object.keys(kit))("%s plays its entrance identically in a 3 s and a 9 s scene", (name) => {
      const short = Array.from({ length: HOLD_END + 1 }, (_, f) => draw(name, aspect, SHORT, f));
      const long = Array.from({ length: HOLD_END + 1 }, (_, f) => draw(name, aspect, LONG, f));
      for (let f = 0; f <= HOLD_END; f++) {
        if (short[f] !== long[f]) throw new Error(`${name} differs at ${msOf(f).toFixed(0)} ms (frame ${f}) between a 3 s and a 9 s scene`);
      }
      if (STILL.has(name)) return;
      // The long scene holds much longer; its entrance must end at the same ms.
      const longHold = Array.from({ length: LONG - SHORT }, (_, i) => draw(name, aspect, LONG, HOLD_END + 1 + i));
      expect(longHold.every((html) => html === long[HOLD_END]), `${name} still moves after ${msOf(HOLD_END).toFixed(0)} ms in a 9 s scene`).toBe(true);
      const settled = settledAt(short, HOLD_END);
      expect(settledAt(long, HOLD_END)).toBe(settled);
      expect(msOf(settled), `${name} is still entering at ${msOf(settled).toFixed(0)} ms`).toBeLessThanOrEqual(2400);
    });

    it.each(Object.keys(kit).filter((name) => !STILL.has(name)))("%s makes its first move at 100-200 ms", (name) => {
      const first = draw(name, aspect, SHORT, 0);
      const moved = Array.from({ length: 10 }, (_, f) => draw(name, aspect, SHORT, f) !== first).indexOf(true);
      expect(moved, `${name} does not move in its first 300 ms`).toBeGreaterThan(0);
      expect(msOf(moved)).toBeGreaterThanOrEqual(100);
      expect(msOf(moved)).toBeLessThanOrEqual(200 + 1000 / FPS);
    });

    it.each(Object.keys(kit).filter((name) => !STILL.has(name)))("%s exits fast and lands on the last frame of either scene", (name) => {
      const tail = 16;
      for (let k = 0; k < tail; k++) {
        const short = draw(name, aspect, SHORT, SHORT - 1 - k);
        const long = draw(name, aspect, LONG, LONG - 1 - k);
        if (short !== long) throw new Error(`${name} differs ${k} frames before the end of a 3 s and a 9 s scene`);
      }
      expect(draw(name, aspect, SHORT, SHORT - 1)).not.toBe(draw(name, aspect, SHORT, HOLD_END));
      // Gone by the end: no exit runs longer than the token allows.
      expect(draw(name, aspect, SHORT, SHORT - 1 - tail)).toBe(draw(name, aspect, SHORT, HOLD_END));
    });
  });
});

describe("no progress-fraction timing in src/kit", () => {
  const dir = join(__dirname, "..", "src", "kit");
  const sources = readdirSync(dir)
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => ({ file, code: readFileSync(join(dir, file), "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "") }));

  it("reads scene progress only to hand it on, to find the scene time, or for whole-scene motion", () => {
    // The clock's fallback, caption pages (they share the scene) and the Ken Burns zoom (it spans the scene).
    const wholeScene = new Set(["frameContext.ts", "captionPages.ts", "Image.tsx"]);
    const allowed = [
      /\bprogress[,}:]/, // destructured from props, or a prop type
      /progress=\{progress\}/, // handed to a nested component
      /useSceneTime\(progress\)/,
      /pageAt\(.*,\s*progress\)/, // caption pages share the whole scene
      /progress:\s*number/,
    ];
    const offending = sources
      .filter(({ file }) => !wholeScene.has(file))
      .flatMap(({ file, code }) =>
        code
          .split("\n")
          .filter((line) => /\bprogress\b/.test(line))
          .filter((line) => !allowed.some((pattern) => pattern.test(line)))
          .map((line) => `${file}: ${line.trim()}`),
      );
    expect(offending).toEqual([]);
  });

  it("has no entrance or exit constants that are fractions of the scene", () => {
    const timing = /^(?:[A-Z]+_)*(?:ENTER|EXIT|DONE|FADE|DELAY|SPAN|WINDOW|SETTLED|PROGRESS|REVEAL|START|END|FROM|TO|SLOT|BLINKS)(?:_[A-Z]+)*$/;
    const geometry = /(?:^|_)(?:SCALE|EM|PX|OPACITY|RATIO|SHARE|WIDTH|HEIGHT)(?:_|$)/;
    const offending = sources.flatMap(({ file, code }) =>
      [...code.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=\s*(\[[^\]]*\]|-?\d*\.\d+|\d+)/g)]
        .filter(([, name, value]) => timing.test(name!) && !geometry.test(name!) && /(^|[\s[,])0?\.\d/.test(value!))
        .map(([, name, value]) => `${file}: ${name} = ${value}`),
    );
    expect(offending).toEqual([]);
  });
});
