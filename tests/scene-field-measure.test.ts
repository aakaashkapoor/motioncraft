// In the browser: the layer-1 measurement judges text on a palette field
// against that field's colour and its moving ground's tint, both when the frame
// itself is the field and when each scene paints its own field mid-transition.

import { describe, expect, it, type TestContext } from "vitest";
import type { FrameMeasurement } from "../src/checks";
import { buildTimeline } from "../src/engine/timeline";
import { groundTint, validateStoryboard, type Storyboard } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { showFrame, withRenderPage } from "../src/render/session";
import { resolveTheme } from "../src/render/themes";
import { fieldTheme } from "../src/theme/field";

function skipWithoutBrowser(ctx: TestContext) {
  return (error: unknown): never => {
    if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed, skipping browser render: ${error.message}`);
    throw error;
  };
}

function board(): Storyboard {
  const result = validateStoryboard({
    title: "Fields",
    aspect: "9:16",
    fps: 30,
    // Dark's ground style is the mesh, which names a tint.
    theme: "dark",
    palette: "reel",
    scenes: [
      { id: "a", component: "TitleCard", props: { title: "Alpha" }, durationMs: 3000, ground: "p2", transition: { type: "wipe", durationMs: 1000 } },
      { id: "b", component: "TitleCard", props: { title: "Bravo" }, durationMs: 3000, ground: "p3" },
    ],
  });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

describe("measuring text on a palette field (browser)", { timeout: 120_000 }, () => {
  it("reads the field's own ground tint, alone and mid-wipe", async (ctx) => {
    const storyboard = board();
    const theme = resolveTheme(storyboard);
    const timeline = buildTimeline(storyboard, {}, theme);
    const t = timeline.transitions[0]!;
    const tint = (role: "p2" | "p3") => groundTint(fieldTheme(theme, role), "9:16");
    expect(tint("p2")).toBeDefined();
    expect(tint("p2")).not.toBe(tint("p3"));

    const [alone, mid] = await withRenderPage({ storyboard, theme, durations: {} }, async (page) => {
      const out: FrameMeasurement[] = [];
      for (const frame of [45, t.startFrame + Math.floor(t.frames / 2)]) {
        await showFrame(page, frame);
        out.push(await page.evaluate(() => window.motioncraft!.measureFrame()));
      }
      return out;
    }).catch(skipWithoutBrowser(ctx));

    const under = (m: FrameMeasurement, text: string) => m.texts.find((x) => x.text === text)?.backgrounds[0];
    expect(under(alone!, "Alpha")).toBe(tint("p2"));
    expect(under(mid!, "Alpha")).toBe(tint("p2"));
    expect(under(mid!, "Bravo")).toBe(tint("p3"));
  });
});
