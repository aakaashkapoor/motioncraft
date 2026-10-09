import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  AppWindow,
  BrowserWindow,
  CodeWindow,
  TerminalWindow,
  TRAFFIC_LIGHTS,
  contentArea,
  darkTheme,
  kit,
  lightTheme,
  safeZones,
  slotTransform,
  windowLayout,
  type Aspect,
} from "../src/index";

/** Parses an inline `style="..."` attribute into a map. */
function parseStyle(style: string): Map<string, string> {
  return new Map(
    style
      .split(";")
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(":");
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as const;
      }),
  );
}

/**
 * The full markup of the first element carrying `attr`, from its opening tag to
 * its matching closing tag (server markup is well formed, so counting works).
 */
function element(html: string, attr: string): string {
  const start = html.search(new RegExp(`<[a-z]+[^>]*\\s${attr}(=|\\s|>)`));
  if (start < 0) throw new Error(`no element with ${attr}`);
  const tag = /<[^>]*>/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let m = tag.exec(html); m !== null; m = tag.exec(html)) {
    const t = m[0];
    if (t.startsWith("</")) depth--;
    else if (!t.endsWith("/>")) depth++;
    if (depth === 0) return html.slice(start, tag.lastIndex);
  }
  throw new Error(`unclosed element with ${attr}`);
}

function styleOf(html: string, attr: string): Map<string, string> {
  const open = /^<[^>]*>/.exec(element(html, attr))![0];
  return parseStyle(/style="([^"]*)"/.exec(open)?.[1] ?? "");
}

const CONTENT = { component: "StepList", props: { title: "Inside", items: ["First step", "Second step"] } };

const app = (aspect: Aspect, progress: number, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <AppWindow progress={progress} theme={lightTheme} aspect={aspect} title="Notes" content={CONTENT} {...extra} />,
  );

const browser = (aspect: Aspect, progress: number, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <BrowserWindow
      progress={progress}
      theme={lightTheme}
      aspect={aspect}
      url="example.com/docs"
      tabs={["Docs", "Pricing"]}
      content={CONTENT}
      {...extra}
    />,
  );

describe("windowLayout", () => {
  it.each(ASPECTS)("fills the content area (9:16: the primary width, centered) with a content box below the chrome (%s)", (aspect) => {
    for (const toolbar of [false, true]) {
      const layout = windowLayout(lightTheme, aspect, toolbar);
      const full = contentArea(lightTheme, aspect);
      const width = aspect === "9:16" ? safeZones(aspect).primaryWidth : full.width;
      const area = { ...full, x: full.x + (full.width - width) / 2, width };
      expect(layout.box).toEqual(area);
      expect(layout.titleBar).toBeGreaterThan(0);
      expect(layout.toolbar > 0).toBe(toolbar);
      expect(layout.content.y).toBe(layout.titleBar + layout.toolbar);
      // Inside the hairline border.
      const inner = 2 * lightTheme.hairline;
      expect(layout.content.x).toBe(0);
      expect(layout.content.width).toBe(area.width - inner);
      expect(layout.content.y + layout.content.height).toBe(area.height - inner);
    }
  });
});

describe("slotTransform", () => {
  it.each(ASPECTS)("maps the nested component's content area inside the box (%s)", (aspect) => {
    const box = windowLayout(lightTheme, aspect, true).content;
    const { scale, x, y } = slotTransform(lightTheme, aspect, box);
    const area = contentArea(lightTheme, aspect);
    expect(scale).toBeGreaterThan(0.5);
    expect(scale).toBeLessThanOrEqual(1);
    const left = x + area.x * scale;
    const top = y + area.y * scale;
    expect(left).toBeGreaterThanOrEqual(-0.001);
    expect(top).toBeGreaterThanOrEqual(-0.001);
    expect(left + area.width * scale).toBeLessThanOrEqual(box.width + 0.001);
    expect(top + area.height * scale).toBeLessThanOrEqual(box.height + 0.001);
  });
});

