import { describe, expect, it } from "vitest";
import { planRender } from "../src/render/renderPlan";
import { resolveTheme } from "../src/render/themes";
import { validateStoryboard } from "../src/index";
import type { SceneNarration } from "../src/narration/types";

function board(scenes: unknown[]) {
  const result = validateStoryboard({ title: "T", aspect: "16:9", fps: 30, scenes });
  if (!result.ok) throw new Error(result.errors.join());
  return result.storyboard;
}

const spoken = (audioMs: number): SceneNarration => ({ sceneId: "a", wavPath: "a.wav", audioMs, words: [] });

describe("planRender", () => {
  it("narrates and sizes narrated scenes from the audio", async () => {
    const storyboard = board([{ id: "a", component: "Title", props: { text: "x" }, narration: "Hello there." }]);
    const theme = resolveTheme(storyboard);
    const plan = await planRender({ storyboard, theme, mediaDir: ".", narrate: async () => ({ a: spoken(4000) }) });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.narration?.a?.audioMs).toBe(4000);
    expect(plan.durations.a).toBeGreaterThan(4000);
  });

  it("without narration it uses estimates and does not speak", async () => {
    const storyboard = board([{ id: "a", component: "Title", props: { text: "x" }, narration: "Hello there." }]);
    const plan = await planRender({
      storyboard,
      theme: resolveTheme(storyboard),
      mediaDir: ".",
      narrate: null,
    });
    expect(plan.ok && plan.narration).toBeUndefined();
    expect(plan.ok && plan.durations.a).toBeGreaterThan(0);
  });

  it("stops on a missing media file before speaking anything", async () => {
    const storyboard = board([
      { id: "a", component: "Image", props: { src: "no-such-file.png" }, narration: "Hello there." },
    ]);
    let spoke = false;
    const plan = await planRender({
      storyboard,
      theme: resolveTheme(storyboard),
      mediaDir: ".",
      narrate: async () => {
        spoke = true;
        return {};
      },
    });
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.errors.join()).toMatch(/no-such-file\.png/);
    expect(spoke).toBe(false);
  });

  it("stops with the errors when an explicit duration is too short for the audio", async () => {
    const storyboard = board([{ id: "a", component: "Title", props: { text: "x" }, narration: "Hello there.", durationMs: 2000 }]);
    const plan = await planRender({ storyboard, theme: resolveTheme(storyboard), mediaDir: ".", narrate: async () => ({ a: spoken(5000) }) });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.errors.join("\n")).toMatch(/narration-fit/);
  });
});
