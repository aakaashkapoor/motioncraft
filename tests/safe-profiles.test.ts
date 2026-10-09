// Design v3, section C: the two 9:16 safe profiles, the caption band, the
// content area and where a scene's main block goes. Layout is symmetric about
// the frame's center line (x = 540 in 9:16); the right rail is a keep-out for
// text, not a shift of the whole layout.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SAFE_PROFILE,
  SAFE_PROFILES,
  blockCenterY,
  captionBand,
  contentArea,
  lightTheme,
  neutralTheme,
  placeBlock,
  resolveTheme,
  safeArea,
  safeZones,
  textColumn,
  validateStoryboard,
  type SafeProfile,
  type Theme,
} from "../src/index";

const withSafe = (safe: SafeProfile): Theme => ({ ...lightTheme, safe });
const center = (r: { x: number; width: number }) => r.x + r.width / 2;

describe("safe profiles", () => {
  it("are shorts (the default) and crosspost", () => {
    expect(SAFE_PROFILES).toEqual(["shorts", "crosspost"]);
    expect(DEFAULT_SAFE_PROFILE).toBe("shorts");
    expect(safeArea("9:16")).toEqual(safeArea("9:16", "shorts"));
  });

  it("shorts: text column x 120-960 between y 240 and 1440, rail x > 900 for y 960-1600", () => {
    const zones = safeZones("9:16", "shorts");
    expect(zones.area).toEqual({ x: 120, y: 240, width: 840, height: 1200 });
    expect(zones.keepOut).toEqual([{ x: 900, y: 960, width: 180, height: 640 }]);
    expect(zones.opticalCenter).toBe(840);
    expect(zones.primaryWidth).toBeGreaterThanOrEqual(760);
    expect(zones.primaryWidth).toBeLessThanOrEqual(840);
  });

  it("crosspost: centered text within x 200-880 between y 290 and 1240, rail x > 880 everywhere", () => {
    const zones = safeZones("9:16", "crosspost");
    expect(zones.area).toEqual({ x: 200, y: 290, width: 680, height: 950 });
    expect(zones.keepOut).toEqual([{ x: 880, y: 0, width: 200, height: 1920 }]);
    expect(zones.opticalCenter).toBe(765);
  });

  it.each(SAFE_PROFILES)("%s: the text column is centered on x = 540", (profile) => {
    expect(center(safeArea("9:16", profile))).toBe(540);
  });

  it("16:9: 96 px sides, 64 px top and bottom, no rail, in either profile", () => {
    for (const profile of SAFE_PROFILES) {
      const zones = safeZones("16:9", profile);
      expect(zones.area).toEqual({ x: 96, y: 64, width: 1728, height: 952 });
      expect(zones.keepOut).toEqual([]);
      expect(zones.opticalCenter).toBe(540);
    }
  });
});

