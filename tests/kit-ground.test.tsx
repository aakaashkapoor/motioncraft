import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  BigNumber,
  FlowDiagram,
  Ground,
  GROUND_STYLES,
  TitleCard,
  buildTimeline,
  groundStyle,
  lightTheme,
  resolveTheme,
  validateStoryboard,
  type Storyboard,
  type Theme,
} from "../src/index";
import { Frame } from "../src/render/page";

const withGround = (style: (typeof GROUND_STYLES)[number], seed = 1): Theme => ({ ...lightTheme, ground: { style, seed } });

describe("groundStyle", () => {
  it("draws nothing extra for solid", () => {
    expect(groundStyle(withGround("solid"))).toEqual({});
  });

  it("draws a radial gradient for vignette, from the theme's colors", () => {
    const { backgroundImage } = groundStyle(withGround("vignette"));
    expect(backgroundImage).toMatch(/^radial-gradient\(/);
    expect(backgroundImage).toContain(lightTheme.colors.ground);
  });

  it("draws a dot grid on the spacing scale for grid", () => {
    const style = groundStyle(withGround("grid"));
    expect(style.backgroundImage).toMatch(/radial-gradient\(circle/);
    expect(style.backgroundSize).toBe(`${lightTheme.spacing.lg}px ${lightTheme.spacing.lg}px`);
  });
});

describe.each(ASPECTS)("Ground (%s)", (aspect) => {
  const render = (theme: Theme) => renderToStaticMarkup(<Ground theme={theme} aspect={aspect} />);

  it.each(GROUND_STYLES)("covers the frame in %s without painting a background color", (style) => {
    const html = render(withGround(style));
    expect(html).toContain(`data-ground="${style}"`);
    const [width, height] = aspect === "9:16" ? [1080, 1920] : [1920, 1080];
    expect(html).toContain(`width:${width}px;height:${height}px`);
    expect(html).not.toContain("background-color");
  });

  it("seeds the noise grain, deterministically", () => {
    expect(render(withGround("noise", 7))).toContain('seed="7"');
    expect(render(withGround("noise", 7))).toBe(render(withGround("noise", 7)));
    expect(render(withGround("noise", 7))).not.toBe(render(withGround("noise", 8)));
  });
});

function board(input: Record<string, unknown> = {}): Storyboard {
  const result = validateStoryboard({
    title: "T",
    aspect: "9:16",
    scenes: [{ id: "a", component: "TitleCard", props: { title: "Hello" }, durationMs: 1000 }],
    ...input,
  });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

describe("Frame", () => {
  it("paints the ground color and draws the ground layer under the scene", () => {
    const sb = board();
    const theme = resolveTheme(sb);
    const html = renderToStaticMarkup(createElement(Frame, { storyboard: sb, theme, timeline: buildTimeline(sb, {}), frame: 10 }));
    expect(html).toContain(`background-color:${theme.colors.ground}`);
    expect(html.indexOf('data-ground="vignette"')).toBeLessThan(html.indexOf("Hello"));
  });
});

describe("accent intensity in components", () => {
  const bold = resolveTheme(board({ accentIntensity: "bold" }));

  it("subtle keeps headlines in the text color", () => {
    const html = renderToStaticMarkup(<TitleCard progress={0.5} theme={lightTheme} aspect="9:16" title="Ship it" />);
    expect(html).toMatch(new RegExp(`<h1[^>]*color:${lightTheme.colors.text}`));
  });

  it("bold paints headlines and stats in the accent", () => {
    const title = renderToStaticMarkup(<TitleCard progress={0.5} theme={bold} aspect="9:16" title="Ship it" />);
    expect(title).toMatch(new RegExp(`<h1[^>]*color:${bold.colors.accent}`));
    const stat = renderToStaticMarkup(<BigNumber progress={0.5} theme={bold} aspect="9:16" value={42} />);
    expect(stat).toMatch(new RegExp(`<h1[^>]*color:${bold.colors.accent}`));
  });

  it("bold fills cards with the accent and labels them in accentText", () => {
    const html = renderToStaticMarkup(<FlowDiagram progress={0.5} theme={bold} aspect="16:9" nodes={["A", "B"]} />);
    expect(html).toContain(`background-color:${bold.colors.accent}`);
    expect(html).toContain(`color:${bold.colors.accentText}`);
  });
});
