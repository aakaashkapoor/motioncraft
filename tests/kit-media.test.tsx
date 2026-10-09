import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  AppWindow,
  Image,
  VideoClip,
  clipMediaTime,
  frameSize,
  kenBurns,
  kit,
  lightTheme,
  mediaUrl,
  slotTransform,
  windowLayout,
  type Aspect,
} from "../src/index";

function parseStyle(style: string): Map<string, string> {
  return new Map(
    style
      .split(";")
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(":");
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as const;
      }),
  );
}

/** The style of the first element carrying `attr`. */
function styleOf(html: string, attr: string): Map<string, string> {
  const open = new RegExp(`<[a-z]+[^>]*\\s${attr}(="[^"]*")?[\\s>][^>]*>`).exec(html);
  if (open === null) throw new Error(`no element with ${attr}`);
  return parseStyle(/style="([^"]*)"/.exec(open[0])?.[1] ?? "");
}

const px = (value: string | undefined) => parseFloat(value ?? "NaN");

/** The media box's rect in the frame it is drawn in. */
function mediaRect(html: string) {
  const s = styleOf(html, "data-media");
  return { x: px(s.get("left")), y: px(s.get("top")), width: px(s.get("width")), height: px(s.get("height")) };
}

const video = (aspect: Aspect, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<VideoClip progress={0.5} theme={lightTheme} aspect={aspect} src="clips/demo.mp4" {...extra} />);

const image = (aspect: Aspect, progress: number, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<Image progress={progress} theme={lightTheme} aspect={aspect} src="photos/hero.png" {...extra} />);

describe("clipMediaTime", () => {
  it("maps scene time to trimStart + sceneTime * rate, nudged just inside the frame", () => {
    expect(clipMediaTime(0, {})).toBeCloseTo(0, 3);
    expect(clipMediaTime(1000, {})).toBeCloseTo(1, 3);
    expect(clipMediaTime(500, { trimStartMs: 200 })).toBeCloseTo(0.7, 3);
    expect(clipMediaTime(500, { trimStartMs: 200, rate: 2 })).toBeCloseTo(1.2, 3);
    // Never lands exactly on a frame boundary, where rounding could pick the previous frame.
    expect(clipMediaTime(1000 / 30, {})).toBeGreaterThan(1 / 30);
    expect(clipMediaTime(1000 / 30, {})).toBeLessThan(1 / 30 + 0.001);
  });

  it("holds the last frame before trimEnd", () => {
    expect(clipMediaTime(5000, { trimStartMs: 200, trimEndMs: 1000 })).toBeLessThan(1);
    expect(clipMediaTime(5000, { trimStartMs: 200, trimEndMs: 1000 })).toBeGreaterThan(0.999);
  });
});