describe("the storyboard's safe field", () => {
  const board = (extra: Record<string, unknown>) => ({
    title: "T",
    aspect: "9:16",
    scenes: [{ id: "a", component: "TitleCard", props: { title: "A" }, durationMs: 1000 }],
    ...extra,
  });

  it("is optional and kept when valid", () => {
    const plain = validateStoryboard(board({}));
    expect(plain.ok && plain.storyboard.safe).toBeUndefined();
    const result = validateStoryboard(board({ safe: "crosspost" }));
    expect(result.ok && result.storyboard.safe).toBe("crosspost");
  });

  it("rejects an unknown profile", () => {
    const result = validateStoryboard(board({ safe: "tiktok" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toEqual(['safe must be "shorts" or "crosspost" (got "tiktok")']);
  });

  it("selects the theme's profile; built-in themes use shorts", () => {
    expect(lightTheme.safe).toBe("shorts");
    expect(resolveTheme("dark").safe).toBe("shorts");
    const result = validateStoryboard(board({ safe: "crosspost" }));
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(resolveTheme(result.storyboard).safe).toBe("crosspost");
  });

  it("is not a theme override", () => {
    const result = validateStoryboard(board({ themeOverrides: { safe: "crosspost" } }));
    expect(!result.ok && result.errors).toEqual(['themeOverrides: unknown field "safe"']);
  });
});

describe("caption band", () => {
  it.each(SAFE_PROFILES)("%s: centered on x = 540 and clear of the right rail", (profile) => {
    const theme = withSafe(profile);
    const band = captionBand(theme, "9:16");
    expect(center(band)).toBe(540);
    for (const rail of safeZones("9:16", profile).keepOut) {
      const besideRail = band.y + band.height <= rail.y || band.y >= rail.y + rail.height;
      expect(besideRail || band.x + band.width <= rail.x).toBe(true);
    }
  });

  it("moves up out of the platform UI: its bottom is the last-baseline band's bottom", () => {
    expect(captionBand(withSafe("shorts"), "9:16")).toMatchObject({ x: 180, width: 720 });
    const shorts = captionBand(withSafe("shorts"), "9:16");
    expect(shorts.y + shorts.height).toBe(1400);
    const crosspost = captionBand(withSafe("crosspost"), "9:16");
    expect(crosspost.y + crosspost.height).toBe(1230);
  });

  it("puts the caption's last baseline inside the profile's band (shorts 1180-1400, crosspost 1040-1230)", () => {
    for (const [profile, [top, bottom]] of [["shorts", [1180, 1400]], ["crosspost", [1040, 1230]]] as const) {
      const theme = withSafe(profile);
      const band = captionBand(theme, "9:16");
      const spec = theme.type.subtitle["9:16"];
      // The plate rests a rise above the band's bottom (it enters from there); its last line's baseline is above the padding and descent.
      const plateBottom = band.y + band.height - theme.motion.caption.risePx;
      const baseline = plateBottom - theme.spacing.xs - ((spec.lineHeight - 1) / 2) * spec.size - 0.25 * spec.size;
      expect(baseline).toBeGreaterThanOrEqual(top);
      expect(baseline).toBeLessThanOrEqual(bottom);
    }
  });

  it("16:9: sits at the bottom of the safe area, full width", () => {
    const band = captionBand(neutralTheme, "16:9");
    const safe = safeArea("16:9");
    expect(band.y + band.height).toBe(safe.y + safe.height);
    expect(band).toMatchObject({ x: safe.x, width: safe.width });
  });
});

describe("content area", () => {
  it.each(SAFE_PROFILES)("%s: the text column above the caption band, centered on x = 540", (profile) => {
    const theme = withSafe(profile);
    const area = contentArea(theme, "9:16");
    const safe = safeArea("9:16", profile);
    expect(area.x).toBe(safe.x);
    expect(area.width).toBe(safe.width);
    expect(area.y).toBe(safe.y);
    expect(area.y + area.height).toBeLessThan(captionBand(theme, "9:16").y);
    expect(center(area)).toBe(540);
  });

  it("textColumn narrows symmetrically to keep text off the rail: x 180-900 in shorts", () => {
    expect(textColumn(withSafe("shorts"), "9:16")).toMatchObject({ x: 180, width: 720 });
    expect(textColumn(withSafe("crosspost"), "9:16")).toMatchObject({ x: 200, width: 680 });
    expect(textColumn(lightTheme, "16:9")).toEqual(contentArea(lightTheme, "16:9"));
  });
});

describe("main block placement", () => {
  const area = contentArea(lightTheme, "9:16");

  it("a scene's own block centers on the optical center; a slotted one on its slot", () => {
    expect(blockCenterY(lightTheme, "9:16")).toBe(840);
    expect(blockCenterY(withSafe("crosspost"), "9:16")).toBe(765);
    expect(blockCenterY(lightTheme, "16:9")).toBe(540);
    expect(blockCenterY(lightTheme, "9:16", { x: 0, y: 100, width: 10, height: 200 })).toBe(200);
  });

  it("centers horizontally in the area and vertically on centerY", () => {
    const box = placeBlock(area, { width: 600, height: 400 }, 840);
    expect(center(box)).toBe(540);
    expect(box.y + box.height / 2).toBe(840);
  });

  it("stays inside the area, as close to centerY as it can", () => {
    const box = placeBlock(area, { width: 600, height: 900 }, 840);
    expect(box.y + box.height).toBe(area.y + area.height);
    const high = placeBlock(area, { width: 600, height: 300 }, 200);
    expect(high.y).toBe(area.y);
  });

  it("never wider than the area; a block taller than the area overflows it evenly", () => {
    const box = placeBlock(area, { width: 2000, height: area.height + 100 }, 840);
    expect(box.width).toBe(area.width);
    expect(box.y).toBe(area.y - 50);
  });
});
