// An overlay in a top corner shares its row with a SceneFrame or Section
// header: the check reports a pill that crowds the header, and a scene whose
// header the pill would crowd starts its content area below the pill.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentArea, lightTheme, safeZones, validateStoryboard, type Aspect, type Storyboard } from "../src/index";
import { checkOverlayOverlap } from "../src/checks";
import { grownBy, overlayBox, overlayClearance } from "../src/overlays/layout";
import { sceneAreaUnderOverlays, sceneHeaderBoxes, sceneHeaderText } from "../src/overlays/sceneHeaders";

type Box = { x: number; y: number; width: number; height: number };
const meets = (a: Box, b: Box) => Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);

const fixture = (name: string): Storyboard => {
  const result = validateStoryboard(JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8")));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
};
const tall = fixture("overlay.json");
const split = tall.scenes.find((scene) => scene.id === "split")!;
const tag = tall.overlays![0]!; // "Example bill", top-left, on intro and split

describe("overlay check against the scene header", () => {
  const text = (value: string, x: number, y: number, width: number, height: number) => ({
    text: value,
    rect: { x, y, width, height },
    clips: [],
    opacity: 1,
    color: "#000",
    backgrounds: ["#fff"],
    caption: false,
    fontSize: 32,
    fitted: false,
  });
  const measurement = (...texts: ReturnType<typeof text>[]) => ({ texts, keys: [], blocks: [] });
  const header = ["Everyone pays their share", "How it works"];

  it("reports the old 9:16 layout: the tag beside the eyebrow on its row, 36 px apart", () => {
    // Measured from the render of tests/fixtures/overlay.json, scene "split", before the placement fix.
    const old = measurement(
      text("How it works", 428, 241, 224, 53),
      text("Everyone pays their share", 249, 315, 582, 228),
      text("Example bill", 144, 254, 225, 42),
    );
    expect(checkOverlayOverlap(old, [tag], lightTheme, header)).toContain(`overlay "Example bill" crowds the scene's header "How it works"`);
  });

  it("is quiet on the 16:9 layout, where the eyebrow is far across the row", () => {
    const wide = measurement(text("How it works", 859, 65, 201, 48), text("Everyone pays their share", 487, 134, 946, 117), text("Example bill", 120, 78, 197, 37));
    expect(checkOverlayOverlap(wide, [tag], lightTheme, header)).toEqual([]);
  });

  it("is quiet once the header steps down under the tag", () => {
    // Measured from the render with the scene's content area starting below the pill.
    const fixed = measurement(text("How it works", 428, 328, 224, 53), text("Everyone pays their share", 249, 402, 582, 228), text("Example bill", 144, 254, 225, 42));
    expect(checkOverlayOverlap(fixed, [tag], lightTheme, header)).toEqual([]);
  });

  it("holds other scene text only to not being covered, and matches the header regardless of case", () => {
    const near = measurement(text("How it works", 428, 241, 224, 53), text("Example bill", 144, 254, 225, 42));
    expect(checkOverlayOverlap(near, [tag], lightTheme)).toEqual([]);
    expect(checkOverlayOverlap(near, [tag], lightTheme, ["HOW IT WORKS"])).toHaveLength(1);
  });
});

describe("scene headers", () => {
  it("are the eyebrow and headline of a SceneFrame or Section, nothing for other components", () => {
    expect(sceneHeaderText(split)).toEqual({ eyebrow: "How it works", headline: "Everyone pays their share" });
    expect(sceneHeaderText({ component: "Section", props: { headline: "H" } })).toEqual({ headline: "H" });
    expect(sceneHeaderText({ component: "Headline", props: { text: "Split any bill" } })).toBeUndefined();
  });

  it("estimate the measured text: the eyebrow centered on its row, the headline below it", () => {
    const [eyebrow, headline] = sceneHeaderBoxes(lightTheme, "9:16", split);
    // Measured: eyebrow x 428-652 y 241-294; headline x 249-831 y 315-543.
    expect(eyebrow!.x).toBeLessThanOrEqual(428);
    expect(eyebrow!.x + eyebrow!.width).toBeGreaterThanOrEqual(652);
    expect(eyebrow!.y).toBe(safeZones("9:16").area.y);
    expect(headline!.y).toBeGreaterThan(eyebrow!.y + eyebrow!.height);
    expect(headline!.y + headline!.height).toBeGreaterThanOrEqual(543);
  });

  it("follow the area they are laid out in", () => {
    const area = { ...contentArea(lightTheme, "9:16"), y: 400 };
    expect(sceneHeaderBoxes(lightTheme, "9:16", split, area)[0]!.y).toBe(400);
  });
});

describe("a scene's content area under a top-corner overlay", () => {
  const clearance = overlayClearance(lightTheme);
  const crowds = (aspect: Aspect, area?: ReturnType<typeof contentArea>) =>
    sceneHeaderBoxes(lightTheme, aspect, split, area).some((header) => meets(grownBy(overlayBox(lightTheme, aspect, tag.text, "top-left"), clearance), header));

  it("9:16: the tag's row would crowd the eyebrow, so the area starts a line gap below the pill and the header no longer crowds it", () => {
    expect(crowds("9:16")).toBe(true);
    const area = sceneAreaUnderOverlays(lightTheme, "9:16", split, tall.overlays!)!;
    const pill = overlayBox(lightTheme, "9:16", tag.text, "top-left");
    const base = contentArea(lightTheme, "9:16");
    expect(area).toEqual({ ...base, y: pill.y + pill.height + clearance.y, height: base.y + base.height - (pill.y + pill.height + clearance.y) });
    expect(crowds("9:16", area)).toBe(false);
  });

  it("16:9: the eyebrow is far across the row, so the scene keeps its content area and the tag its corner", () => {
    expect(crowds("16:9")).toBe(false);
    expect(sceneAreaUnderOverlays(lightTheme, "16:9", split, tall.overlays!)).toBeUndefined();
    expect(overlayBox(lightTheme, "16:9", tag.text, "top-left")).toMatchObject({ x: safeZones("16:9").area.x, y: safeZones("16:9").area.y });
  });

  it("is the default for scenes without a header, overlays on other scenes, and bottom corners", () => {
    const intro = tall.scenes.find((scene) => scene.id === "intro")!;
    expect(sceneAreaUnderOverlays(lightTheme, "9:16", intro, tall.overlays!)).toBeUndefined();
    expect(sceneAreaUnderOverlays(lightTheme, "9:16", split, [{ ...tag, scenes: ["intro"] }])).toBeUndefined();
    expect(sceneAreaUnderOverlays(lightTheme, "9:16", split, [{ ...tag, corner: "bottom-left" }])).toBeUndefined();
    expect(sceneAreaUnderOverlays(lightTheme, "9:16", split, [{ text: tag.text }])).toBeDefined();
  });

  it("makes room for a top-right tag the same way", () => {
    const area = sceneAreaUnderOverlays(lightTheme, "9:16", split, [{ text: "Sponsored", corner: "top-right" }]);
    const pill = overlayBox(lightTheme, "9:16", "Sponsored", "top-right");
    expect(area?.y).toBe(pill.y + pill.height + clearance.y);
  });
});
