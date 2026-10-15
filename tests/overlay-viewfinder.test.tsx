// Viewfinder frame: corner brackets, a label, a timecode, a spec tag, a scene
// counter and a filling ruler over the whole video, inside the safe area, with
// captions lifted above its bottom ruler.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, SAFE_PROFILES, captionBand, lightTheme, safeZones, validateStoryboard, type SafeProfile, type Storyboard, type Theme } from "../src/index";
import { checkViewfinderOverlap } from "../src/checks/overlays";
import { buildTimeline } from "../src/engine/timeline";
import { viewfinderLayout } from "../src/overlays/viewfinderLayout";
import { VIEWFINDER_ATTRIBUTE } from "../src/overlays/Viewfinder";
import { rulerFill, rulerTicks, sceneCounter, specTag, timecode, viewfinderOpacity } from "../src/overlays/viewfinderText";
import { Frame } from "../src/render/page";
import { resolveTheme } from "../src/theme/resolve";
import { sceneTheme } from "../src/theme/field";

type Box = { x: number; y: number; width: number; height: number };
const contained = (outer: Box, r: Box) => r.x >= outer.x && r.y >= outer.y && r.x + r.width <= outer.x + outer.width && r.y + r.height <= outer.y + outer.height;
const apart = (a: Box, b: Box) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
const withSafe = (safe: SafeProfile): Theme => ({ ...lightTheme, safe });

const scenes = ["intro", "build", "ship"].map((id) => ({ id, component: "Headline", props: { text: id }, durationMs: 1000, transition: { type: "cut" } }));
const board = (extra: Record<string, unknown>) => ({ title: "t", aspect: "16:9", scenes, ...extra });
const errorsOf = (extra: Record<string, unknown>) => {
  const result = validateStoryboard(board(extra));
  return result.ok ? [] : result.errors;
};

/** The viewfinder's markup in a rendered frame, or undefined when none is drawn. */
const viewfinderOf = (html: string): string | undefined => {
  const start = html.indexOf(VIEWFINDER_ATTRIBUTE);
  return start < 0 ? undefined : html.slice(start);
};

describe("viewfinder text", () => {
  it("shows the video time as HH:MM:SS:FF", () => {
    expect(timecode(95, 30)).toBe("00:00:03:05");
    expect(timecode(0, 30)).toBe("00:00:00:00");
    expect(timecode(60 * 60 * 60 + 61 * 60 + 59, 60)).toBe("01:01:01:59");
  });

  it("fills the ruler to time / duration, with a tick at every scene start and the end", () => {
    const timeline = buildTimeline({ fps: 30, scenes } as unknown as Storyboard, {});
    expect(timeline.totalFrames).toBe(90);
    expect(rulerFill(45, timeline)).toBeCloseTo(45 / 30 / (90 / 30), 9);
    expect(rulerFill(0, timeline)).toBe(0);
    expect(rulerTicks(timeline)).toEqual([0, 1 / 3, 2 / 3, 1]);
  });

  it("counts scenes as index and upper-cased id, or the scene's frameLabel", () => {
    expect(sceneCounter(0, { id: "intro" })).toBe("01 / INTRO");
    expect(sceneCounter(11, { id: "x", frameLabel: "The End" })).toBe("12 / THE END");
  });

  it("tags the frame size and fps", () => {
    expect(specTag("16:9", 60)).toBe("1920 x 1080 / 60 FPS");
    expect(specTag("9:16", 30)).toBe("1080 x 1920 / 30 FPS");
  });

  it("fades in over 300 ms to 60%, then holds", () => {
    expect(viewfinderOpacity(0, 30)).toBe(0);
    expect(viewfinderOpacity(6, 30)).toBeCloseTo(0.4, 9);
    expect(viewfinderOpacity(9, 30)).toBe(0.6);
    expect(viewfinderOpacity(500, 30)).toBe(0.6);
  });
});

