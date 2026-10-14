// GiantType: one word set so large it fills the frame edge to edge, its
// letters arriving (rise, tilt, scale or type), an optional accent rule, a
// kicker and a tag under it, and an optional component drawn in front of it.
// The word is set from measured font metrics, so its width is exact.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, SceneClockContext, contentArea, darkTheme, frameSize, kit, lightTheme, sectionLayout, type Aspect, type Rect } from "../src/index";
import { safeZones } from "../src/layout/safe";
import { GIANT_ENTRANCES, GIANT_STYLES, giantTypeEntrance, giantTypeErrors, giantTypeLayout, type GiantEntrance } from "../src/kit/giantTypePlan";

const FPS = 30;
const inside = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

const draw = (props: Record<string, unknown>, ms: number, aspect: Aspect = "16:9", frames = 120) => {
  const Component = kit.GiantType!;
  const frame = Math.round((ms * FPS) / 1000);
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames }}>
      <Component text="motioncraft" {...props} progress={frame / (frames - 1)} theme={darkTheme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
};

describe("props", () => {
  it("accepts 1-12 characters as one word or two short words, and the options", () => {
    expect(giantTypeErrors({ text: "motioncraft", style: "italic", entrance: "tilt", rule: true, kicker: "Prompt in, video out", tag: "Showreel 2026" })).toEqual([]);
    expect(giantTypeErrors({ text: "A" })).toEqual([]);
    expect(giantTypeErrors({ text: "x".repeat(12) })).toEqual([]);
    expect(giantTypeErrors({ text: "BIG IDEA" })).toEqual([]);
  });

  it("rejects bad props", () => {
    expect(giantTypeErrors({ text: "x".repeat(13) })).toHaveLength(1);
    expect(giantTypeErrors({ text: "" })).toHaveLength(1);
    expect(giantTypeErrors({ text: "ONE TWO SIX" })).toHaveLength(1);
    expect(giantTypeErrors({ text: " BOLD" })).toHaveLength(1);
    expect(giantTypeErrors({ text: "BÖLD" })).toHaveLength(1);
    expect(giantTypeErrors({ text: "BOLD", style: "thin" })).toHaveLength(1);
    expect(giantTypeErrors({ text: "BOLD", entrance: "spin" })).toHaveLength(1);
    expect(giantTypeErrors({ text: "BOLD", rule: "yes" })).toHaveLength(1);
    expect(giantTypeErrors({ text: "BOLD", kicker: "x".repeat(33) })).toHaveLength(1);
    expect(giantTypeErrors({ text: "BOLD", tag: "x".repeat(25) })).toHaveLength(1);
    expect(giantTypeErrors({ text: "BOLD", behind: { component: 3 } })).toHaveLength(1);
  });

  it("throws on 13 characters", () => {
    expect(() => draw({ text: "x".repeat(13) }, 500)).toThrow(/1-12 characters/);
  });
});

describe("size: the word fills 88-94% of the width, never wrapping", () => {
  /** Every aspect measures against the content area's width: in 9:16 that is the safe text column (840 px in shorts). */
  const target = (aspect: Aspect) => contentArea(lightTheme, aspect).width;

  for (const aspect of ASPECTS) {
    for (const text of ["motioncraft", "BOLD", "DIMENSION"]) {
      it.each(GIANT_STYLES)(`${text} in %s (${aspect})`, (style) => {
        const layout = giantTypeLayout(lightTheme, aspect, { text, style });
        expect(layout.target).toBe(target(aspect));
        const share = layout.inkWidth / layout.target;
        expect(share).toBeGreaterThanOrEqual(0.88);
        expect(share).toBeLessThanOrEqual(0.94);
        // Inside the safe area: in 9:16 the platform's UI covers the sides of the frame.
        const safe = safeZones(aspect, lightTheme.safe).area;
        expect(layout.inkLeft).toBeGreaterThanOrEqual(safe.x);
        expect(layout.inkLeft + layout.inkWidth).toBeLessThanOrEqual(safe.x + safe.width);
      });
    }
  }

  it("steps a 12-character word down instead of breaking it", () => {
    for (const aspect of ASPECTS) {
      const short = giantTypeLayout(lightTheme, aspect, { text: "BOLD" });
      const long = giantTypeLayout(lightTheme, aspect, { text: "MOTIONCRAFTS" });
      expect(long.size).toBeLessThan(short.size);
      expect(long.inkWidth / long.target).toBeGreaterThanOrEqual(0.88);
      expect(long.inkWidth / long.target).toBeLessThanOrEqual(0.94);
    }
  });

  it("measures 9:16 against the 840 px shorts text column, about 71% of the frame", () => {
    const layout = giantTypeLayout(lightTheme, "9:16", { text: "BOLD" });
    expect(layout.target).toBe(840);
    expect(layout.inkWidth / frameSize("9:16").width).toBeCloseTo(0.71, 1);
  });

  it("keeps the word, rule, kicker and tag inside the area, the word on one line", () => {
    for (const aspect of ASPECTS) {
      const area = contentArea(lightTheme, aspect);
      const layout = giantTypeLayout(lightTheme, aspect, { text: "motioncraft", rule: true, kicker: "Prompt in, video out", tag: "Showreel 2026" });
      expect(layout.box.y).toBeGreaterThanOrEqual(area.y);
      expect(layout.box.y + layout.box.height).toBeLessThanOrEqual(area.y + area.height);
      // The kicker and tag align to the word's edges, so the block's sides are inside the safe area too.
      expect(layout.box.x).toBeGreaterThanOrEqual(area.x);
      expect(layout.box.x + layout.box.width).toBeLessThanOrEqual(area.x + area.width);
      const html = draw({ rule: true, kicker: "Prompt in, video out", tag: "Showreel 2026" }, 2000, aspect);
      expect(html).toContain("white-space:pre");
    }
  });

  it("in 9:16, stays above the platform's button rail it would otherwise reach", () => {
    for (const text of ["BOLD", "motioncraft"]) {
      const layout = giantTypeLayout(lightTheme, "9:16", { text, rule: true, kicker: "Kicker", tag: "Tag" });
      for (const rail of safeZones("9:16", lightTheme.safe).keepOut) {
        expect(layout.box.y + layout.box.height).toBeLessThanOrEqual(rail.y);
      }
    }
  });

  it("nested in a Section, measures against the slot and stays inside it", () => {
    for (const aspect of ASPECTS) {
      const slot = sectionLayout(lightTheme, aspect, { headline: "Every part in its slot" }).content;
      const layout = giantTypeLayout(lightTheme, aspect, { text: "BOLD", rule: true, kicker: "Kicker" }, slot);
      expect(layout.target).toBe(slot.width);
      expect(inside(slot, layout.box)).toBe(true);
    }
  });
});

