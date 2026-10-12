// WordSwap fits its line to the word it shows: the slot's width follows each
// word as it swaps, so a short last word leaves no hole, and the line is set
// in the largest hero, display or headline step that fits its column.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, SceneClockContext, WordSwap, lightTheme, textColumn, type Aspect, type WordSwapProps } from "../src/index";
import { WORD_SWAP_MS, wordSwapEm, wordSwapLayout, wordSwapLine, wordSwapSlotWidth } from "../src/kit/WordSwap";

const FPS = 30;
const FRAMES = 150;
const msOf = (frame: number) => (frame * 1000) / FPS;
const frameAt = (ms: number) => Math.ceil((ms * FPS) / 1000);

type Props = Omit<WordSwapProps, "progress" | "theme" | "aspect">;

function draw(props: Props, frame: number, aspect: Aspect): string {
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames: FRAMES }}>
      <WordSwap {...props} progress={frame / (FRAMES - 1)} theme={lightTheme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
}

/** The width the slot takes in the line: its mask's width less the negative margins either side. */
function footprint(html: string): number {
  const style = /data-wordswap-slot=""[^>]*?style="([^"]*)"/.exec(html)![1]!;
  const width = Number(/(?:^|;)width:([\d.]+)px/.exec(style)![1]);
  const left = Number(/margin-left:(-?[\d.]+)px/.exec(style)?.[1] ?? 0);
  const right = Number(/margin-right:(-?[\d.]+)px/.exec(style)?.[1] ?? 0);
  return Math.round((width + left + right) * 100) / 100;
}

const SPLIT: Props = { prefix: "Split", options: ["dinners", "trips", "rent"], cuesMs: [1000, 2000] };
const BUILT: Props = { prefix: "Built for", options: ["teams", "launches", "everyone"], suffix: "today", cuesMs: [1000, 2000] };
const SHIP: Props = { prefix: "Ship", options: ["faster", "smarter", "together"] };

/** The gap between the line's pieces, in em. */
const GAP_EM = 0.26;

/** A frame well after the last swap and its pulse, before the exit. */
const SETTLED = frameAt(2000 + WORD_SWAP_MS + lightTheme.motion.pop.ms + 300);

describe("WordSwap fits the slot to the word it shows", () => {
  it.each(ASPECTS)("settles to prefix + the last word + suffix with plain gaps, no hole (%s)", (aspect) => {
    for (const props of [SPLIT, BUILT]) {
      const layout = wordSwapLayout(lightTheme, aspect, props.prefix, props.options, props.suffix);
      const last = props.options.at(-1)!;
      const html = draw(props, SETTLED, aspect);
      expect(footprint(html)).toBe(layout.wordWidth(last));
      const line = wordSwapLine(layout, props.prefix, props.suffix, footprint(html));
      const pieces = [props.prefix, last, props.suffix].filter((p): p is string => p !== undefined);
      const expected = pieces.reduce((sum, p) => sum + layout.wordWidth(p), 0) + (pieces.length - 1) * layout.gap;
      expect(line.lineWidth).toBeCloseTo(expected, 6);
      // Narrower than the line pre-sized to the widest option, when the last word is not the widest.
      if (layout.wordWidth(last) < layout.slotWidth) expect(line.lineWidth).toBeLessThan(layout.lineWidth);
    }
  });

  it.each(ASPECTS)("shows the first word at its own width before the first swap (%s)", (aspect) => {
    const layout = wordSwapLayout(lightTheme, aspect, SPLIT.prefix, SPLIT.options, SPLIT.suffix);
    expect(footprint(draw(SPLIT, frameAt(800), aspect))).toBe(layout.wordWidth("dinners"));
  });

  it.each(ASPECTS)("moves the prefix and suffix only during a swap (%s)", (aspect) => {
    const layout = wordSwapLayout(lightTheme, aspect, BUILT.prefix, BUILT.options, BUILT.suffix);
    const xs = (ms: number) => {
      const { prefixX, suffixX } = wordSwapLine(layout, BUILT.prefix, BUILT.suffix, footprint(draw(BUILT, frameAt(ms), aspect)));
      return [prefixX, suffixX];
    };
    // Two frames inside each hold: the same.
    const holds = [
      [600, 960],
      [1400, 1960],
      [2400, 3200],
    ].map(([a, b]) => {
      expect(xs(a!)).toEqual(xs(b!));
      return xs(a!);
    });
    // Mid-swap: between the holds on either side.
    for (const [i, cue] of [1000, 2000].entries()) {
      const mid = xs(cue + WORD_SWAP_MS / 2);
      const [before, after] = [holds[i]!, holds[i + 1]!];
      expect(mid).not.toEqual(before);
      expect(mid).not.toEqual(after);
      for (const k of [0, 1]) {
        expect(mid[k]!).toBeGreaterThanOrEqual(Math.min(before[k]!, after[k]!) - 1e-9);
        expect(mid[k]!).toBeLessThanOrEqual(Math.max(before[k]!, after[k]!) + 1e-9);
      }
    }
  });

  it("keeps the line centred on the box as the slot changes", () => {
    const layout = wordSwapLayout(lightTheme, "9:16", BUILT.prefix, BUILT.options, BUILT.suffix);
    for (const width of [layout.wordWidth("teams"), layout.wordWidth("everyone")]) {
      const line = wordSwapLine(layout, BUILT.prefix, BUILT.suffix, width);
      const left = line.prefixX - layout.box.x;
      const right = layout.box.x + layout.box.width - (line.suffixX + layout.wordWidth("today"));
      expect(left).toBeCloseTo(right, 6);
      expect(line.slotX).toBeCloseTo(line.prefixX + layout.wordWidth("Built for") + layout.gap, 6);
    }
  });

  it("eases the slot from one word's width to the next over the swap", () => {
    const layout = wordSwapLayout(lightTheme, "9:16", SPLIT.prefix, SPLIT.options, SPLIT.suffix);
    const at = (ms: number) => wordSwapSlotWidth(layout, SPLIT.options, SPLIT.cuesMs!, ms);
    expect(at(999)).toBe(layout.wordWidth("dinners"));
    expect(at(1000 + WORD_SWAP_MS)).toBe(layout.wordWidth("trips"));
    const mid = at(1000 + WORD_SWAP_MS / 2);
    expect(mid).toBeLessThan(layout.wordWidth("dinners"));
    expect(mid).toBeGreaterThan(layout.wordWidth("trips"));
    // Monotonic through the swap.
    const samples = Array.from({ length: 11 }, (_, k) => at(1000 + (k * WORD_SWAP_MS) / 10));
    samples.slice(1).forEach((w, k) => expect(w).toBeLessThanOrEqual(samples[k]!));
  });
});

