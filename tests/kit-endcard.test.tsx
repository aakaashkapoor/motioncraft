// EndCard: the reference's calm end card. A logo mark beside the product
// name, one line under it, the accent line under that, and a card carried in
// below (the prompt card, again), all centered on the frame.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, EndCard, frameSize, NOMINAL_SCENE_MS, accentInk, captionBand, contentArea, endCardLayout, endCardTiming, kit, lightTheme, safeZones, type Aspect, type EndCardProps } from "../src/index";
import { endCardErrors } from "../src/kit/EndCard";
import { SAFE_PROFILES } from "../src/storyboard/types";
import { mediaUrl } from "../src/kit/mediaSource";

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
    const mid = frameSize(aspect).width / 2;
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

describe("EndCard logo", () => {
  const LOGO = "media/logo.png";
  const markOf = (html: string) => {
    const start = html.indexOf('data-end-part="mark"');
    return html.slice(start, html.indexOf('data-end-part="name"'));
  };

  it.each(ASPECTS)("draws the logo image in the mark box, contained and untinted, instead of the icon (%s)", (aspect) => {
    const html = renderAt(aspect, 3000, { logo: LOGO });
    const mark = markOf(html);
    expect(mark).toContain(`src="${mediaUrl(LOGO)}"`);
    expect(mark).toMatch(/<img[^>]*object-fit:contain/);
    expect(mark).not.toContain("<svg");
    // No accent fill behind the logo: it is drawn as it is.
    expect(mark.slice(0, mark.indexOf("<img"))).not.toContain(theme.colors.accent.toLowerCase());
  });

  it("keeps the icon mark without a logo", () => {
    expect(markOf(renderAt("9:16", 3000))).toContain("<svg");
  });

  it("rejects a logo together with an icon, and a logo that is not an image path", () => {
    expect(endCardErrors({ name: "x", logo: LOGO, icon: "play" })).toEqual([expect.stringMatching(/logo.*icon|icon.*logo/)]);
    expect(endCardErrors({ name: "x", logo: "logo.gif" })).toEqual([expect.stringMatching(/logo.*\.png/)]);
    expect(endCardErrors({ name: "x", logo: "" })).toHaveLength(1);
    expect(endCardErrors({ name: "x", logo: LOGO })).toEqual([]);
    expect(() => renderAt("9:16", 3000, { logo: LOGO, icon: "play" })).toThrow(/^EndCard: /);
  });
});

