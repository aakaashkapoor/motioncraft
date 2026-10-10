// PromptCard: the reference's prompt card. A white card with a small label
// (an icon chip and "Prompt") over the prompt itself, which types in with a
// live caret once the card has landed. It can carry a shareId, so a prompt
// lifted out of a chat can land in it, and it can come back at the end typed.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, NOMINAL_SCENE_MS, PromptCard, contentArea, kit, lightTheme, promptCardLayout, promptCardTiming, type Aspect, type PromptCardProps } from "../src/index";

const theme = lightTheme;
const TEXT = "A 40-second launch video for motioncraft";

const props = (aspect: Aspect, extra: Partial<PromptCardProps> = {}): PromptCardProps => ({ progress: 0, theme, aspect, text: TEXT, ...extra });
const renderAt = (aspect: Aspect, ms: number, extra: Partial<PromptCardProps> = {}) =>
  renderToStaticMarkup(<PromptCard {...props(aspect, { progress: ms / NOMINAL_SCENE_MS, ...extra })} />);

/** The text typed so far, without markup. */
const typedOf = (html: string) => /data-prompt-text="">([^<]*)</.exec(html)?.[1] ?? "";

describe("PromptCard", () => {
  it("is a kit component", () => {
    expect(kit.PromptCard).toBeDefined();
  });

  it.each(ASPECTS)("sits centered on the frame, wide, its prompt in a ramp step no smaller than label (%s)", (aspect) => {
    const layout = promptCardLayout(theme, aspect, { text: TEXT });
    const frameWidth = aspect === "9:16" ? 1080 : 1920;
    expect(layout.box.x + layout.box.width / 2).toBeCloseTo(frameWidth / 2, 0);
    expect(layout.box.width).toBeGreaterThanOrEqual(aspect === "9:16" ? 760 : 640);
    expect(layout.text.size).toBeGreaterThanOrEqual(theme.type.label[aspect].size);
    expect([theme.type.title[aspect].size, theme.type.subtitle[aspect].size, theme.type.body[aspect].size, theme.type.label[aspect].size]).toContain(layout.text.size);
  });

  it("fits a narrow slot by stepping its text down the ramp, never below label", () => {
    const slot = { x: 96, y: 300, width: 500, height: 320 };
    const layout = promptCardLayout(theme, "16:9", { text: TEXT }, slot);
    expect(layout.box.width).toBeLessThanOrEqual(slot.width);
    expect(layout.box.height).toBeLessThanOrEqual(slot.height);
    expect(layout.text.size).toBeGreaterThanOrEqual(theme.type.label["16:9"].size);
  });

  it("types the prompt in once the card has landed, with a caret, and holds it typed", () => {
    const timing = promptCardTiming(theme, TEXT);
    expect(timing.typing.start).toBeGreaterThanOrEqual(theme.motion.leadMs + theme.motion.enter.ms - 1);
    expect(typedOf(renderAt("9:16", timing.typing.start + 10))).toBe("");
    expect(renderAt("9:16", timing.typing.start + 10)).toContain("data-caret");
    const mid = typedOf(renderAt("9:16", (timing.typing.typeStart + timing.typing.end) / 2));
    expect(mid.length).toBeGreaterThan(0);
    expect(mid.length).toBeLessThan(TEXT.length);
    expect(TEXT.startsWith(mid)).toBe(true);
    expect(typedOf(renderAt("9:16", timing.typing.end + 50))).toBe(TEXT);
    // Typing done well inside the first ~2.5 s, so the scene's hold stays alive with the caret and the shine.
    expect(timing.typing.end).toBeLessThan(2500);
    expect(timing.shine).toBeGreaterThanOrEqual(timing.typing.end);
  });

  it("shows the prompt whole from the start when it is not typed", () => {
    expect(typedOf(renderAt("16:9", 0, { typed: false }))).toBe(TEXT);
  });

  it("carries its shareId and marks its block", () => {
    const html = renderAt("16:9", 2000, { shareId: "prompt" });
    expect([...html.matchAll(/data-share-id="prompt"/g)]).toHaveLength(1);
    expect(html).toContain('data-block="PromptCard"');
    expect(html).toContain("Prompt");
  });

  it("lays out in the content area by default", () => {
    const area = contentArea(theme, "9:16");
    const { box } = promptCardLayout(theme, "9:16", { text: TEXT });
    expect(box.y).toBeGreaterThanOrEqual(area.y);
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
  });
});