describe("VideoClip", () => {
  it("is registered in the kit", () => {
    expect(kit.VideoClip).toBe(VideoClip);
  });

  it.each(ASPECTS)("fills the whole frame by default (%s)", (aspect) => {
    const html = video(aspect);
    expect(mediaRect(html)).toEqual({ x: 0, y: 0, ...frameSize(aspect) });
    expect(html).toContain("<video");
    expect(html).toContain(`src="${mediaUrl("clips/demo.mp4").replace(/&/g, "&amp;")}"`);
  });

  it("is always muted in the page, and covers or contains", () => {
    const html = video("9:16", { muted: false });
    expect(/<video[^>]*\smuted/.test(html)).toBe(true);
    expect(styleOf(video("9:16"), "data-media-element").get("object-fit")).toBe("cover");
    expect(styleOf(video("9:16", { fit: "contain" }), "data-media-element").get("object-fit")).toBe("contain");
  });

  it("serves local paths from the renderer's media origin, never the network", () => {
    expect(mediaUrl("clips/demo.mp4")).toMatch(/^https:\/\/motioncraft\.localhost\/media\//);
    expect(mediaUrl("C:\\Users\\me\\a b.mp4")).not.toContain(" ");
    expect(decodeURIComponent(mediaUrl("C:\\Users\\me\\a b.mp4").split("/media/")[1]!)).toBe("C:\\Users\\me\\a b.mp4");
  });
});

describe("Image", () => {
  it("is registered in the kit", () => {
    expect(kit.Image).toBe(Image);
  });

  it.each(ASPECTS)("fills the whole frame by default (%s)", (aspect) => {
    const html = image(aspect, 0.5);
    expect(mediaRect(html)).toEqual({ x: 0, y: 0, ...frameSize(aspect) });
    expect(html).toContain(`src="${mediaUrl("photos/hero.png")}"`);
  });

  it("covers by default, or contains, around the focal point", () => {
    const img = styleOf(image("16:9", 0.5), "data-media-element");
    expect(img.get("object-fit")).toBe("cover");
    expect(img.get("object-position")).toBe("50% 50%");
    const focused = styleOf(image("16:9", 0.5, { fit: "contain", focus: { x: 0.2, y: 0.9 } }), "data-media-element");
    expect(focused.get("object-fit")).toBe("contain");
    expect(focused.get("object-position")).toBe("20% 90%");
  });

  it("does not move without Ken Burns", () => {
    expect(styleOf(image("16:9", 0), "data-ken-burns").get("transform")).toBe("translate(0%, 0%) scale(1)");
    expect(styleOf(image("16:9", 1), "data-ken-burns").get("transform")).toBe("translate(0%, 0%) scale(1)");
  });

  it("zooms slowly over the scene", () => {
    const props = { zoom: { from: 1, to: 1.2 } };
    expect(kenBurns(0, props)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(kenBurns(0.5, props).scale).toBeCloseTo(1.1, 6);
    expect(kenBurns(1, props).scale).toBeCloseTo(1.2, 6);
    expect(styleOf(image("9:16", 1, props), "data-ken-burns").get("transform")).toBe("translate(0%, 0%) scale(1.2)");
    expect(kenBurns(0.5, { zoom: 1.3 }).scale).toBeCloseTo(1.3, 6);
  });

  it("pans across the scene, enlarged just enough that no edge ever shows", () => {
    const props = { pan: { x: 0.1, y: -0.04 } };
    const start = kenBurns(0, props);
    const end = kenBurns(1, props);
    expect(start.x).toBeCloseTo(-0.05, 6);
    expect(end.x).toBeCloseTo(0.05, 6);
    expect(start.y).toBeCloseTo(0.02, 6);
    expect(end.y).toBeCloseTo(-0.02, 6);
    expect(kenBurns(0.5, props)).toEqual({ scale: 1.1, x: 0, y: 0 });
    // Covers the box at every point of the pan, whatever the focal point.
    for (const focus of [{ x: 0.5, y: 0.5 }, { x: 0, y: 0 }, { x: 1, y: 0.3 }]) {
      for (let p = 0; p <= 1; p += 0.125) {
        const { scale, x, y } = kenBurns(p, { ...props, zoom: { from: 1, to: 1.05 }, focus });
        // Scaled about the focal point, then translated (fractions of the box).
        const left = focus.x * (1 - scale) + x;
        const right = focus.x + (1 - focus.x) * scale + x;
        const top = focus.y * (1 - scale) + y;
        const bottom = focus.y + (1 - focus.y) * scale + y;
        expect(left).toBeLessThanOrEqual(1e-9);
        expect(right).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(top).toBeLessThanOrEqual(1e-9);
        expect(bottom).toBeGreaterThanOrEqual(1 - 1e-9);
      }
    }
    const style = styleOf(image("16:9", 0, { ...props, focus: { x: 0.3, y: 0.6 } }), "data-ken-burns");
    expect(style.get("transform-origin")).toBe("30% 60%");
  });
});

describe("media inside a window", () => {
  it.each(ASPECTS)("fills the window's content box exactly (%s)", (aspect) => {
    for (const content of [
      { component: "VideoClip", props: { src: "clips/demo.mp4" } },
      { component: "Image", props: { src: "photos/hero.png", zoom: { from: 1, to: 1.1 } } },
    ]) {
      const html = renderToStaticMarkup(<AppWindow progress={0.5} theme={lightTheme} aspect={aspect} title="Demo" content={content} />);
      const box = windowLayout(lightTheme, aspect, false).content;
      const { x, y, scale } = slotTransform(lightTheme, aspect, box);
      const rect = mediaRect(html);
      // The media's rect in the nested frame, mapped through the slot, is the content box.
      expect(x + rect.x * scale).toBeCloseTo(0, 6);
      expect(y + rect.y * scale).toBeCloseTo(0, 6);
      expect(rect.width * scale).toBeCloseTo(box.width, 6);
      expect(rect.height * scale).toBeCloseTo(box.height, 6);
    }
  });
});
