import { describe, expect, it } from "vitest";
import { captionBand, captionsShown, contentArea, textColumn, withCaptionsShown } from "../src/layout/caption";
import { ASPECTS, SAFE_PROFILES } from "../src/storyboard/types";
import { safeZones } from "../src/layout/safe";
import { neutralTheme } from "../src/theme/neutral";

describe("captionsShown", () => {
  const narrated = { scenes: [{ narration: "Hello there." }, {}] };
  it("is true when a scene has narration and captions are not off", () => {
    expect(captionsShown(narrated)).toBe(true);
    expect(captionsShown({ ...narrated, captionStyle: "punch" })).toBe(true);
  });
  it("is false with captions off or no narration", () => {
    expect(captionsShown({ ...narrated, captionStyle: "off" })).toBe(false);
    expect(captionsShown({ scenes: [{}, {}] })).toBe(false);
  });
});

describe("contentArea without captions", () => {
  for (const aspect of ASPECTS) {
    for (const safe of SAFE_PROFILES) {
      const theme = { ...neutralTheme, safe };
      const on = withCaptionsShown(theme, true);
      const off = withCaptionsShown(theme, false);

      it(`${aspect} ${safe}: identical to today with captions on`, () => {
        expect(contentArea(on, aspect)).toEqual(contentArea(theme, aspect));
        expect(textColumn(on, aspect)).toEqual(textColumn(theme, aspect));
        expect(contentArea(theme, aspect).y + contentArea(theme, aspect).height).toBe(captionBand(theme, aspect).y - theme.spacing.md);
      });

      it(`${aspect} ${safe}: taller with captions off, down to the safe area's bottom less a gap`, () => {
        const zones = safeZones(aspect, safe);
        const today = contentArea(theme, aspect);
        const area = contentArea(off, aspect);
        expect(area.height).toBeGreaterThan(today.height);
        expect({ x: area.x, y: area.y, width: area.width }).toEqual({ x: today.x, y: today.y, width: today.width });
        expect(area.y + area.height).toBe(Math.min(zones.area.y + zones.area.height, zones.captionBottom) - theme.spacing.md);
      });

      it(`${aspect} ${safe}: the text column still keeps clear of the keep-outs`, () => {
        const column = textColumn(off, aspect);
        for (const k of safeZones(aspect, safe).keepOut) {
          const below = k.y >= column.y + column.height || k.y + k.height <= column.y;
          const beside = k.x >= column.x + column.width || k.x + k.width <= column.x;
          expect(below || beside).toBe(true);
        }
      });
    }
  }
});
