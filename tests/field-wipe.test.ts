// Between two colour fields a wipe's soft edge is a muddy band of both colours
// (black into orange through brown), so there the edge is hard.

import { describe, expect, it } from "vitest";
import type { SceneTransitionState } from "../src/engine/timeline";
import { fieldTransitionStyle, hardWipeEdge } from "../src/render/fieldWipe";
import { transitionStyle } from "../src/transitions";

const SIZE = { width: 1920, height: 1080 };
const state = (direction: "in" | "out", transitionProgress: number, type: SceneTransitionState["type"] = "wipe"): SceneTransitionState => ({
  type,
  direction,
  transitionProgress,
  slideDirection: "left",
});

describe("fieldTransitionStyle", () => {
  it("is the presentation's own style off a field boundary", () => {
    for (const s of [state("in", 0.5), state("out", 0.5)]) expect(fieldTransitionStyle(s, SIZE, false)).toEqual(transitionStyle(s, SIZE));
  });

  it("keeps every other transition as it is between fields", () => {
    for (const type of ["iris", "whipPan", "cut", "fade"] as const) {
      const s = state("in", 0.3, type);
      expect(fieldTransitionStyle(s, SIZE, true)).toEqual(transitionStyle(s, SIZE));
    }
  });

  it("draws a wipe between fields with a hard edge: both masks switch at the same stop", () => {
    const edge = hardWipeEdge(0.5);
    const incoming = fieldTransitionStyle(state("in", 0.5), SIZE, true);
    const outgoing = fieldTransitionStyle(state("out", 0.5), SIZE, true);
    expect(incoming.maskImage).toBe(`linear-gradient(to left, #000 ${edge}%, transparent ${edge}%)`);
    expect(outgoing.maskImage).toBe(`linear-gradient(to left, transparent ${edge}%, #000 ${edge}%)`);
    expect(incoming.WebkitMaskImage).toBe(incoming.maskImage);
  });

  it("sweeps the hard edge across the whole frame", () => {
    expect(hardWipeEdge(0)).toBe(0);
    expect(hardWipeEdge(0.5)).toBe(50);
    expect(hardWipeEdge(1)).toBe(100);
    expect(hardWipeEdge(0.25)).toBeLessThan(hardWipeEdge(0.75));
  });
});
