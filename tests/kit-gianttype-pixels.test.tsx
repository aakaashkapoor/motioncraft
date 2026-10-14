// GiantType in the real browser: the word drawn with the bundled fonts spans
// 88-94% of its target width, measured on the rendered pixels, and its ink
// lands where the layout (from the measured metrics table) says it does.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, SceneClockContext, darkTheme, frameSize, kit, type Aspect } from "../src/index";
import { GIANT_STYLES, giantTypeLayout, type GiantStyle } from "../src/kit/giantTypePlan";
import { BrowserNotFoundError, launchBrowser } from "../src/render/browser";
import { fontFaceCss } from "../src/render/fonts";

const WORDS = ["motioncraft", "BOLD", "DIMENSION"];
const FPS = 30;

function markup(aspect: Aspect, text: string, style: GiantStyle): string {
  const Component = kit.GiantType!;
  const frames = 120;
  const frame = 60;
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames }}>
      <Component text={text} style={style} progress={frame / (frames - 1)} theme={darkTheme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
}

/** The ink's left and right edges in a row band of a PNG: columns with any pixel brighter than half. */
const SCAN = `async ({ png, top, bottom }) => {
  const img = new Image();
  img.src = "data:image/png;base64," + png;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  let left = img.width, right = -1;
  for (let y = Math.max(0, top); y < Math.min(img.height, bottom); y++) {
    for (let x = 0; x < img.width; x++) {
      if (data[(y * img.width + x) * 4] > 128) { if (x < left) left = x; if (x > right) right = x; }
    }
  }
  return { left, right: right + 1 };
}`;

describe("GiantType on real pixels", () => {
  it("fills 88-94% of the target width in every aspect and style", { timeout: 120_000 }, async (ctx) => {
    const browser = await launchBrowser().catch((error: unknown) => {
      if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
      throw error;
    });
    try {
      const css = await fontFaceCss();
      const page = await browser.newPage();
      const scanner = await browser.newPage();
      for (const aspect of ASPECTS) {
        const { width, height } = frameSize(aspect);
        await page.setViewportSize({ width, height });
        for (const text of WORDS) {
          for (const style of GIANT_STYLES) {
            const layout = giantTypeLayout(darkTheme, aspect, { text, style });
            const html = `<!doctype html><html><head><style>${css} body{margin:0;background:#000}</style></head><body><div style="position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#000">${markup(aspect, text, style)}</div></body></html>`;
            await page.setContent(html);
            await page.evaluate("document.fonts.ready");
            const png = (await page.screenshot({ type: "png" })).toString("base64");
            const top = Math.floor(layout.box.y);
            const ink = (await scanner.evaluate(`(${SCAN})(${JSON.stringify({ png, top, bottom: Math.ceil(layout.box.y + layout.inkHeight) })})`)) as { left: number; right: number };
            const drawn = ink.right - ink.left;
            const label = `${text} ${style} ${aspect}: drawn ${ink.left}-${ink.right}, planned ${layout.inkLeft.toFixed(1)}+${layout.inkWidth.toFixed(1)}`;
            expect(drawn / layout.target, label).toBeGreaterThanOrEqual(0.88);
            expect(drawn / layout.target, label).toBeLessThanOrEqual(0.94);
            expect(Math.abs(drawn - layout.inkWidth), label).toBeLessThanOrEqual(0.01 * layout.inkWidth);
            expect(Math.abs(ink.left - layout.inkLeft), label).toBeLessThanOrEqual(0.01 * layout.inkWidth);
          }
        }
      }
    } finally {
      await browser.close();
    }
  });
});