describe("viewfinder layout", () => {
  for (const aspect of ASPECTS) {
    for (const profile of SAFE_PROFILES) {
      it(`${aspect} ${profile}: inside the safe area, off the rail, captions and content clear of it`, () => {
        const theme = withSafe(profile);
        const zones = safeZones(aspect, profile);
        const layout = viewfinderLayout(theme, aspect);
        expect(contained(zones.area, layout.box)).toBe(true);
        const rows = [layout.top, layout.bottom, ...(layout.ruler === undefined ? [] : [layout.ruler])];
        for (const row of rows) {
          expect(contained(layout.box, row)).toBe(true);
          for (const rail of zones.keepOut) expect(apart(row, rail)).toBe(true);
        }
        const band = captionBand(theme, aspect);
        const lifted = { ...band, y: band.y - layout.captionLift };
        for (const row of rows) expect(apart(lifted, row)).toBe(true);
        const content = layout.contentArea(true);
        expect(content.y).toBeGreaterThanOrEqual(layout.top.y + layout.top.height);
        expect(content.y + content.height).toBeLessThanOrEqual(lifted.y);
        const bare = layout.contentArea(false);
        expect(bare.y + bare.height).toBeLessThanOrEqual((layout.ruler ?? layout.bottom).y);
        expect(bare.height).toBeGreaterThan(zones.area.height / 2);
      });
    }
  }

  it("gives a row two lines when its texts do not fit side by side, and a portrait ruler its own line", () => {
    const short = { label: 10, timecode: 11, counter: 10, spec: 20 };
    const long = { ...short, label: 32 };
    const tiktok = withSafe("tiktok");
    const height = (chars: typeof short, aspect: "9:16" | "16:9") => viewfinderLayout(tiktok, aspect, chars).top.height;
    expect(height(long, "9:16")).toBe(2 * height(short, "9:16"));
    expect(height(long, "16:9")).toBe(height(short, "16:9"));
    expect(viewfinderLayout(tiktok, "9:16", short).ruler).toBeDefined();
    expect(viewfinderLayout(tiktok, "16:9", short).ruler).toBeUndefined();
  });

  it("puts the brackets at the safe area's corners where nothing narrows it", () => {
    const { area } = safeZones("16:9");
    expect(viewfinderLayout(lightTheme, "16:9").box).toEqual(area);
  });
});

describe("viewfinder layer", () => {
  const frame = { style: "viewfinder", label: "Motion reel 2026" };
  const storyboard = { title: "t", aspect: "16:9", fps: 30, theme: "dark", palette: "reel", frame, scenes: scenes.map((s, i) => ({ ...s, ...(i === 1 && { ground: "p2" }) })) } as unknown as Storyboard;
  const theme = resolveTheme(storyboard);
  const timeline = buildTimeline(storyboard, {});
  const draw = (f: number, sb: Storyboard = storyboard) => renderToStaticMarkup(<Frame storyboard={sb} theme={theme} timeline={timeline} frame={f} />);

  it("draws the label, timecode, spec and scene counter", () => {
    const html = viewfinderOf(draw(45))!;
    expect(html).toBeDefined();
    expect(html).toContain("MOTION REEL 2026");
    expect(html).toContain("00:00:01:15");
    expect(html).toContain("1920 x 1080 / 30 FPS");
    expect(html).toContain("02 / BUILD");
  });

  it("fills the ruler to the current time", () => {
    expect(viewfinderOf(draw(45))).toContain(`width:${(45 / 90) * 100}%`);
  });

  it("takes the ink of the scene's ground, switching on the cut", () => {
    const ink = (i: number) => sceneTheme(theme, storyboard.scenes[i]!).colors.textMuted;
    expect(ink(0)).not.toBe(ink(1));
    expect(viewfinderOf(draw(15))).toContain(`color:${ink(0)}`);
    expect(viewfinderOf(draw(45))).toContain(`color:${ink(1)}`);
    expect(viewfinderOf(draw(45))).not.toContain(`color:${ink(0)}`);
  });

  it("hides the timecode and spec when asked", () => {
    const quiet = { ...storyboard, frame: { ...frame, showTimecode: false, showSpec: false } } as Storyboard;
    const html = viewfinderOf(draw(45, quiet))!;
    expect(html).not.toContain("00:00:01:15");
    expect(html).not.toContain("FPS");
  });

  it("draws nothing when frame is absent", () => {
    const { frame: _none, ...plain } = storyboard;
    expect(viewfinderOf(draw(45, plain as Storyboard))).toBeUndefined();
  });
});