describe("EndCard call to action", () => {
  const CTA = { label: "Download free · iOS & Android", note: "Link in bio" };
  const textIn = theme.motion["text.in"];

  it("rejects a label longer than 32 characters, an empty label and a note that is not a string", () => {
    expect(endCardErrors({ name: "x", cta: { label: "x".repeat(40) } })).toEqual([expect.stringMatching(/cta\.label.*32/)]);
    expect(endCardErrors({ name: "x", cta: { label: "x".repeat(32) } })).toEqual([]);
    expect(endCardErrors({ name: "x", cta: { label: " " } })).toHaveLength(1);
    expect(endCardErrors({ name: "x", cta: { label: "Go", note: 3 } })).toHaveLength(1);
    expect(endCardErrors({ name: "x", cta: "Go" })).toHaveLength(1);
    expect(() => renderAt("9:16", 3000, { cta: { label: "x".repeat(40) } })).toThrow(/^EndCard: .*32/);
  });

  it("pops the pill in ~250 ms after the last line lands, the note 150 ms later, then the card", () => {
    const t = endCardTiming(theme, { line: true, accent: true, cta: CTA, card: true });
    expect(t.cta - (t.accent + textIn.ms)).toBe(250);
    expect(t.note - t.cta).toBe(150);
    expect(t.card).toBeGreaterThan(t.note);
    const lineOnly = endCardTiming(theme, { line: true, cta: CTA });
    expect(lineOnly.cta - (lineOnly.line + textIn.ms)).toBe(250);
  });

  it("shows the pill, then the note, after the line in the render", () => {
    const t = endCardTiming(theme, { line: true, accent: true, cta: CTA, card: true });
    const opacityOf = (html: string, part: string) => {
      const tag = html.slice(html.indexOf(`data-end-part="${part}"`));
      return Number(/opacity:([\d.e-]+)/.exec(tag.slice(0, tag.indexOf(">")))![1]);
    };
    const at = (ms: number) => renderAt("9:16", ms, { cta: CTA });
    const before = at(t.cta - 10);
    expect(before).toContain("Download free · iOS &amp; Android");
    expect(opacityOf(before, "cta")).toBe(0);
    const between = at(t.note - 10);
    expect(opacityOf(between, "cta")).toBeGreaterThan(0);
    expect(opacityOf(between, "cta-note")).toBe(0);
    const after = at(t.note + 400);
    expect(opacityOf(after, "cta")).toBe(1);
    expect(opacityOf(after, "cta-note")).toBeGreaterThan(0.9);
    expect(after.indexOf('data-end-part="cta"')).toBeGreaterThan(after.indexOf('data-end-part="line"'));
    expect(after.indexOf('data-end-part="cta-note"')).toBeGreaterThan(after.indexOf('data-end-part="cta"'));
  });

  it.each(ASPECTS)("lays the pill and the note out under the lines, centered, inside the content area (%s)", (aspect) => {
    for (const card of [false, true]) {
      const layout = endCardLayout(theme, aspect, { ...TEXT, cta: CTA, card });
      const { cta } = layout;
      expect(cta).toBeDefined();
      const mid = frameSize(aspect).width / 2;
      expect(centerX(cta!.pill)).toBeCloseTo(mid, 0);
      expect(centerX(cta!.note!)).toBeCloseTo(mid, 0);
      expect(cta!.pill.y).toBeGreaterThanOrEqual(layout.accent!.y + layout.accent!.height);
      expect(cta!.note!.y).toBeGreaterThanOrEqual(cta!.pill.y + cta!.pill.height);
      if (card) expect(layout.card!.y).toBeGreaterThanOrEqual(cta!.note!.y + cta!.note!.height);
      const area = contentArea(theme, aspect);
      const bottom = card ? layout.card!.y + layout.card!.height : cta!.note!.y + cta!.note!.height;
      expect(bottom).toBeLessThanOrEqual(area.y + area.height);
      expect(cta!.radius).toBe(cta!.pill.height / 2);
    }
  });

  it.each(SAFE_PROFILES)("keeps the pill inside the safe area and clear of the caption band in 9:16, at most the primary width (%s)", (profile) => {
    const safeTheme = { ...theme, safe: profile };
    const zones = safeZones("9:16", profile);
    for (const label of [CTA.label, "x".repeat(32), "W".repeat(32)]) {
      const rest = endCardLayout(safeTheme, "9:16", { ...TEXT, cta: { label, note: "Link in bio" }, card: true }).cta!.pill;
      expect(rest.width).toBeLessThanOrEqual(zones.primaryWidth);
      // Also at the top of its pop.
      const grow = (theme.motion.pop.scale - 1) / 2;
      const pill = { x: rest.x - rest.width * grow, y: rest.y - rest.height * grow, width: rest.width * (1 + 2 * grow), height: rest.height * (1 + 2 * grow) };
      expect(pill.x).toBeGreaterThanOrEqual(zones.area.x);
      expect(pill.x + pill.width).toBeLessThanOrEqual(zones.area.x + zones.area.width);
      expect(pill.y + pill.height).toBeLessThanOrEqual(captionBand(safeTheme, "9:16").y);
      for (const keep of zones.keepOut) {
        const overlaps = pill.x < keep.x + keep.width && pill.x + pill.width > keep.x && pill.y < keep.y + keep.height && pill.y + pill.height > keep.y;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("sets the label on the accent in the accent's text color, in a pill as round as it is tall", () => {
    const html = renderAt("16:9", 4000, { cta: CTA });
    const tag = html.slice(html.indexOf('data-end-part="cta"'));
    const style = tag.slice(0, tag.indexOf(">")).toLowerCase();
    expect(style).toContain(`background-color:${theme.colors.accent.toLowerCase()}`);
    expect(style).toContain(`color:${theme.colors.accentText.toLowerCase()}`);
    const { pill } = endCardLayout(theme, "16:9", { ...TEXT, cta: CTA, card: true }).cta!;
    expect(style).toContain(`border-radius:${pill.height / 2}px`);
  });
});
