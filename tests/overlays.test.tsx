// Overlays: a storyboard-level corner tag across chosen scenes, inside the
// safe area, drawn above everything, fading only at the edges of its scene range.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OVERLAY_CORNERS, SAFE_PROFILES, captionBand, lightTheme, safeZones, validateStoryboard, type Aspect, type SafeProfile, type Storyboard, type Theme } from "../src/index";
import { checkOverlayOverlap } from "../src/checks";
import { buildTimeline } from "../src/engine/timeline";
import { OVERLAY_FADE_MS, overlayBox } from "../src/overlays/layout";
import { overlayOpacity, overlayRanges } from "../src/overlays/timing";
import { Frame } from "../src/render/page";

type Box = { x: number; y: number; width: number; height: number };
const withSafe = (safe: SafeProfile): Theme => ({ ...lightTheme, safe });
const contained = (outer: Box, r: Box) => r.x >= outer.x && r.y >= outer.y && r.x + r.width <= outer.x + outer.width && r.y + r.height <= outer.y + outer.height;
const apart = (a: Box, b: Box) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

const WIDEST = "NOT FINANCIAL ADVICE, SORRY."; // 28 characters
const scenes = ["a", "b", "c", "d"].map((id) => ({ id, component: "Headline", props: { text: id }, durationMs: 1000, transition: { type: "cut" } }));
const board = (extra: Record<string, unknown>) => ({ title: "t", aspect: "9:16", scenes, ...extra });
const errorsOf = (extra: Record<string, unknown>) => {
  const result = validateStoryboard(board(extra));
  return result.ok ? [] : result.errors;
};

describe("overlay placement", () => {
  for (const aspect of ["9:16", "16:9"] as Aspect[]) {
    for (const profile of SAFE_PROFILES) {
      for (const corner of OVERLAY_CORNERS) {
        it(`${aspect} ${profile} ${corner}: inside the safe area, off the rail and the caption band`, () => {
          const theme = withSafe(profile);
          const zones = safeZones(aspect, profile);
          const box = overlayBox(theme, aspect, WIDEST, corner);
          expect(contained(zones.area, box)).toBe(true);
          for (const rail of zones.keepOut) expect(apart(box, rail)).toBe(true);
          expect(apart(box, captionBand(theme, aspect))).toBe(true);
        });
      }
    }
  }

  it("sits in the named corner of the safe area where nothing narrows it", () => {
    const { area } = safeZones("16:9");
    const box = overlayBox(lightTheme, "16:9", "Ad", "top-left");
    expect([box.x, box.y]).toEqual([area.x, area.y]);
    const right = overlayBox(lightTheme, "16:9", "Ad", "top-right");
    expect(right.x + right.width).toBe(area.x + area.width);
  });
});

describe("overlay timing", () => {
  const storyboard = { fps: 30, scenes: scenes.map((s) => ({ ...s })) } as unknown as Storyboard;
  const timeline = buildTimeline(storyboard, {});
  const ids = scenes.map((s) => s.id);

  it("shows only on its scenes", () => {
    const ranges = overlayRanges({ scenes: ["b", "c"] }, ids, timeline);
    expect(ranges).toEqual([{ startFrame: 30, endFrame: 90 }]);
    expect(overlayOpacity(ranges, 10, timeline)).toBe(0);
    expect(overlayOpacity(ranges, 60, timeline)).toBe(1);
    expect(overlayOpacity(ranges, 95, timeline)).toBe(0);
  });

  it("defaults to every scene, and does not fade at the video's own start and end", () => {
    const ranges = overlayRanges({}, ids, timeline);
    expect(ranges).toEqual([{ startFrame: 0, endFrame: 120 }]);
    expect(overlayOpacity(ranges, 0, timeline)).toBe(1);
    expect(overlayOpacity(ranges, 119, timeline)).toBe(1);
  });

  it("fades over 200 ms at the edges of its range, not at the boundary between its scenes", () => {
    const ranges = overlayRanges({ scenes: ["b", "c"] }, ids, timeline);
    expect(OVERLAY_FADE_MS).toBe(200);
    expect(overlayOpacity(ranges, 30, timeline)).toBeCloseTo(0, 5);
    expect(overlayOpacity(ranges, 33, timeline)).toBeCloseTo(0.5, 5);
    expect(overlayOpacity(ranges, 36, timeline)).toBe(1);
    expect(overlayOpacity(ranges, 84, timeline)).toBe(1);
    expect(overlayOpacity(ranges, 87, timeline)).toBeCloseTo(0.5, 5);
    for (const f of [58, 59, 60, 61, 62]) expect(overlayOpacity(ranges, f, timeline)).toBe(1);
  });

  it("makes one range per run of consecutive scenes", () => {
    expect(overlayRanges({ scenes: ["a", "c", "d"] }, ids, timeline)).toEqual([
      { startFrame: 0, endFrame: 30 },
      { startFrame: 60, endFrame: 120 },
    ]);
  });

  it("keeps full opacity through a transition inside the range", () => {
    const fading = { fps: 30, scenes: scenes.map((s) => ({ ...s, transition: { type: "fade", durationMs: 500 } })) } as unknown as Storyboard;
    const tl = buildTimeline(fading, {});
    const ranges = overlayRanges({ scenes: ["b", "c"] }, ids, tl);
    const boundary = tl.transitions[1]!;
    expect(boundary.frames).toBeGreaterThan(0);
    for (let f = boundary.startFrame; f < boundary.startFrame + boundary.frames; f++) expect(overlayOpacity(ranges, f, tl)).toBe(1);
  });
});