describe("AppWindow", () => {
  it("is registered in the kit", () => {
    expect(kit.AppWindow).toBe(AppWindow);
  });

  it.each(ASPECTS)("draws title bar, traffic lights, title and a content box (%s)", (aspect) => {
    const html = app(aspect, 0.5);
    expect(html).toContain('data-window="app"');
    const bar = element(html, "data-window-titlebar");
    expect(bar).toContain("Notes");
    expect(element(bar, "data-traffic-lights").match(/data-light/g)).toHaveLength(3);
    expect(html).toContain("data-window-content");
    expect(html).not.toContain("data-address-bar");
  });

  it.each(ASPECTS)("renders the nested component inside the content box (%s)", (aspect) => {
    const html = app(aspect, 0.5);
    const box = element(html, "data-window-content");
    expect(box).toContain("Inside");
    expect(box).toContain("First step");
    expect(box).toContain("Second step");
    expect(styleOf(html, "data-window-content").get("overflow")).toBe("hidden");
    expect(element(html, "data-window-titlebar")).not.toContain("First step");
  });

  it("uses the theme surface, radius, hairline border and shadow", () => {
    const style = styleOf(app("9:16", 0.5), "data-window");
    expect(style.get("background-color")).toBe(lightTheme.colors.surface);
    expect(style.get("border-radius")).toBe(`${lightTheme.radius.md}px`);
    expect(style.get("border")).toContain(lightTheme.colors.border);
    expect(style.get("box-shadow")).toContain(`${lightTheme.cardShadow.blur}px`);
    expect(styleOf(renderToStaticMarkup(<AppWindow progress={0.5} theme={darkTheme} aspect="16:9" />), "data-window").get("background-color")).toBe(darkTheme.colors.surface);
  });

  it("drops the traffic lights in the minimal style", () => {
    const html = app("16:9", 0.5, { chrome: "minimal" });
    expect(html).toContain("Notes");
    expect(html).not.toContain("data-traffic-lights");
  });

  it("renders an empty content box when no content is given", () => {
    const html = renderToStaticMarkup(<AppWindow progress={0.5} theme={lightTheme} aspect="9:16" />);
    expect(element(html, "data-window-content")).toMatch(/^<div[^>]*><\/div>$/);
  });

  it("throws a clear error for an unknown nested component", () => {
    expect(() => app("9:16", 0.5, { content: { component: "Nope" } })).toThrow(/unknown component "Nope"/);
  });

  it("enters with a scale-and-rise and leaves by fading out", () => {
    const motion = (progress: number) => {
      const style = styleOf(app("9:16", progress), "data-window");
      const t = style.get("transform") ?? "";
      return {
        opacity: parseFloat(style.get("opacity")!),
        rise: parseFloat(/translateY\((-?[\d.]+)px\)/.exec(t)![1]!),
        scale: parseFloat(/scale\(([\d.]+)\)/.exec(t)![1]!),
      };
    };
    const start = motion(0);
    const early = motion(0.08);
    const middle = motion(0.5);
    const end = motion(1);
    expect(start.opacity).toBeCloseTo(0, 3);
    expect(start.scale).toBeLessThan(1);
    expect(start.rise).toBeGreaterThan(0);
    expect(early.scale).toBeGreaterThan(start.scale);
    expect(early.rise).toBeLessThan(start.rise);
    expect(middle).toEqual({ opacity: 1, rise: 0, scale: 1 });
    expect(end.opacity).toBeCloseTo(0, 3);
  });

  it("carries its shareId so the window can morph between scenes", () => {
    expect(styleOf(app("9:16", 0.5, { shareId: "hero" }), 'data-share-id="hero"').get("background-color")).toBe(
      lightTheme.colors.surface,
    );
    expect(app("9:16", 0.5)).not.toContain("data-share-id");
  });

  it("escapes text", () => {
    expect(app("9:16", 0.5, { title: "<b>" })).toContain("&lt;b&gt;");
  });
});

