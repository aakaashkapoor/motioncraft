// BeforeAfter: the before layer arrives and holds, a divider wipes the after
// layer over it to ~85% and settles back to the split, labels mark each half.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BeforeAfter, SceneClockContext, beforeAfterLayout, beforeAfterSplit, beforeAfterTiming, lightTheme, type Aspect, type BeforeAfterProps } from "../src/index";

const FPS = 30;
const FRAMES = 150;
const msOf = (frame: number) => (frame * 1000) / FPS;

type Props = Omit<BeforeAfterProps, "progress" | "theme" | "aspect">;

const SAMPLE: Props = {
  before: { component: "StepList", props: { title: "Before", items: ["Write it by hand", "Wait for review"] } },
  after: { component: "StepList", props: { title: "After", items: ["Describe it", "Render"] } },
};

function draw(props: Props, frame: number, aspect: Aspect = "9:16"): string {
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames: FRAMES }}>
      <BeforeAfter {...props} progress={frame / (FRAMES - 1)} theme={lightTheme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
}

const clipOf = (html: string) => /data-before-after-layer="after"[^>]*?clip-path:([^;"]*)/.exec(html)?.[1]?.trim();
const opacityOf = (html: string, attribute: string) => Number(new RegExp(`${attribute}[^>]*?opacity:([\\d.]+)`).exec(html)?.[1] ?? "1");

/** A frame in the hold: the wipe has landed, the exit has not begun. */
const HOLD = Math.ceil((beforeAfterTiming(lightTheme).settledMs * FPS) / 1000) + 3;

describe("BeforeAfter", () => {
  it("the after layer's clip on the hold frame matches split", () => {
    expect(clipOf(draw(SAMPLE, HOLD, "16:9"))).toBe("inset(0 50% 0 0)");
    expect(clipOf(draw({ ...SAMPLE, split: 0.3 }, HOLD, "16:9"))).toBe("inset(0 70% 0 0)");
    expect(clipOf(draw({ ...SAMPLE, split: 0.65 }, HOLD, "9:16"))).toBe("inset(0 0 35% 0)");
  });

  it("shows only the before layer at frame 0", () => {
    const html = draw(SAMPLE, 0, "16:9");
    expect(clipOf(html)).toBe("inset(0 100% 0 0)");
    expect(opacityOf(html, "data-before-after-divider")).toBe(0);
    expect(opacityOf(html, 'data-before-after-chip="after"')).toBe(0);
  });

  it("sweeps past the split before settling back to it", () => {
    const { wipeMs, sweepMs, settledMs } = beforeAfterTiming(lightTheme);
    expect(wipeMs).toBeGreaterThanOrEqual(lightTheme.motion.leadMs + 500);
    expect(beforeAfterSplit(lightTheme, wipeMs, 0.5)).toBe(0);
    expect(beforeAfterSplit(lightTheme, wipeMs + sweepMs, 0.5)).toBeCloseTo(0.85);
    expect(beforeAfterSplit(lightTheme, settledMs, 0.5)).toBe(0.5);
    expect(beforeAfterSplit(lightTheme, settledMs + 5000, 0.5)).toBe(0.5);
    expect(beforeAfterTiming(lightTheme).settledMs).toBeLessThanOrEqual(2400);
    // Monotonic out to the overshoot, then back.
    let last = 0;
    for (let ms = wipeMs; ms <= wipeMs + sweepMs; ms += 33) {
      const s = beforeAfterSplit(lightTheme, ms, 0.5);
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });

  it("renders both nested components", () => {
    const html = draw(SAMPLE, HOLD);
    expect(html).toContain("Write it by hand");
    expect(html).toContain("Describe it");
    expect(html).toContain('data-before-after-layer="before"');
    expect(html).toContain('data-before-after-layer="after"');
  });

  it("lays components out in their own half, but lets media share the whole card", () => {
    const layout = beforeAfterLayout(lightTheme, "16:9", "horizontal", 0.5);
    const middle = layout.card.x + layout.card.width / 2;
    expect(layout.halves.after.x + layout.halves.after.width).toBeLessThan(middle);
    expect(layout.halves.before.x).toBeGreaterThan(middle);
    const images: Props = { before: { component: "Image", props: { src: "a.png" } }, after: { component: "Image", props: { src: "b.png" } } };
    const boxes = [...draw(images, HOLD, "16:9").matchAll(/data-before-after-slot=""[^>]*?style="position:absolute;left:0;top:0;width:([\d.]+)px;height:([\d.]+)px/g)];
    expect(boxes).toHaveLength(2);
    expect(Number(boxes[0]![1])).toBe(layout.media.width);
  });

  it("labels each half, with defaults", () => {
    expect(draw(SAMPLE, HOLD)).toMatch(/data-before-after-chip="before"[^>]*>Before</);
    expect(draw(SAMPLE, HOLD)).toMatch(/data-before-after-chip="after"[^>]*>After</);
    const html = draw({ ...SAMPLE, beforeLabel: "v1", afterLabel: "v2" }, HOLD);
    expect(html).toMatch(/data-before-after-chip="before"[^>]*>v1</);
    expect(html).toMatch(/data-before-after-chip="after"[^>]*>v2</);
  });

  it.each([0.1, 0.19, 0.81, 1, Number.NaN])("throws on split %s", (split) => {
    expect(() => draw({ ...SAMPLE, split }, 0)).toThrow(/BeforeAfter: split/);
  });

  it("accepts the ends of the split range", () => {
    expect(clipOf(draw({ ...SAMPLE, split: 0.2 }, HOLD, "16:9"))).toBe("inset(0 80% 0 0)");
    expect(clipOf(draw({ ...SAMPLE, split: 0.8 }, HOLD, "16:9"))).toBe("inset(0 20% 0 0)");
  });

  it("throws on a missing slot, an unknown component or a bad direction", () => {
    expect(() => draw({ ...SAMPLE, before: undefined as never }, 0)).toThrow(/BeforeAfter: before/);
    expect(() => draw({ ...SAMPLE, after: { component: "Nope" } }, 0)).toThrow(/BeforeAfter: after/);
    expect(() => draw({ ...SAMPLE, direction: "diagonal" as never }, 0)).toThrow(/BeforeAfter: direction/);
  });

  it("defaults direction per aspect: horizontal in 16:9, vertical in 9:16", () => {
    expect(draw(SAMPLE, HOLD, "16:9")).toContain('data-before-after="horizontal"');
    expect(draw(SAMPLE, HOLD, "9:16")).toContain('data-before-after="vertical"');
    expect(draw({ ...SAMPLE, direction: "horizontal" }, HOLD, "9:16")).toContain('data-before-after="horizontal"');
    expect(clipOf(draw({ ...SAMPLE, direction: "vertical" }, HOLD, "16:9"))).toBe("inset(0 0 50% 0)");
  });

  it("holds still between the landing and the exit", () => {
    // Past the nested lists' own entrances (2.4 s at most), well before the exit.
    expect(draw(SAMPLE, 100)).toBe(draw(SAMPLE, 75));
    expect(msOf(HOLD)).toBeLessThan(2400);
  });
});
