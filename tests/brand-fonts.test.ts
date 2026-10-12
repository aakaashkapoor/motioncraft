// Brand fonts: a storyboard's own font files, declared in `fonts` and named in
// `themeOverrides.fonts`. Validation of the entries and the override names, the
// @font-face CSS under private family names, the theme's resolution of a
// declared name, the layer-1 file check, and the fixtures in the browser.

import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkBrandFonts } from "../src/checks/brandFonts";
import { ASPECTS, resolveTheme, validateStoryboard, type Aspect, type Storyboard } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { brandFamily, brandFontFaceCss, fontLoadRequests, FONTS_DIR, KIT_WEIGHTS, MONO_FAMILY, SANS_FAMILY } from "../src/render/fonts";
import { showFrame, withRenderPage } from "../src/render/session";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");

function board(extra: Record<string, unknown>) {
  return {
    title: "Brand",
    aspect: "9:16",
    scenes: [{ id: "a", component: "TitleCard", props: { title: "Brand" }, durationMs: 1000 }],
    ...extra,
  };
}

const INTER = { name: "Inter Tight", file: "fonts/InterTight.woff2", license: "OFL-1.1", weights: [100, 900] };

function errorsOf(input: unknown): string[] {
  const result = validateStoryboard(input);
  return result.ok ? [] : result.errors;
}

