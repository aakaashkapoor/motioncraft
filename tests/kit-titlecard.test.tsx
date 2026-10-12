// TitleCard with a brand image as its logo: drawn in a mark box above the
// kicker, popping in on the scene's lead like the end card's mark.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, NOMINAL_SCENE_MS, TitleCard, frameSize, contentArea, lightTheme, type Aspect, type TitleCardProps } from "../src/index";
import { titleCardBox, titleCardErrors } from "../src/kit/TitleCard";
import { mediaUrl } from "../src/kit/mediaSource";

const theme = lightTheme;
const LOGO = "media/logo.svg";
const TEXT = { title: "Split bills in seconds", subtitle: "No more awkward math", kicker: "Splitly" };

const renderAt = (aspect: Aspect, ms: number, extra: Partial<TitleCardProps> = {}) =>
  renderToStaticMarkup(<TitleCard progress={ms / NOMINAL_SCENE_MS} theme={theme} aspect={aspect} {...TEXT} {...extra} />);

const markOf = (html: string) => {
  const start = html.indexOf('data-title-part="mark"');
  return start < 0 ? "" : html.slice(start, html.indexOf("</div>", start));
};

describe("TitleCard logo", () => {
  it.each(ASPECTS)("draws the logo image in a mark box above the text, contained, with no icon (%s)", (aspect) => {
    const html = renderAt(aspect, 3000, { logo: LOGO });
    const mark = markOf(html);
    expect(mark).toContain(`src="${mediaUrl(LOGO)}"`);
    expect(mark).toMatch(/<img[^>]*object-fit:contain/);
    expect(mark).not.toContain("<svg");
    expect(html.indexOf('data-title-part="mark"')).toBeLessThan(html.indexOf("Splitly"));
  });

  it("has no mark box without a logo", () => {
    expect(renderAt("9:16", 3000)).not.toContain('data-title-part="mark"');
  });

  it.each(ASPECTS)("makes room for the mark and still fits the content area (%s)", (aspect) => {
    const plain = titleCardBox(theme, aspect, TEXT);
    const branded = titleCardBox(theme, aspect, { ...TEXT, logo: LOGO });
    expect(branded.box.height).toBeGreaterThan(plain.box.height);
    const area = contentArea(theme, aspect);
    expect(branded.box.y).toBeGreaterThanOrEqual(area.y);
    expect(branded.box.y + branded.box.height).toBeLessThanOrEqual(area.y + area.height);
    expect(branded.box.x + branded.box.width / 2).toBeCloseTo(frameSize(aspect).width / 2, 0);
  });

  it("pops the logo in on the scene's lead", () => {
    const opacity = (ms: number) => {
      const mark = markOf(renderAt("9:16", ms, { logo: LOGO }));
      return Number(/opacity:([\d.e-]+)/.exec(mark)![1]);
    };
    expect(opacity(0)).toBe(0);
    expect(opacity(theme.motion.leadMs + 1000)).toBe(1);
  });

  it("rejects a logo that is not an image path, and a logo with an icon", () => {
    expect(titleCardErrors({ title: "x", logo: LOGO })).toEqual([]);
    expect(titleCardErrors({ title: "x", logo: "logo.gif" })).toEqual([expect.stringMatching(/logo/)]);
    expect(titleCardErrors({ title: "x", logo: LOGO, icon: "play" })).toEqual([expect.stringMatching(/logo.*icon|icon.*logo/)]);
    expect(() => renderAt("9:16", 3000, { logo: "logo.gif" })).toThrow(/^TitleCard: /);
  });
});