describe("BrowserWindow", () => {
  it("is registered in the kit", () => {
    expect(kit.BrowserWindow).toBe(BrowserWindow);
  });

  it.each(ASPECTS)("draws traffic lights, tabs and an address bar with the url (%s)", (aspect) => {
    const html = browser(aspect, 0.5);
    expect(html).toContain('data-window="browser"');
    const bar = element(html, "data-window-titlebar");
    expect(bar).toContain("data-traffic-lights");
    const tabs = [...bar.matchAll(/data-tab="(\d+)"/g)].map((m) => m[1]);
    expect(tabs).toEqual(["0", "1"]);
    expect(element(bar, 'data-tab="0"')).toContain("Docs");
    expect(element(bar, 'data-tab="1"')).toContain("Pricing");
    expect(element(html, "data-address-bar")).toContain("example.com/docs");
  });

  it.each(ASPECTS)("renders the nested component inside the content box, below the address bar (%s)", (aspect) => {
    const html = browser(aspect, 0.5);
    const box = element(html, "data-window-content");
    expect(box).toContain("First step");
    expect(box).not.toContain("example.com");
    expect(html.indexOf("data-address-bar")).toBeLessThan(html.indexOf("data-window-content"));
  });

  it("marks the active tab", () => {
    const html = browser("16:9", 0.5, { activeTab: 1 });
    expect(element(html, 'data-tab="1"')).toContain('data-active="true"');
    expect(element(html, 'data-tab="0"')).not.toContain('data-active="true"');
  });

  it("shows one tab named after the url's host when no tabs are given", () => {
    const html = renderToStaticMarkup(
      <BrowserWindow progress={0.5} theme={lightTheme} aspect="9:16" url="https://www.example.com/a/b" />,
    );
    expect([...html.matchAll(/data-tab="/g)]).toHaveLength(1);
    expect(element(html, 'data-tab="0"')).toContain("example.com");
  });

  it("supports shareId and the minimal style", () => {
    const html = browser("9:16", 0.5, { shareId: "site", chrome: "minimal" });
    expect(html).toContain('data-share-id="site"');
    expect(html).not.toContain("data-traffic-lights");
    expect(html).toContain("data-address-bar");
  });

  it("can nest a window inside a window", () => {
    const html = browser("16:9", 0.5, { content: { component: "AppWindow", props: { title: "Inner", content: CONTENT } } });
    const outer = element(html, "data-window-content");
    expect(outer).toContain('data-window="app"');
    expect(outer).toContain("First step");
  });
});

describe("one window chrome", () => {
  /** The root's style without its position and size, which depend on the window's content. */
  const chromeStyle = (html: string) => {
    const style = parseStyle(/^<[a-z]+[^>]*?style="([^"]*)"/.exec(html)![1]!);
    for (const key of ["left", "top", "width", "height"]) style.delete(key);
    return Object.fromEntries(style);
  };
  const windows = (aspect: Aspect, progress: number) => {
    const props = { progress, theme: lightTheme, aspect };
    return {
      app: renderToStaticMarkup(<AppWindow {...props} title="Notes" content={CONTENT} />),
      browser: renderToStaticMarkup(<BrowserWindow {...props} url="example.com" content={CONTENT} />),
      terminal: renderToStaticMarkup(<TerminalWindow {...props} lines={[{ prompt: true, text: "ls" }]} />),
      code: renderToStaticMarkup(<CodeWindow {...props} code="const x = 1;" title="x.ts" />),
    };
  };

  it.each(ASPECTS.flatMap((aspect) => [0, 0.05, 0.15, 0.5, 0.95, 1].map((p) => [aspect, p] as const)))(
    "gives all four windows the same motion, border, radius and shadow (%s, progress %s)",
    (aspect, progress) => {
      const { app, ...rest } = windows(aspect, progress);
      for (const html of Object.values(rest)) expect(chromeStyle(html)).toEqual(chromeStyle(app));
    },
  );

  it.each(ASPECTS)("gives all four windows the same title bar height (%s)", (aspect) => {
    const heights = Object.values(windows(aspect, 0.5)).map((html) => styleOf(html, "data-window-titlebar").get("height"));
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBe(`${windowLayout(lightTheme, aspect, false).titleBar}px`);
  });

  it("offers traffic lights in color as a chrome style", () => {
    const colored = renderToStaticMarkup(<TerminalWindow progress={0.5} theme={lightTheme} aspect="9:16" lines={[]} chrome="color" />);
    for (const color of TRAFFIC_LIGHTS) expect(colored).toContain(color);
    const plain = renderToStaticMarkup(<TerminalWindow progress={0.5} theme={lightTheme} aspect="9:16" lines={[]} />);
    for (const color of TRAFFIC_LIGHTS) expect(plain).not.toContain(color);
    expect(app("9:16", 0.5, { chrome: "color" })).toContain(TRAFFIC_LIGHTS[0]);
  });
});
