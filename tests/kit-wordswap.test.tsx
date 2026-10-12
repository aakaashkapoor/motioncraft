// WordSwap: one held sentence whose masked word slot rolls through options
// and settles on the last, the prefix and suffix still and the slot sized to
// the widest option so the line never reflows.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, SceneClockContext, WordSwap, lightTheme, wordSwapCues, wordSwapErrors, wordSwapLayout, type Aspect, type WordSwapProps } from "../src/index";

const FPS = 30;
const FRAMES = 150;
const msOf = (frame: number) => (frame * 1000) / FPS;
const frameAt = (ms: number) => Math.ceil((ms * FPS) / 1000);
/** How long one swap rolls. */
const SWAP_MS = 350;

type Props = Omit<WordSwapProps, "progress" | "theme" | "aspect">;

function draw(props: Props, frame: number, aspect: Aspect = "9:16", frames = FRAMES): string {
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames }}>
      <WordSwap {...props} progress={frame / (frames - 1)} theme={lightTheme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
}

const slotWidth = (html: string) => Number(/data-wordswap-slot=""[^>]*?width:([\d.]+)px/.exec(html)![1]);
/** The words drawn in the slot, with their vertical offset in px. */
const words = (html: string) =>
  [...html.matchAll(/<span data-wordswap-word="\d+" style="([^"]*)">([^<]*)<\/span>/g)].map(([, style, text]) => ({
    text: text!,
    y: Number(/translateY\((-?[\d.]+)px\)/.exec(style!)?.[1] ?? 0),
  }));
/** The word the slot shows at rest: the only one drawn, sitting at 0. */
const shown = (html: string) => {
  const drawn = words(html);
  return drawn.length === 1 && drawn[0]!.y === 0 ? drawn[0]!.text : undefined;
};
const piece = (html: string, name: "prefix" | "suffix") => new RegExp(`<span data-wordswap-${name}=""[^>]*>[^<]*</span>`).exec(html)?.[0];

const SHIP: Props = { prefix: "Ship", options: ["faster", "smarter", "together"] };
const SUFFIX: Props = { prefix: "Built for", options: ["teams", "launches", "everyone"], suffix: "today" };

