// Millisecond motion for the kit (design v3, section D): the token curves, the
// exit and cascade rules, and the scene clock components read time from.

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MotionDelay,
  NOMINAL_SCENE_MS,
  SceneClockContext,
  arrive,
  cascadeStep,
  curveEasing,
  exitMs,
  exitOpacity,
  fade,
  fitSequence,
  lightTheme,
  tween,
  useSceneTime,
  type SceneClock,
} from "../src/index";

const theme = lightTheme;
const m = theme.motion;
const samples = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

describe("curveEasing", () => {
  it("maps 0 to 0 and 1 to 1 for every kind of curve", () => {
    for (const curve of ["linear", "expoOut", "expoIn", "expoInOut", "sineInOut", "power4InOut", [0.2, 0, 0, 1], { stiffness: 170, damping: 18 }] as const) {
      const ease = curveEasing(curve);
      expect(ease(0)).toBeCloseTo(0, 6);
      expect(ease(1)).toBe(1);
    }
  });

  it("plays the named curves", () => {
    expect(curveEasing("sineInOut")(0.5)).toBeCloseTo(0.5, 9);
    expect(curveEasing("power4InOut")(0.5)).toBeCloseTo(0.5, 9);
    expect(curveEasing("power4InOut")(0.25)).toBeCloseTo(8 * 0.25 ** 4, 9);
    expect(curveEasing("expoOut")(0.5)).toBeCloseTo(1 - 2 ** -5, 9);
    // Expo in, then out: slow away, a rush through the middle, a soft landing.
    expect(curveEasing("expoInOut")(0.5)).toBeCloseTo(0.5, 9);
    expect(curveEasing("expoInOut")(0.25)).toBeCloseTo(2 ** -5 / 2, 9);
    expect(curveEasing("expoInOut")(0.75)).toBeCloseTo(1 - 2 ** -5 / 2, 9);
  });

  it("plays a cubic bezier like CSS", () => {
    expect(curveEasing([0.25, 0.1, 0.25, 1])(0.5)).toBeCloseTo(0.8024, 3);
  });
});