describe("overlay layer", () => {
  const storyboard = { title: "t", aspect: "9:16", fps: 30, theme: "light", scenes, overlays: [{ text: "Sponsored", corner: "top-right", scenes: ["b"] }] } as unknown as Storyboard;
  const timeline = buildTimeline(storyboard, {});
  const draw = (frame: number) => renderToStaticMarkup(<Frame storyboard={storyboard} theme={lightTheme} timeline={timeline} frame={frame} />);

  it("is drawn on its scene and not elsewhere", () => {
    expect(draw(45)).toContain("Sponsored");
    expect(draw(5)).not.toContain("Sponsored");
    expect(draw(100)).not.toContain("Sponsored");
  });

  it("is drawn last, above the scenes", () => {
    const html = draw(45);
    expect(html.indexOf("Sponsored")).toBeGreaterThan(html.indexOf(">b<"));
  });

  it("is uppercase eyebrow type on a surface at 85%", () => {
    const html = draw(45);
    expect(html).toContain("text-transform:uppercase");
    expect(html).toContain("letter-spacing:0.08em");
    expect(html).toContain(", 0.85)");
  });
});

describe("overlay validation", () => {
  it("accepts overlays with defaults", () => {
    const result = validateStoryboard(board({ overlays: [{ text: "Example" }, { text: "Ad", corner: "bottom-left", scenes: ["a", "b"] }] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.storyboard.overlays).toHaveLength(2);
  });

  it("rejects unknown scene ids", () => {
    expect(errorsOf({ overlays: [{ text: "Ad", scenes: ["a", "zzz"] }] })).toEqual([expect.stringContaining('unknown scene "zzz"')]);
  });

  it("rejects empty text and text over 28 characters", () => {
    expect(errorsOf({ overlays: [{ text: "  " }] }).join()).toContain("text is required");
    expect(errorsOf({ overlays: [{ text: "x".repeat(29) }] }).join()).toContain("at most 28");
    expect(errorsOf({ overlays: [{ text: "x".repeat(28) }] })).toEqual([]);
  });

  it("rejects more than one overlay in a corner on the same scene", () => {
    expect(errorsOf({ overlays: [{ text: "A" }, { text: "B" }] }).join()).toContain('corner "top-left" is already taken on scene "a"');
    expect(errorsOf({ overlays: [{ text: "A", scenes: ["a"] }, { text: "B", scenes: ["b"] }] })).toEqual([]);
    expect(errorsOf({ overlays: [{ text: "A" }, { text: "B", corner: "top-right" }] })).toEqual([]);
  });

  it("rejects a bad corner, more than 3 overlays, unknown fields and a non-array", () => {
    expect(errorsOf({ overlays: [{ text: "A", corner: "middle" }] }).join()).toContain("corner must be");
    const four = OVERLAY_CORNERS.map((corner) => ({ text: "A", corner }));
    expect(errorsOf({ overlays: four }).join()).toContain("at most 3");
    expect(errorsOf({ overlays: [{ text: "A", color: "red" }] }).join()).toContain('unknown field "color"');
    expect(errorsOf({ overlays: "Ad" }).join()).toContain("overlays must be an array");
  });
});

describe("overlay check", () => {
  const text = (value: string, x: number, y: number) => ({
    text: value,
    rect: { x, y, width: 200, height: 40 },
    clips: [],
    opacity: 1,
    color: "#000",
    backgrounds: ["#fff"],
    caption: false,
    fontSize: 32,
    fitted: false,
  });
  const measurement = (...texts: ReturnType<typeof text>[]) => ({ texts, keys: [], blocks: [] });

  it("warns when the pill covers scene text", () => {
    const warnings = checkOverlayOverlap(measurement(text("EXAMPLE", 120, 240), text("Headline", 200, 250)), [{ text: "EXAMPLE" }], lightTheme);
    expect(warnings).toEqual(['overlay "EXAMPLE" covers text "Headline"']);
  });

  it("is quiet when the pill is clear of every text", () => {
    expect(checkOverlayOverlap(measurement(text("EXAMPLE", 120, 240), text("Headline", 120, 600)), [{ text: "EXAMPLE" }], lightTheme)).toEqual([]);
  });
});

describe("overlay fixtures", () => {
  for (const name of ["overlay.json", "overlay-wide.json"]) {
    it(`${name} is a valid storyboard with overlays`, async () => {
      const result = validateStoryboard(JSON.parse(await readFile(join(__dirname, "fixtures", name), "utf8")));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.storyboard.overlays?.length).toBe(3);
    });
  }
});