describe("entrances", () => {
  /** The mean progress of the letters at `ms`. */
  const mean = (entrance: GiantEntrance, ms: number, n = 9) => {
    const letters = Array.from({ length: n }, (_, i) => giantTypeEntrance(lightTheme, entrance, i, n, ms).progress);
    return letters.reduce((a, b) => a + b, 0) / n;
  };

  it.each(GIANT_ENTRANCES)("%s is mid-way at 300 ms and settled by 1.5 s", (entrance) => {
    expect(mean(entrance, 100)).toBe(0);
    const mid = mean(entrance, 300);
    expect(mid).toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(0.9);
    expect(mean(entrance, 1500)).toBe(1);
    // In the markup: moving at 300 ms, still from 1.5 s.
    const props = { text: "DIMENSION", entrance, rule: true, kicker: "Kicker", tag: "Tag" };
    const at = (ms: number) => draw(props, ms);
    expect(at(300)).not.toBe(at(0));
    expect(at(300)).not.toBe(at(1500));
    expect(at(1500)).toBe(at(2500));
  });

  it("tilt starts letters rotated on alternating sides", () => {
    const a = giantTypeEntrance(lightTheme, "tilt", 0, 4, 150);
    const b = giantTypeEntrance(lightTheme, "tilt", 1, 4, 150);
    expect(Math.sign(a.rotate)).toBe(-Math.sign(b.rotate));
    expect(Math.abs(a.rotate)).toBeGreaterThan(2);
    expect(giantTypeEntrance(lightTheme, "tilt", 0, 4, 1500).rotate).toBe(0);
  });

  it("scale comes from 1.15 with a blur", () => {
    const start = giantTypeEntrance(lightTheme, "scale", 0, 4, 150);
    expect(start.scale).toBeCloseTo(1.15, 2);
    expect(start.blur).toBeGreaterThan(0);
    const end = giantTypeEntrance(lightTheme, "scale", 0, 4, 1500);
    expect(end.scale).toBe(1);
    expect(end.blur).toBe(0);
  });

  it("type shows a hard cursor while typing and none once typed", () => {
    expect(draw({ text: "BOLD", entrance: "type" }, 300)).toContain("data-gianttype-cursor");
    expect(draw({ text: "BOLD", entrance: "type" }, 1500)).not.toContain("data-gianttype-cursor");
  });
});

describe("drawing", () => {
  it("draws the word in the scene's ink and the rule in the accent", () => {
    const html = draw({ rule: true }, 2000);
    expect(html).toContain(`color:${darkTheme.colors.text}`);
    expect(html).toMatch(new RegExp(`data-gianttype-rule=""[^>]*background-color:${darkTheme.colors.accent}`));
  });

  it("draws `behind` above the word in stacking order", () => {
    const html = draw({ text: "BOLD", behind: { component: "Card", props: { title: "In front" } } }, 2000);
    const word = html.indexOf("data-gianttype-word");
    const behind = html.indexOf("data-gianttype-behind");
    expect(word).toBeGreaterThan(-1);
    expect(behind).toBeGreaterThan(word);
    const z = (attr: string) => Number(new RegExp(`${attr}=""[^>]*z-index:(\\d+)`).exec(html)![1]);
    expect(z("data-gianttype-behind")).toBeGreaterThan(z("data-gianttype-word"));
  });

  it("rejects an unknown `behind` component", () => {
    expect(() => draw({ text: "BOLD", behind: { component: "Nope", props: {} } }, 500)).toThrow(/unknown component/);
  });
});
