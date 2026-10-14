// Writes src/kit/giantTypeMetrics.json: GiantType's letter metrics (advance,
// ink extents, kerning) for each face in GIANT_FACES, measured in the
// installed Chrome or Edge with the bundled fonts loaded. Rerun after
// changing a font, a face's weight or the character set.
//   npx tsx scripts/build-giant-metrics.ts

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser } from "../src/render/browser";
import { fontFaceCss } from "../src/render/fonts";
import { GIANT_CHARS, GIANT_FACES, ITALIC_SKEW_DEG, type GiantMetrics } from "../src/kit/giantTypeFaces";

const OUT = join(import.meta.dirname, "..", "src", "kit", "giantTypeMetrics.json");
/** Measured at this size, then divided down to em. */
const SIZE = 1000;

const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><head><style>${await fontFaceCss()}</style></head><body></body></html>`);
  // Plain JS source: tsx's helpers (e.g. __name) do not exist in the page.
  const measure = `async ({ faces, chars, size, italicSkew }) => {
    const round = (n) => Math.round((n / size) * 10000) / 10000 || 0;
    // Ink edges of each glyph drawn skewed about its baseline, found by scanning pixels (measureText ignores transforms).
    const leaning = (face, chars, skew) => {
      const px = 400;
      const canvas = document.createElement("canvas");
      canvas.width = 4 * px;
      canvas.height = 3 * px;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const result = {};
      for (const char of chars) {
        if (char === " ") continue;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const ox = px, oy = 2 * px;
        ctx.setTransform(1, 0, -Math.tan((skew * Math.PI) / 180), 1, ox, oy);
        ctx.font = face.weight + " " + px + 'px "' + face.family + '"';
        ctx.fillStyle = "#000";
        ctx.fillText(char, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width, right = -1;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          if (data[(y * canvas.width + x) * 4 + 3] >= 128) { if (x < left) left = x; if (x > right) right = x; }
        }
        result[char] = [Math.round(((left - ox) / px) * 10000) / 10000, Math.round(((right + 1 - ox) / px) * 10000) / 10000];
      }
      return result;
    };
    const out = {};
    for (const face of faces) {
      const font = face.weight + " " + size + 'px "' + face.family + '"';
      const loaded = await document.fonts.load(font);
      if (loaded.length === 0) throw new Error("no face for " + font);
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = font;
      ctx.fontKerning = "normal";
      const glyphs = {};
      const advance = {};
      for (const char of chars) {
        const m = ctx.measureText(char);
        advance[char] = m.width;
        const inked = char !== " ";
        glyphs[char] = [round(m.width), inked ? round(-m.actualBoundingBoxLeft) : 0, inked ? round(m.actualBoundingBoxRight) : 0, inked ? round(m.actualBoundingBoxAscent) : 0, inked ? round(m.actualBoundingBoxDescent) : 0];
      }
      const kern = {};
      for (const a of chars) {
        for (const b of chars) {
          const k = round(ctx.measureText(a + b).width - advance[a] - advance[b]);
          if (Math.abs(k) >= 0.0005) kern[a + b] = k;
        }
      }
      const box = ctx.measureText("H");
      // measureText's ink edges come in 1/64 em steps; the scanned pixels are finer.
      const upright = leaning(face, chars, 0);
      for (const char of chars) if (char !== " ") [glyphs[char][1], glyphs[char][2]] = upright[char];
      out[face.key] = { ascent: round(box.fontBoundingBoxAscent), descent: round(box.fontBoundingBoxDescent), glyphs, kern };
      if (face.key !== "serif") out[face.key].lean = leaning(face, chars, italicSkew);
    }
    return out;
  }`;
  const input = { faces: GIANT_FACES.map((f) => ({ ...f })), chars: [...GIANT_CHARS], size: SIZE, italicSkew: ITALIC_SKEW_DEG };
  const metrics = (await page.evaluate(`(${measure})(${JSON.stringify(input)})`)) as GiantMetrics;
  writeFileSync(OUT, `${JSON.stringify(metrics)}\n`);
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
}