describe("tween and fade", () => {
  it("is 0 before the motion starts and 1 once it has run its duration", () => {
    for (const token of [m.fx, m["text.in"], m.enter, m.pop, m.count]) {
      expect(tween(token, -50)).toBe(0);
      expect(tween(token, 0)).toBeCloseTo(0, 6);
      expect(tween(token, token.ms)).toBe(1);
      expect(tween(token, token.ms + 5000)).toBe(1);
    }
  });

  it("overshoots on the spatial springs: enter ~5%, enter.hero barely, pop ~15%", () => {
    const peak = (token: { ms: number; curve: typeof m.enter.curve }) => Math.max(...samples(400).map((t) => tween(token, t * token.ms)));
    expect(peak(m.enter)).toBeGreaterThan(1.03);
    expect(peak(m.enter)).toBeLessThan(1.07);
    expect(peak(m["enter.hero"])).toBeLessThan(1.035);
    expect(peak(m.pop)).toBeGreaterThan(1.1);
    expect(peak(m.pop)).toBeLessThan(1.2);
  });

  it("never lets opacity or colour overshoot", () => {
    for (const token of [m.enter, m["enter.hero"], m.pop, m.fx, m["fx.fast"]]) {
      for (const t of samples(200)) {
        const value = fade(token, t * token.ms * 1.2);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps the effect curves inside 0..1 and rising", () => {
    for (const token of [m.fx, m["fx.fast"]]) {
      let last = 0;
      for (const t of samples(100)) {
        const value = tween(token, t * token.ms);
        expect(value).toBeGreaterThanOrEqual(last - 1e-9);
        expect(value).toBeLessThanOrEqual(1);
        last = value;
      }
    }
  });
});

describe("arrive", () => {
  it("moves with the token and fades with fx, from the start time", () => {
    expect(arrive(theme, 100, 150)).toEqual({ move: 0, opacity: 0 });
    const mid = arrive(theme, 150 + m.fx.ms, 150);
    expect(mid.opacity).toBe(1);
    expect(mid.move).toBeLessThan(1);
    expect(arrive(theme, 150 + m.enter.ms, 150)).toEqual({ move: 1, opacity: 1 });
    expect(arrive(theme, 150 + m["enter.hero"].ms - 1, 150, m["enter.hero"]).move).toBeLessThan(1.01);
  });
});

describe("exits", () => {
  it("last a share of the entry, between the token's bounds", () => {
    expect(exitMs(theme, m.enter.ms)).toBeCloseTo(m.enter.ms * m.exit.share, 6);
    expect(exitMs(theme, m["enter.hero"].ms)).toBe(m.exit.maxMs);
    expect(exitMs(theme, m["fx.fast"].ms)).toBe(m.exit.minMs);
    expect(exitMs(theme, m.enter.ms)).toBeLessThanOrEqual(0.75 * m.enter.ms);
    expect(exitMs(theme, m.enter.ms)).toBeGreaterThanOrEqual(0.6 * m.enter.ms);
  });

  it("land on the scene's last frame, the same length in a short and a long scene", () => {
    const duration = exitMs(theme, m.enter.ms);
    for (const endMs of [3000, 9000]) {
      const at = (ms: number) => exitOpacity(theme, { ms, endMs, leftMs: endMs - ms }, m.enter.ms);
      expect(at(endMs - duration - 1)).toBe(1);
      expect(at(endMs - duration / 2)).toBeGreaterThan(0);
      expect(at(endMs - duration / 2)).toBeLessThan(1);
      expect(at(endMs)).toBe(0);
    }
    const short = exitOpacity(theme, { ms: 3000 - 100, endMs: 3000, leftMs: 100 }, m.enter.ms);
    const long = exitOpacity(theme, { ms: 9000 - 100, endMs: 9000, leftMs: 100 }, m.enter.ms);
    expect(short).toBe(long);
  });
});

describe("cascadeStep", () => {
  it("staggers by the token's step, tighter when the group would not finish by cascadeMs", () => {
    expect(cascadeStep(theme, 1)).toBe(0);
    expect(cascadeStep(theme, 4)).toBe(m.enter.staggerMs);
    const six = cascadeStep(theme, 6);
    expect(six).toBeLessThan(m.enter.staggerMs);
    expect(m.leadMs + 5 * six + m.enter.ms).toBeCloseTo(m.cascadeMs, 6);
  });
});

describe("useSceneTime", () => {
  function Probe({ progress }: { progress: number }) {
    const { ms, endMs, leftMs } = useSceneTime(progress);
    expect(leftMs).toBeCloseTo(endMs - ms, 9);
    return <i data-ms={ms.toFixed(3)} data-end={endMs.toFixed(3)} />;
  }
  const read = (html: string) => {
    const [, ms, end] = /data-ms="([^"]+)" data-end="([^"]+)"/.exec(html)!;
    return { ms: Number(ms), endMs: Number(end) };
  };
  const withClock = (clock: SceneClock, child: ReactNode) => <SceneClockContext.Provider value={clock}>{child}</SceneClockContext.Provider>;

  it("falls back to progress times a nominal scene length without a clock", () => {
    expect(read(renderToStaticMarkup(<Probe progress={0.25} />))).toEqual({ ms: 0.25 * NOMINAL_SCENE_MS, endMs: NOMINAL_SCENE_MS });
  });

  it("reads the scene clock: ms from the frame, the end at the last frame", () => {
    const html = renderToStaticMarkup(withClock({ fps: 30, frame: 15, frames: 90 }, <Probe progress={0.9} />));
    expect(read(html)).toEqual({ ms: 500, endMs: Number(((89 * 1000) / 30).toFixed(3)) });
  });

  it("delays everything inside a MotionDelay, and the delays add up", () => {
    const html = renderToStaticMarkup(
      withClock(
        { fps: 30, frame: 30, frames: 90 },
        <MotionDelay ms={200}>
          <Probe progress={0} />
          <MotionDelay ms={-500}>
            <Probe progress={0} />
          </MotionDelay>
        </MotionDelay>,
      ),
    );
    const [outer, inner] = [...html.matchAll(/data-ms="([^"]+)" data-end="([^"]+)"/g)].map(([, ms, end]) => ({ ms: Number(ms), endMs: Number(end) }));
    const end = (89 * 1000) / 30;
    expect(outer!.ms).toBeCloseTo(800, 3);
    expect(outer!.endMs).toBeCloseTo(end - 200, 3);
    expect(inner!.ms).toBeCloseTo(1300, 3);
    expect(inner!.endMs).toBeCloseTo(end + 300, 3);
  });
});

describe("fitSequence", () => {
  it("leaves a sequence alone when it ends before the exit, and speeds it up when it would not", () => {
    const exitStart = (endMs: number) => endMs - exitMs(theme, m.enter.ms) - m.beat.ms;
    expect(fitSequence(theme, { ms: 0, endMs: 9000, leftMs: 9000 }, 400, 3000, m.enter.ms)).toBe(1);
    const scale = fitSequence(theme, { ms: 0, endMs: 3000, leftMs: 3000 }, 400, 3000, m.enter.ms);
    expect(scale).toBeLessThan(1);
    expect(400 + (3000 - 400) * scale).toBeCloseTo(exitStart(3000), 6);
  });
});
