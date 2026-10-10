import { describe, expect, it } from "vitest";
import { lightTheme, liftPose, liftScale, liftShadow, tween, type LiftEnds } from "../src/index";

const theme = lightTheme;
const { liftOut: lift, enter } = theme.motion;
const AT = 4000;
const ENDS: LiftEnds = { from: { x: 200, bottom: 900 }, to: { x: 1200, bottom: 700 }, scale: 1.04 };

describe("liftPose", () => {
  it("sits exactly over the element it lifts from until the lift starts", () => {
    const before = liftPose(theme, AT - 1, AT, ENDS);
    expect(before.lifted).toBe(false);
    expect(before.dx).toBe(-1000);
    expect(before.dy).toBe(200);
    expect(before.scale).toBe(1);
    expect(before.shadow).toBe(0);
    expect(before.ghost).toBe(1);
  });

  it("leaves at the given ms with the enter spring, and settles beside it, scaled, with a lifted shadow", () => {
    const start = liftPose(theme, AT, AT, ENDS);
    expect(start.lifted).toBe(true);
    expect(start.ghost).toBe(lift.ghostOpacity);
    const mid = liftPose(theme, AT + enter.ms / 3, AT, ENDS);
    const k = tween(enter, enter.ms / 3);
    expect(mid.dx).toBeCloseTo(-1000 * (1 - k), 2);
    expect(mid.dy).toBeCloseTo(200 * (1 - k), 2);
    expect(mid.scale).toBeCloseTo(1 + 0.04 * k, 2);
    expect(mid.shadow).toBeGreaterThan(0);
    const settled = liftPose(theme, AT + enter.ms, AT, ENDS);
    expect(settled).toEqual({ lifted: true, dx: 0, dy: 0, scale: 1.04, shadow: 1, ghost: lift.ghostOpacity });
    // And stays there.
    expect(liftPose(theme, AT + 60_000, AT, ENDS)).toEqual(settled);
  });
});

describe("liftScale", () => {
  it("grows to the lift token's scale when there is room, and shrinks to fit when there is not", () => {
    expect(liftScale(theme, { width: 500, height: 200 }, { width: 900, height: 900 })).toBe(lift.scale);
    expect(liftScale(theme, { width: 500, height: 200 }, { width: 400, height: 900 })).toBeCloseTo(0.8, 6);
    expect(liftScale(theme, { width: 500, height: 200 }, { width: 900, height: 100 })).toBeCloseTo(0.5, 6);
  });
});

describe("liftShadow", () => {
  it("grows to the token's offset and blur", () => {
    expect(liftShadow(theme, 0)).toBe("none");
    expect(liftShadow(theme, 1)).toContain(`0 ${lift.shadowYPx}px ${lift.shadowBlurPx}px`);
    expect(liftShadow(theme, 0.5)).toContain(`0 ${lift.shadowYPx / 2}px ${lift.shadowBlurPx / 2}px`);
  });
});
