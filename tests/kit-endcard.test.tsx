// EndCard: the reference's calm end card. A logo mark beside the product
// name, one line under it, the accent line under that, and a card carried in
// below (the prompt card, again), all centered on the frame.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, EndCard, NOMINAL_SCENE_MS, accentInk, contentArea, endCardLayout, endCardTiming, kit, lightTheme, safeZones, type Aspect, type EndCardProps } from "../src/index";

const theme = lightTheme;
const TEXT = { name: "motioncraft", line: "Prompt in, video out", accent: "Free and open source" };
const CARD = { component: "PromptCard", props: { text: "A 40-second launch video for motioncraft", typed: false } };

const props = (aspect: Aspect, extra: Partial<EndCardProps> = {}): EndCardProps => ({ progress: 0, theme, aspect, ...TEXT, card: CARD, ...extra });
const renderAt = (aspect: Aspect, ms: number, extra: Partial<EndCardProps> = {}) =>
  renderToStaticMarkup(<EndCard {...props(aspect, { progress: ms / NOMINAL_SCENE_MS, ...extra })} />);

const centerX = (rect: { x: number; width: number }) => rect.x + rect.width / 2;

describe("EndCard", () => {
  it("is a kit component", () => {
    expect(kit.EndCard).toBeDefined();
  });

  it.each(ASPECTS)("stacks the name, its lines and the card, each centered on the frame, the block on the optical center (%s)", (aspect) => {
    const layout = endCardLayout(theme, aspect, { ...TEXT, card: true });
    const mid = aspect === "9:16" ? 540 : 960;
    for (const rect of [layout.brand, layout.line!, layout.accent!, layout.card!]) expect(centerX(rect)).toBeCloseTo(mid, 0);
    expect(layout.line!.y).toBeGreaterThanOrEqual(layout.brand.y + layout.brand.height);
    expect(layout.accent!.y).toBeGreaterThanOrEqual(layout.line!.y + layout.line!.height);
    expect(layout.card!.y).toBeGreaterThanOrEqual(layout.accent!.y + layout.accent!.height + theme.spacing.lg);
    const top = layout.brand.y;
    const bottom = layout.card!.y + layout.card!.height;
    const area = contentArea(theme, aspect);
    // On the optical center, moved only as far as it must to stay clear of the caption band.
    const optical = safeZones(aspect, theme.safe).opticalCenter;
    const wanted = Math.min(optical, area.y + area.height - (bottom - top) / 2);
    expect((top + bottom) / 2).toBeCloseTo(wanted, 0);
    expect(top).toBeGreaterThanOrEqual(area.y);
    expect(bottom).toBeLessThanOrEqual(area.y + area.height);
    // The name is the hero; the lines are subtitles, never small.
    expect(layout.name.size).toBeGreaterThanOrEqual(theme.type.display[aspect].size);
    expect(layout.lineSpec.size).toBe(theme.type.subtitle[aspect].size);
  });

  it("lands the mark, the name, the line, the accent line, then the card", () => {
    const t = endCardTiming(theme, { line: true, accent: true, card: true });
    expect(t.mark).toBeGreaterThanOrEqual(theme.motion.leadMs);
    expect(t.name).toBeGreaterThan(t.mark);
    expect(t.line).toBeGreaterThan(t.name);
    expect(t.accent).toBeGreaterThan(t.line);
    expect(t.card).toBeGreaterThan(t.accent);
    expect(t.card).toBeLessThan(1500);
  });

  it("sets the accent line in the accent ink and draws the card it carries", () => {
    const html = renderAt("16:9", 4000);
    expect(html).toContain('data-end-part="accent"');
    expect(html.slice(html.indexOf('data-end-part="accent"'), html.indexOf('data-end-part="accent"') + 600).toLowerCase()).toContain(accentInk(theme).toLowerCase());
    expect(html).toContain('data-block="PromptCard"');
    expect(html).toContain("motioncraft");
  });

  it("works without a card or lines", () => {
    const html = renderAt("9:16", 3000, { card: undefined, line: undefined, accent: undefined });
    expect(html).toContain("motioncraft");
    expect(html).not.toContain("PromptCard");
  });
});