describe("viewfinder validation", () => {
  it("accepts a frame with defaults and a scene frameLabel", () => {
    const result = validateStoryboard(board({ frame: { style: "viewfinder" }, scenes: [{ ...scenes[0], frameLabel: "Open" }] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.storyboard.frame).toEqual({ style: "viewfinder" });
      expect(result.storyboard.scenes[0]!.frameLabel).toBe("Open");
    }
  });

  it("rejects a bad style, a label over 32 characters, non-boolean flags and unknown fields", () => {
    expect(errorsOf({ frame: { style: "film" } }).join()).toContain('style must be "viewfinder"');
    expect(errorsOf({ frame: { style: "viewfinder", label: "x".repeat(33) } }).join()).toContain("at most 32");
    expect(errorsOf({ frame: { style: "viewfinder", label: "x".repeat(32) } })).toEqual([]);
    expect(errorsOf({ frame: { style: "viewfinder", label: " " } }).join()).toContain("label");
    expect(errorsOf({ frame: { style: "viewfinder", showTimecode: "yes" } }).join()).toContain("showTimecode must be true or false");
    expect(errorsOf({ frame: { style: "viewfinder", color: "red" } }).join()).toContain('unknown field "color"');
    expect(errorsOf({ frame: "viewfinder" }).join()).toContain("frame must be an object");
  });

  it("rejects a frame alongside overlays, which share its corners", () => {
    expect(errorsOf({ frame: { style: "viewfinder" }, overlays: [{ text: "Ad" }] }).join()).toContain("frame and overlays");
  });

  it("rejects a bad frameLabel", () => {
    expect(errorsOf({ scenes: [{ ...scenes[0], frameLabel: "" }] }).join()).toContain("frameLabel");
    expect(errorsOf({ scenes: [{ ...scenes[0], frameLabel: "x".repeat(25) }] }).join()).toContain("frameLabel");
  });
});

describe("viewfinder check", () => {
  const text = (value: string, x: number, y: number, caption = false) => ({
    text: value,
    rect: { x, y, width: 200, height: 40 },
    clips: [],
    opacity: 1,
    color: "#000",
    backgrounds: ["#fff"],
    caption,
    fontSize: 28,
    fitted: false,
  });
  const measurement = (...texts: ReturnType<typeof text>[]) => ({ texts, keys: [], blocks: [] });

  it("warns when scene or caption text runs into the viewfinder's text", () => {
    const m = measurement(text("01 / INTRO", 100, 960, true), text("A caption", 150, 970, true), text("Far away", 600, 500));
    expect(checkViewfinderOverlap(m, ["01 / INTRO"])).toEqual(['viewfinder text "01 / INTRO" is covered by caption text "A caption"']);
  });

  it("is quiet when everything is clear", () => {
    expect(checkViewfinderOverlap(measurement(text("01 / INTRO", 100, 960, true), text("Far away", 600, 500)), ["01 / INTRO"])).toEqual([]);
  });
});

describe("viewfinder fixtures", () => {
  for (const name of ["viewfinder.json", "viewfinder-tall.json"]) {
    it(`${name} is a valid storyboard with a viewfinder frame`, async () => {
      const result = validateStoryboard(JSON.parse(await readFile(join(__dirname, "fixtures", name), "utf8")));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.storyboard.frame?.style).toBe("viewfinder");
    });
  }
});