function valid(input: unknown): Storyboard {
  const result = validateStoryboard(input);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

describe("brandFamily", () => {
  it("is a private family name from a slug of the font's name", () => {
    expect(brandFamily("Inter Tight")).toBe("mc-brand-inter-tight");
    expect(brandFamily("  Söhne Breit 2 ")).toBe("mc-brand-s-hne-breit-2");
  });
});

describe("storyboard fonts: validation", () => {
  it("accepts a good entry and keeps it", () => {
    const sb = valid(board({ fonts: [INTER], themeOverrides: { fonts: { display: "Inter Tight" } } }));
    expect(sb.fonts).toEqual([INTER]);
  });

  it("accepts every allowed license, extension and an italic face without weights", () => {
    const fonts = [
      { name: "A", file: "a.woff2", license: "OFL-1.1" },
      { name: "B", file: "b.WOFF", license: "Apache-2.0" },
      { name: "C", file: "dir/c.ttf", license: "MIT" },
      { name: "D", file: "d.otf", license: "CC0-1.0" },
      { name: "E", file: "e.ttf", license: "UFL-1.0", italic: true },
    ];
    expect(errorsOf(board({ fonts }))).toEqual([]);
  });

  it("rejects a GPL or unknown license, pointing at AGENTS.md's license rule", () => {
    for (const license of ["GPL-3.0", "personal use only", undefined]) {
      const errors = errorsOf(board({ fonts: [{ ...INTER, license }] }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/^fonts\[0\] \("Inter Tight"\)\.license must be one of "OFL-1.1", "Apache-2.0", "MIT", "CC0-1.0" or "UFL-1.0"/);
      expect(errors[0]).toContain("AGENTS.md");
    }
  });

  it("rejects a bad extension and an absolute path", () => {
    expect(errorsOf(board({ fonts: [{ ...INTER, file: "fonts/Inter.eot" }] }))).toEqual([
      'fonts[0] ("Inter Tight").file must be a .woff2, .woff, .ttf or .otf file (got "fonts/Inter.eot")',
    ]);
    expect(errorsOf(board({ fonts: [{ ...INTER, file: "C:/fonts/Inter.woff2" }] }))).toEqual([
      'fonts[0] ("Inter Tight").file must be a path relative to the storyboard (got "C:/fonts/Inter.woff2")',
    ]);
  });

  it("rejects bad names, weights, italic and unknown fields", () => {
    expect(errorsOf(board({ fonts: "Inter" }))).toEqual(['fonts must be an array of { name, file, license, weights?, italic? } (got "Inter")']);
    expect(errorsOf(board({ fonts: [{ ...INTER, name: " " }] }))).toEqual(['fonts[0].name must be a non-empty string (got " ")']);
    expect(errorsOf(board({ fonts: [{ ...INTER, name: "Geist" }] }))).toEqual([
      'fonts[0] ("Geist").name is a bundled font; name it in themeOverrides.fonts without declaring it',
    ]);
    expect(errorsOf(board({ fonts: [{ ...INTER, weights: [700, 400] }] }))).toEqual([
      'fonts[0] ("Inter Tight").weights must be [min, max] with whole numbers from 1 to 1000 and min <= max (got [700,400])',
    ]);
    expect(errorsOf(board({ fonts: [{ ...INTER, italic: "yes" }] }))).toEqual(['fonts[0] ("Inter Tight").italic must be true or false (got "yes")']);
    expect(errorsOf(board({ fonts: [{ ...INTER, url: "https://x" }] }))).toEqual(['fonts[0] ("Inter Tight"): unknown field "url"']);
  });

  it("allows one family in several files but not two faces that overlap, nor two names with one private family", () => {
    const regular = { name: "Brand", file: "brand-400.ttf", license: "OFL-1.1" };
    const bold = { ...regular, file: "brand-700.ttf", weights: [700, 700] };
    const italic = { ...regular, file: "brand-italic.ttf", italic: true };
    expect(errorsOf(board({ fonts: [regular, bold, italic] }))).toEqual([]);
    expect(errorsOf(board({ fonts: [regular, { ...regular, file: "other.ttf" }] }))).toEqual([
      'fonts[1] ("Brand"): overlaps the weights of fonts[0], a face of the same family and style',
    ]);
    expect(errorsOf(board({ fonts: [regular, { ...regular, name: "brand!" }] }))).toEqual([
      'fonts[1] ("brand!").name has the same private family as fonts[0] ("Brand"); give it a different name',
    ]);
  });

  it("rejects an override naming a font that is neither bundled nor declared", () => {
    expect(errorsOf(board({ themeOverrides: { fonts: { display: "Inter Tight" } } }))).toEqual([
      'themeOverrides.fonts.display names "Inter Tight", which is neither a bundled font (Source Sans 3, Source Code Pro, Geist or Geist Mono) nor declared in "fonts"',
    ]);
    expect(errorsOf(board({ fonts: [INTER], themeOverrides: { fonts: { body: "Inter Tight, Comic Sans MS, sans-serif" } } }))).toEqual([
      'themeOverrides.fonts.body names "Comic Sans MS", which is neither a bundled font (Source Sans 3, Source Code Pro, Geist or Geist Mono) nor declared in "fonts"',
    ]);
  });

  it("still accepts the stacks the built-in themes and the guide use", () => {
    const fonts = { display: "mc-geist, sans-serif", body: "Geist", mono: 'mc-geist-mono, ui-monospace, "Cascadia Code", monospace' };
    expect(errorsOf(board({ themeOverrides: { fonts } }))).toEqual([]);
    expect(errorsOf(board({ themeOverrides: { fonts: { body: resolveTheme("light").fonts.body, mono: resolveTheme("neutral").fonts.mono } } }))).toEqual([]);
  });
});

describe("storyboard fonts: theme", () => {
  it("resolves a declared name to its private family, with the bundled sans and the system stack as fallback", () => {
    const theme = resolveTheme(valid(board({ fonts: [INTER], themeOverrides: { fonts: { display: "Inter Tight", mono: "Inter Tight" } } })));
    expect(theme.fonts.display.startsWith(`"mc-brand-inter-tight", ${SANS_FAMILY}, system-ui`)).toBe(true);
    expect(theme.fonts.display.endsWith("sans-serif")).toBe(true);
    expect(theme.fonts.mono.startsWith(`"mc-brand-inter-tight", ${MONO_FAMILY}, ui-monospace`)).toBe(true);
    expect(theme.fonts.body).toBe(resolveTheme("light").fonts.body);
  });

  it("keeps the author's own fallbacks, adding the bundled family before the generic one", () => {
    const theme = resolveTheme(valid(board({ fonts: [INTER], themeOverrides: { fonts: { body: '"Inter Tight", sans-serif' } } })));
    expect(theme.fonts.body).toBe(`"mc-brand-inter-tight", ${SANS_FAMILY}, sans-serif`);
  });

  it("names a bundled font by its private family", () => {
    expect(resolveTheme(valid(board({ themeOverrides: { fonts: { display: "Geist" } } }))).fonts.display.startsWith("mc-geist, ")).toBe(true);
  });
});

describe("storyboard fonts: @font-face", () => {
  it("has one @font-face per declared font with the private family, the style and the weight range", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mc-brand-"));
    try {
      await copyFile(join(FONTS_DIR, "Geist-Variable.woff2"), join(dir, "a.woff2"));
      await writeFile(join(dir, "b.ttf"), Buffer.from([0, 1, 0, 0, 9, 9]));
      const css = await brandFontFaceCss(
        [
          { name: "Brand Sans", file: "a.woff2", license: "OFL-1.1", weights: [100, 900] },
          { name: "Brand Sans", file: "b.ttf", license: "OFL-1.1", italic: true },
        ],
        dir,
      );
      expect(css.match(/@font-face/g)).toHaveLength(2);
      expect(css).toContain('font-family:"mc-brand-brand-sans";font-style:normal;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,d09GMg');
      expect(css).toContain('font-family:"mc-brand-brand-sans";font-style:italic;font-weight:400 400;font-display:block;src:url(data:font/ttf;base64,AAEAAAkJ) format("truetype")');
      expect(css).not.toMatch(/https?:/);
      expect(await brandFontFaceCss(undefined, dir)).toBe("");
      await expect(brandFontFaceCss([{ name: "X", file: "missing.otf", license: "MIT" }], dir)).rejects.toThrow('font "X": cannot read "missing.otf"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("asks the readiness gate to load each brand face at the kit weights it covers", () => {
    const requests = fontLoadRequests([
      { name: "Brand", file: "a.ttf", license: "MIT" },
      { name: "Brand", file: "b.ttf", license: "MIT", weights: [600, 900], italic: true },
    ]);
    expect(requests).toContain('400 16px "mc-brand-brand"');
    expect(requests).not.toContain('700 16px "mc-brand-brand"');
    expect(requests).toEqual(expect.arrayContaining(['italic 600 16px "mc-brand-brand"', 'italic 800 16px "mc-brand-brand"']));
    expect(requests.length).toBe(fontLoadRequests().length + 1 + KIT_WEIGHTS.filter((w) => w >= 600).length);
  });
});

describe("storyboard fonts: layer-1 check", () => {
  it("errors on a missing file or one that is not a font, and warns that text fitting is tuned for the bundled fonts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mc-brand-"));
    try {
      await copyFile(join(FONTS_DIR, "Geist-Variable.woff2"), join(dir, "good.woff2"));
      await writeFile(join(dir, "fake.ttf"), "<html>not a font</html>");
      await writeFile(join(dir, "otto.otf"), Buffer.from("OTTO...."));
      const sb = valid(
        board({
          fonts: [
            { name: "Good", file: "good.woff2", license: "OFL-1.1" },
            { name: "Fake", file: "fake.ttf", license: "OFL-1.1" },
            { name: "Gone", file: "gone.woff", license: "OFL-1.1" },
            { name: "Otto", file: "otto.otf", license: "OFL-1.1" },
          ],
          themeOverrides: { fonts: { display: "Good" } },
        }),
      );
      const { errors, warnings } = await checkBrandFonts(sb, dir);
      expect(errors).toHaveLength(2);
      expect(errors[0]).toMatch(/^error \[brand-font\] fonts\[1\] \("Fake"\): "fake.ttf" is not a font file \(it does not start with wOF2, wOFF, 00 01 00 00 or OTTO\)/);
      expect(errors[1]).toMatch(/^error \[brand-font\] fonts\[2\] \("Gone"\): "gone.woff" not found \(looked for .*gone.woff\)$/);
      expect(warnings).toEqual([
        'warn [brand-font] themeOverrides.fonts.display uses brand font "Good": text fitting estimates widths for the bundled fonts, so open the stills and look for text that overflows or wraps badly',
      ]);
      expect(await checkBrandFonts(valid(board({})), dir)).toEqual({ errors: [], warnings: [] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

const FIXTURES: Record<Aspect, string> = { "9:16": "brand-font.json", "16:9": "brand-font-wide.json", "4:5": "brand-font-45.json" };

async function fixture(aspect: Aspect): Promise<Storyboard> {
  return valid(JSON.parse(await readFile(join(FIXTURES_DIR, FIXTURES[aspect]), "utf8")));
}

describe("tests/fixtures/brand-font", () => {
  for (const aspect of ASPECTS) {
    it(`${aspect}: declares an OFL font file and passes the file check`, async () => {
      const sb = await fixture(aspect);
      expect(sb.aspect).toBe(aspect);
      expect(sb.fonts).toEqual([{ name: "Splitly Sans", file: "media/brand-sans.woff2", license: "OFL-1.1", weights: [100, 900] }]);
      const { errors, warnings } = await checkBrandFonts(sb, FIXTURES_DIR);
      expect(errors).toEqual([]);
      expect(warnings).toHaveLength(2);
    });

    it(`${aspect}: renders its text in the brand family`, { timeout: 60_000 }, async (ctx) => {
      const sb = await fixture(aspect);
      const theme = resolveTheme(sb);
      const input = { storyboard: sb, theme, durations: estimateDurations(sb), mediaDir: FIXTURES_DIR };
      let result;
      try {
        result = await withRenderPage(input, async (page) => {
          await showFrame(page, 45);
          return page.evaluate((family) => {
            const texts = [...document.querySelectorAll("#root *")].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() !== ""));
            const width = (font: string) => {
              const span = document.createElement("span");
              span.textContent = "Split every bill in seconds";
              span.style.cssText = `font: 600 48px ${font}; position: absolute; white-space: nowrap`;
              document.body.append(span);
              const w = span.getBoundingClientRect().width;
              span.remove();
              return w;
            };
            return {
              families: texts.map((el) => getComputedStyle(el).fontFamily),
              loaded: [...document.fonts].filter((f) => f.status === "loaded" && f.family.replace(/"/g, "") === family).length,
              brand: width(`"${family}", monospace`),
              fallback: width("monospace"),
            };
          }, brandFamily("Splitly Sans"));
        });
      } catch (error) {
        if (error instanceof BrowserNotFoundError) return ctx.skip(`no Chrome or Edge installed: ${error.message}`);
        throw error;
      }
      expect(result.families.length).toBeGreaterThan(0);
      for (const family of result.families) expect(family).toMatch(/^"?mc-brand-splitly-sans"?,/);
      expect(result.loaded).toBe(1);
      expect(Math.abs(result.brand - result.fallback)).toBeGreaterThan(5);
    });
  }
});