describe("WordSwap sets a hero line in the largest step that fits", () => {
  const steps = ["hero", "display", "headline"] as const;

  it.each(ASPECTS)("uses a hero, display or headline ramp step and fits the text column (%s)", (aspect) => {
    const column = textColumn(lightTheme, aspect).width;
    for (const props of [SPLIT, BUILT, SHIP]) {
      const layout = wordSwapLayout(lightTheme, aspect, props.prefix, props.options, props.suffix);
      expect(steps).toContain(layout.role);
      expect(layout.lineWidth).toBeLessThanOrEqual(column);
      expect(layout.box.width).toBeLessThanOrEqual(column);
      if (layout.fitted) {
        // Fits no step: the headline step, shrunk to the column.
        expect(layout.role).toBe("headline");
        expect(layout.size).toBeLessThan(lightTheme.type.headline[aspect].size);
        continue;
      }
      expect(layout.size).toBe(lightTheme.type[layout.role][aspect].size);
      // The next step up would not fit.
      const index = steps.indexOf(layout.role as (typeof steps)[number]);
      if (index > 0) {
        const bigger = lightTheme.type[steps[index - 1]!][aspect];
        const em = (t: string) => wordSwapEm(t, bigger.tracking);
        const pieces = [props.prefix, props.suffix].filter((p): p is string => p !== undefined);
        const ems = pieces.reduce((sum, p) => sum + em(p), Math.max(...props.options.map(em))) + pieces.length * GAP_EM;
        expect(ems * bigger.size).toBeGreaterThan(column - (pieces.length + 2));
      }
      // The markup is set at that size and step weight.
      const html = draw(props, SETTLED, aspect);
      expect(html).toContain(`font-size:${layout.size}px`);
      expect(html).toContain(`font-weight:${lightTheme.type[layout.role][aspect].weight}`);
    }
  });

  it.each(["9:16", "16:9"] as const)("sets a short line larger than the headline step (%s)", (aspect) => {
    for (const props of [SPLIT, SHIP]) {
      const layout = wordSwapLayout(lightTheme, aspect, props.prefix, props.options, props.suffix);
      expect(layout.size).toBeGreaterThan(lightTheme.type.headline[aspect].size);
    }
  });
});
