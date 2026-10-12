// Pill captions: the spoken word reads on its pill on every frame, not only
// once the pill has arrived (issue #159, finding 4). The word's letters are
// either the page color or the theme's text-on-accent color, never a mix of
// the two: a mix is a mid tone, and so is a pill half faded in over a dark
// band, so mid-fade the word vanished ("renders" at frame 345 of
// captions-pill.json). Checked for every built-in theme, at both accent
// intensities, and with brand accents.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, CAPTION_LEAD_MS, Caption, SceneClockContext, captionTrack, contrastRatio, pageIndexAt, type Aspect, type Theme } from "../src/index";
import { captionColors } from "../src/kit/Caption";
import { PILL_PAD_EM, PILL_SLIDE, estimateWordBoxes, pillAt, pillBox, pillLayout } from "../src/kit/captionPill";
import { mixColors } from "../src/theme/color";
import { AA_CONTRAST } from "../src/theme/contrast";
import { resolveTheme, themes } from "../src/theme/resolve";

const text = "You write a prompt. The agent plans a storyboard, renders every frame, and checks the layout.";
const FPS = 30;
const FRAMES = 301;
const endMs = ((FRAMES - 1) * 1000) / FPS;

const BRAND_ACCENTS = [undefined, "#2563eb", "#16a34a", "#facc15", "#7c3aed", "#ec4899", "#0ea5e9"] as const;
const CASES: Array<[string, Theme]> = Object.keys(themes).flatMap((name) =>
  (["subtle", "full"] as const).flatMap((accentIntensity) =>
    BRAND_ACCENTS.map((accent): [string, Theme] => [
      `${name}, ${accentIntensity}${accent === undefined ? "" : `, accent ${accent}`}`,
      resolveTheme({ theme: name, accentIntensity, ...(accent === undefined ? {} : { accent }) }),
    ]),
  ),
);

function drawFrame(theme: Theme, aspect: Aspect, frame: number): string {
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames: FRAMES }}>
      <Caption progress={frame / (FRAMES - 1)} theme={theme} aspect={aspect} text={text} captionStyle="pill" />
    </SceneClockContext.Provider>,
  );
}

/** Each drawn word's color, by its index in the caption. */
function wordColors(html: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const [, index, style] of html.matchAll(/data-caption-word="(\d+)" style="([^"]*)"/g)) {
    out.set(Number(index), /(?:^|;)color:(#[0-9a-f]{6})/i.exec(style!)?.[1] ?? "?");
  }
  return out;
}

/** The drawn opacity of the pill on word `index` (0 when it is not there). */
function pillOpacity(html: string, index: number): number {
  const match = /data-caption-word="(\d+)"[^>]*><span data-caption-pill="" style="([^"]*)"/.exec(html);
  if (match === null || Number(match[1]) !== index) return 0;
  const style = match[2]!;
  return Number(/(?:^|;)opacity:([\d.e-]+)/.exec(style)?.[1] ?? 1);
}

/** Frames from a frame before `startMs` (spoken clock) to a frame after the pill's move there ends. */
function framesAround(startMs: number): number[] {
  const first = Math.floor(((startMs - CAPTION_LEAD_MS) * FPS) / 1000) - 1;
  const last = Math.ceil(((startMs - CAPTION_LEAD_MS + PILL_SLIDE.ms) * FPS) / 1000) + 1;
  return Array.from({ length: last - first + 1 }, (_, i) => first + i).filter((f) => f >= 0 && f < FRAMES);
}

describe("pill captions: the spoken word reads on its pill", () => {
  it.each(CASES)("%s: the word on the arrived pill is the text-on-accent color, at AA", (_, theme) => {
    const colors = captionColors(theme, "pill");
    expect(colors.active).toBe(theme.colors.accentText);
    expect(contrastRatio(colors.active, theme.colors.accent)).toBeGreaterThanOrEqual(AA_CONTRAST);
    expect(contrastRatio(colors.text, colors.plate ?? theme.colors.ground)).toBeGreaterThanOrEqual(AA_CONTRAST);
  });

  for (const aspect of ASPECTS) {
    it.each(CASES)(`%s (${aspect}): a page's first word reads on every frame of the pill's fade`, (_, theme) => {
      const { words, pages } = captionTrack(theme, aspect, text, "pill", endMs);
      const colors = captionColors(theme, "pill");
      const behind = colors.plate ?? theme.colors.ground;
      for (const page of pages) {
        for (const frame of framesAround(words[page.start]!.startMs)) {
          const spokenMs = (frame * 1000) / FPS + CAPTION_LEAD_MS;
          if (pages[pageIndexAt(pages, spokenMs)] !== page) continue;
          // Once the pill moves on to the next word, it is sliding (the next test).
          if ((pillAt(words, page, spokenMs)?.word ?? 0) !== 0) continue;
          const html = drawFrame(theme, aspect, frame);
          const color = wordColors(html).get(page.start)!;
          expect([colors.text, colors.active], `frame ${frame}`).toContain(color);
          const under = mixColors(behind, theme.colors.accent, pillOpacity(html, page.start));
          expect(contrastRatio(color, under), `frame ${frame}: ${color} on ${under}`).toBeGreaterThanOrEqual(AA_CONTRAST);
        }
      }
    });

    it.each(CASES)(`%s (${aspect}): while the pill slides, each word is lit only where the pill is under it`, (_, theme) => {
      const { words, pages } = captionTrack(theme, aspect, text, "pill", endMs);
      const colors = captionColors(theme, "pill");
      const size = theme.type.headline[aspect].size;
      const pad = { x: PILL_PAD_EM.x * size, y: PILL_PAD_EM.y * size };
      for (const page of pages) {
        for (let k = page.start + 1; k < page.end; k++) {
          for (const frame of framesAround(words[k]!.startMs)) {
            const spokenMs = (frame * 1000) / FPS + CAPTION_LEAD_MS;
            if (pages[pageIndexAt(pages, spokenMs)] !== page) continue;
            const state = pillAt(words, page, spokenMs);
            if (state === undefined) continue;
            const html = drawFrame(theme, aspect, frame);
            const drawn = wordColors(html);
            const boxes = estimateWordBoxes(
              words.slice(page.start, page.end).map((w) => w.text),
              pillLayout(theme, aspect, size),
            );
            const pill = pillBox(boxes, state, pad);
            for (const j of [state.from, state.word]) {
              const box = boxes[j]!;
              const cx = box.x + box.width / 2;
              const cy = box.y + box.height / 2;
              const covered = cx >= pill.x && cx <= pill.x + pill.width && cy >= pill.y && cy <= pill.y + pill.height;
              expect(drawn.get(page.start + j), `frame ${frame}, word ${page.start + j}`).toBe(covered ? colors.active : colors.text);
            }
          }
        }
      }
    });
  }
});