describe("WordSwap", () => {
  it("draws the same frame identically twice", () => {
    for (const frame of [0, 10, 25, 40, 90]) expect(draw(SUFFIX, frame)).toBe(draw(SUFFIX, frame));
  });

  it.each(ASPECTS)("sizes the slot to the widest option's estimated width on every frame (%s)", (aspect) => {
    const layout = wordSwapLayout(lightTheme, aspect, SHIP.prefix, SHIP.options, SHIP.suffix);
    const widest = Math.max(...SHIP.options.map((o) => layout.wordWidth(o)));
    expect(layout.slotWidth).toBe(widest);
    expect(layout.wordWidth("together")).toBe(widest);
    for (let frame = 0; frame < FRAMES; frame++) expect(slotWidth(draw(SHIP, frame, aspect))).toBe(widest);
  });

  it("shows the first option, then each option after its cue, the last holding to the exit", () => {
    const cues = wordSwapCues(lightTheme, SHIP.options.length, msOf(FRAMES - 1));
    expect(cues).toHaveLength(2);
    expect(shown(draw(SHIP, frameAt(lightTheme.motion.leadMs + 10)))).toBe("faster");
    expect(shown(draw(SHIP, frameAt(cues[0]!) - 1))).toBe("faster");
    expect(shown(draw(SHIP, frameAt(cues[0]! + SWAP_MS)))).toBe("smarter");
    expect(shown(draw(SHIP, frameAt(cues[1]!) - 1))).toBe("smarter");
    for (let frame = frameAt(cues[1]! + SWAP_MS); frame < FRAMES; frame++) expect(shown(draw(SHIP, frame))).toBe("together");
  });

  it("rolls the outgoing word up and the next in from below while it swaps", () => {
    const cues = wordSwapCues(lightTheme, SHIP.options.length, msOf(FRAMES - 1));
    const mid = words(draw(SHIP, frameAt(cues[0]! + SWAP_MS / 2)));
    expect(mid.map((w) => w.text)).toEqual(["faster", "smarter"]);
    expect(mid[0]!.y).toBeLessThan(0);
    expect(mid[1]!.y).toBeGreaterThan(0);
    expect(draw(SHIP, frameAt(cues[0]! + SWAP_MS / 2))).toMatch(/feGaussianBlur stdDeviation="0 [\d.]+"/);
  });

  it("lands the last option on the default schedule by 60% of the scene, at least 450 ms apart", () => {
    for (const endMs of [3000, 5000, 9000]) {
      for (const count of [2, 3, 6]) {
        const cues = wordSwapCues(lightTheme, count, endMs);
        expect(cues).toHaveLength(count - 1);
        expect(cues[0]).toBeGreaterThanOrEqual(lightTheme.motion.leadMs + lightTheme.motion.enter.ms);
        cues.slice(1).forEach((c, i) => expect(c - cues[i]!).toBeGreaterThanOrEqual(450 - 1e-9));
        const fast = cues[0]! + (count - 2) * 450 + SWAP_MS;
        expect(cues.at(-1)! + SWAP_MS).toBeLessThanOrEqual(Math.max(endMs * 0.6, fast) + 1e-9);
      }
    }
    // A long scene spreads the swaps out.
    expect(wordSwapCues(lightTheme, 3, 9000).at(-1)! + SWAP_MS).toBeCloseTo(9000 * 0.6);
  });

  it("never moves the prefix or the suffix", () => {
    const prefix = new Set<string | undefined>();
    const suffix = new Set<string | undefined>();
    for (let frame = 0; frame < FRAMES; frame++) {
      const html = draw(SUFFIX, frame);
      prefix.add(piece(html, "prefix"));
      suffix.add(piece(html, "suffix"));
    }
    expect([...prefix]).toHaveLength(1);
    expect([...suffix]).toHaveLength(1);
    expect([...prefix][0]).toContain("Built for");
    expect([...suffix][0]).toContain("today");
    // Once the line has arrived, everything but the slot's words is still until the exit.
    const strip = (html: string) => html.replace(/<span data-wordswap-slot=""[\s\S]*?<\/span><\/span>/, "").replace(/<svg[\s\S]*?<\/svg>/, "");
    const arrived = frameAt(lightTheme.motion.leadMs + lightTheme.motion.enter.ms);
    for (let frame = arrived; frame < FRAMES - 20; frame++) expect(strip(draw(SUFFIX, frame))).toBe(strip(draw(SUFFIX, arrived)));
  });

  it("swaps on cuesMs when given", () => {
    const props: Props = { ...SHIP, cuesMs: [1000, 2500] };
    expect(shown(draw(props, frameAt(960)))).toBe("faster");
    expect(shown(draw(props, frameAt(1000 + SWAP_MS)))).toBe("smarter");
    expect(shown(draw(props, frameAt(2460)))).toBe("smarter");
    expect(shown(draw(props, frameAt(2500 + SWAP_MS)))).toBe("together");
    // The same cues in a longer scene: the same swaps.
    expect(shown(draw(props, frameAt(2460), "9:16", 300))).toBe("smarter");
  });

  it("pulses the final word once as it lands, then rests", () => {
    const cues = wordSwapCues(lightTheme, SHIP.options.length, msOf(FRAMES - 1));
    const scales = Array.from({ length: 30 }, (_, k) => /data-wordswap-word="2" style="[^"]*scale\(([\d.]+)\)/.exec(draw(SHIP, frameAt(cues[1]! + SWAP_MS) + k))?.[1]);
    expect(scales.some((s) => s !== undefined && Number(s) > 1)).toBe(true);
    expect(scales.at(-1)).toBeUndefined();
  });

  it("rejects 1 or 7 options, empty options and bad cues", () => {
    expect(() => draw({ options: ["one"] }, 0)).toThrow(/options/);
    expect(() => draw({ options: ["a", "b", "c", "d", "e", "f", "g"] }, 0)).toThrow(/options/);
    expect(wordSwapErrors({ options: ["a", " "] })).not.toEqual([]);
    expect(wordSwapErrors({ options: ["a", "b", "c"], cuesMs: [500] })).not.toEqual([]);
    expect(wordSwapErrors({ options: ["a", "b", "c"], cuesMs: [900, 500] })).not.toEqual([]);
    expect(wordSwapErrors({ options: ["a", "b", "c"], cuesMs: [500, 900] })).toEqual([]);
    expect(wordSwapErrors({ options: ["a", "b"], prefix: 3 })).not.toEqual([]);
  });

  it.each(ASPECTS)("keeps a long line on one line inside the text column (%s)", (aspect) => {
    const layout = wordSwapLayout(lightTheme, aspect, "Every frame you render is", ["checked", "deterministic"], "by default");
    expect(layout.lineWidth).toBeLessThanOrEqual(layout.box.width);
    expect(layout.fitted).toBe(true);
  });
});
