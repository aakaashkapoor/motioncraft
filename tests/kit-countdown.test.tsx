// Countdown: a giant serif numeral hard-cut 3-2-1, a thin ring drawing around
// each over its step. It needs a scene long enough to count out.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, SceneClockContext, contentArea, darkTheme, kit, validateStoryboard, type Aspect } from "../src/index";
import { countdownAt, countdownErrors, countdownLayout, countdownSpec } from "../src/kit/countdownPlan";

const FPS = 30;

const draw = (props: Record<string, unknown>, ms: number, aspect: Aspect = "16:9", frames = 90) => {
  const Component = kit.Countdown!;
  const frame = Math.round((ms * FPS) / 1000);
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames }}>
      <Component {...props} progress={frame / (frames - 1)} theme={darkTheme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
};

const numberOf = (html: string) => /data-countdown-number="(\d)"/.exec(html)?.[1];
const ringOf = (html: string) => parseFloat(/data-countdown-ring="([\d.]+)"/.exec(html)![1]!);

describe("the count", () => {
  it("shows 3 at 100 ms, 2 at 700 ms and 1 at 1300 ms with the defaults", () => {
    expect(numberOf(draw({}, 100))).toBe("3");
    expect(numberOf(draw({}, 700))).toBe("2");
    expect(numberOf(draw({}, 1300))).toBe("1");
  });

  it("shows the first number from frame 0 with its ring empty, and stays on the last number", () => {
    expect(numberOf(draw({}, 0))).toBe("3");
    expect(ringOf(draw({}, 0))).toBe(0);
    expect(numberOf(draw({}, 1800))).toBe("1");
    expect(numberOf(draw({}, 2400, "16:9", 90))).toBe("1");
  });

  it("counts from and to, a step of stepMs each", () => {
    const props = { from: 5, to: 2, stepMs: 400 };
    expect([100, 500, 900, 1300].map((ms) => numberOf(draw(props, ms)))).toEqual(["5", "4", "3", "2"]);
  });

  it("draws the ring half way half-way through a step, from nothing to whole", () => {
    expect(ringOf(draw({}, 400))).toBeCloseTo(0.5, 1);
    expect(ringOf(draw({}, 1000))).toBeCloseTo(0.5, 1);
    expect(ringOf(draw({}, 100))).toBe(0);
    expect(countdownAt(countdownSpec({}), 699).ring).toBeGreaterThan(0.99);
    expect(countdownAt(countdownSpec({}), 700).ring).toBe(0);
  });

  it("draws the ring in the scene's ink at 70% and 1.5 px", () => {
    const html = draw({}, 400);
    expect(html).toContain(`stroke="${darkTheme.colors.text}"`);
    expect(html).toContain('stroke-opacity="0.7"');
    expect(html).toContain('stroke-width="1.5"');
  });

  it("sets the numeral in the display serif in the scene's ink", () => {
    const html = draw({}, 400);
    expect(html).toContain("mc-serif");
    expect(html).toContain(`color:${darkTheme.colors.text}`);
  });
});

describe("validation", () => {
  it("accepts the defaults and a scene as long as the countdown", () => {
    expect(countdownErrors({})).toEqual([]);
    expect(countdownErrors({}, 1800)).toEqual([]);
    expect(countdownErrors({ from: 9, to: 1, stepMs: 1500 }, 13500)).toEqual([]);
  });

  it("rejects a scene shorter than (from - to + 1) * stepMs", () => {
    expect(countdownErrors({}, 1799)).toHaveLength(1);
    expect(countdownErrors({ from: 5, stepMs: 1000 }, 4000)[0]).toMatch(/5000 ms/);
    expect(() => draw({}, 500, "16:9", 45)).toThrow(/Countdown: .*1800 ms/);
    expect(() => draw({}, 500, "16:9", 54)).not.toThrow();
  });

  it("rejects bad props", () => {
    expect(countdownErrors({ from: 0 })).toHaveLength(1);
    expect(countdownErrors({ from: 10 })).toHaveLength(1);
    expect(countdownErrors({ from: 2.5 })).toHaveLength(1);
    expect(countdownErrors({ to: 0 })).toHaveLength(1);
    expect(countdownErrors({ stepMs: 299 })).toHaveLength(1);
    expect(countdownErrors({ stepMs: 1501 })).toHaveLength(1);
    expect(countdownErrors({ from: 2, to: 3 })).toHaveLength(1);
    expect(() => draw({ from: 12 }, 500)).toThrow(/from/);
  });
});

describe.each(ASPECTS)("layout in %s", (aspect) => {
  it("keeps the numeral's box and the ring inside the content area, centred", () => {
    const layout = countdownLayout(darkTheme, aspect);
    const area = contentArea(darkTheme, aspect);
    expect(layout.box).toEqual(area);
    expect(layout.numeralTop).toBeGreaterThanOrEqual(-0.5);
    expect(layout.numeralTop + layout.size * 1.333).toBeLessThanOrEqual(area.height + 0.5);
    expect(layout.ringDiameter).toBeLessThanOrEqual(Math.min(area.width, area.height));
    expect(layout.ringCenter).toEqual({ x: area.width / 2, y: area.height / 2 });
    expect(layout.size).toBeGreaterThan(400);
  });
});

describe("fixtures", () => {
  it.each([
    ["countdown.json", "16:9"],
    ["countdown-tall.json", "9:16"],
  ])("%s is a valid %s storyboard of Countdown scenes long enough to count", (file, aspect) => {
    const json = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", file), "utf8"));
    expect(json.aspect).toBe(aspect);
    const result = validateStoryboard(json);
    expect(result.ok).toBe(true);
    for (const scene of json.scenes) {
      expect(scene.component).toBe("Countdown");
      expect(countdownErrors(scene.props, scene.durationMs), scene.id).toEqual([]);
    }
  });
});
