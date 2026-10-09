import { describe, expect, it } from "vitest";
import { ASPECTS, TYPE_ROLES, darkTheme, lightTheme, neutralTheme, validateStoryboard, type Storyboard } from "../src/index";
import { BrowserNotFoundError, launchBrowser } from "../src/render/browser";
import { bundlePage } from "../src/render/bundle";
import {
  BUNDLED_FONTS,
  fontFaceCss,
  fontLoadRequests,
  GEIST_FAMILY,
  GEIST_MONO_FAMILY,
  KIT_WEIGHTS,
  MONO_FAMILY,
  SANS_FAMILY,
} from "../src/render/fonts";
import { createReadyGate, loadFonts, RenderNotReadyError, waitUntilReady, type ReadySources } from "../src/render/ready";
import { showFrame, withRenderPage } from "../src/render/session";

/** Sources with nothing to wait for, overridable per test. */
function sources(overrides: Partial<ReadySources> = {}): ReadySources {
  return { fonts: () => Promise.resolve(), images: () => [], ...overrides };
}

/** A promise plus the function that resolves it. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Whether `promise` has settled after the microtask queue drains. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  await new Promise((r) => setTimeout(r, 0));
  return done;
}

describe("ready gate", () => {
  it("tracks pending handles by label", () => {
    const gate = createReadyGate();
    const a = gate.delayRender("video a");
    const b = gate.delayRender("video b");
    expect(a).not.toBe(b);
    expect(gate.pending()).toEqual(["video a", "video b"]);
    gate.continueRender(a);
    expect(gate.pending()).toEqual(["video b"]);
  });

  it("throws on releasing an unknown or already released handle", () => {
    const gate = createReadyGate();
    const h = gate.delayRender("x");
    gate.continueRender(h);
    expect(() => gate.continueRender(h)).toThrow(/handle/);
    expect(() => gate.continueRender(999)).toThrow(/handle/);
  });

  it("is ready at once when nothing is pending", async () => {
    await expect(waitUntilReady(createReadyGate(), sources(), 1000)).resolves.toBeUndefined();
  });

  it("waits for a delayed handle until it is released", async () => {
    const gate = createReadyGate();
    const h = gate.delayRender("clip frame");
    const ready = waitUntilReady(gate, sources(), 5000);
    expect(await settled(ready)).toBe(false);
    gate.continueRender(h);
    await expect(ready).resolves.toBeUndefined();
  });

  it("waits for fonts and every image decode", async () => {
    const fonts = deferred();
    const image = deferred();
    const ready = waitUntilReady(
      createReadyGate(),
      sources({ fonts: () => fonts.promise, images: () => [{ label: "a.png", decode: () => image.promise }] }),
      5000,
    );
    expect(await settled(ready)).toBe(false);
    fonts.resolve();
    expect(await settled(ready)).toBe(false);
    image.resolve();
    await expect(ready).resolves.toBeUndefined();
  });

  it("names exactly what never became ready when it times out", async () => {
    const gate = createReadyGate();
    gate.delayRender("video intro.mp4");
    const done = gate.delayRender("released");
    gate.continueRender(done);
    const error = await waitUntilReady(
      gate,
      sources({
        fonts: () => new Promise(() => {}),
        images: () => [
          { label: "ok.png", decode: () => Promise.resolve() },
          { label: "stuck.png", decode: () => new Promise(() => {}) },
        ],
      }),
      30,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RenderNotReadyError);
    const { message, pending } = error as RenderNotReadyError;
    expect(pending).toEqual(["fonts", 'image "stuck.png"', 'delayRender("video intro.mp4")']);
    expect(message).toMatch(/30 ms/);
    expect(message).toContain('delayRender("video intro.mp4")');
    expect(message).not.toContain("ok.png");
    expect(message).not.toContain("released");
  });

  it("fails with the image's label when it cannot decode", async () => {
    const ready = waitUntilReady(
      createReadyGate(),
      sources({ images: () => [{ label: "broken.png", decode: () => Promise.reject(new Error("EncodingError")) }] }),
      1000,
    );
    await expect(ready).rejects.toThrow(/image "broken.png".*EncodingError/);
  });

  it("fails with the error passed to cancelRender", async () => {
    const gate = createReadyGate();
    gate.delayRender("clip");
    const ready = waitUntilReady(gate, sources(), 5000);
    gate.cancelRender(new Error("clip.mp4 is not a video"));
    await expect(ready).rejects.toThrow("clip.mp4 is not a video");
  });
});

describe("bundled fonts", () => {
  it("bundles variable Source Sans 3 and Source Code Pro as the defaults, and Geist as an alternative, under private names", () => {
    const faces = BUNDLED_FONTS.map(({ family, name, file }) => [family, name, file]);
    expect(faces).toEqual([
      [SANS_FAMILY, "Source Sans 3", "SourceSans3VF-Upright.ttf.woff2"],
      [MONO_FAMILY, "Source Code Pro", "SourceCodeVF-Upright.ttf.woff2"],
      [GEIST_FAMILY, "Geist", "Geist-Variable.woff2"],
      [GEIST_MONO_FAMILY, "Geist Mono", "GeistMono-Variable.woff2"],
    ]);
  });

  it("covers every weight the kit uses with one variable face per family, so no weight is swapped", () => {
    const used = new Set<number>(Object.values(lightTheme.weights));
    for (const theme of [lightTheme, darkTheme, neutralTheme]) {
      for (const role of TYPE_ROLES) for (const aspect of ASPECTS) used.add(theme.type[role][aspect].weight);
    }
    expect([...used].sort((a, b) => a - b)).toEqual([...KIT_WEIGHTS]);
    for (const { family, weights } of BUNDLED_FONTS) {
      for (const weight of KIT_WEIGHTS) {
        expect(weight, family).toBeGreaterThanOrEqual(weights[0]);
        expect(weight, family).toBeLessThanOrEqual(weights[1]);
      }
    }
  });

  it("declares each face's weight range, so CSS matching uses the variable axis", async () => {
    const css = await fontFaceCss();
    for (const { family, weights } of BUNDLED_FONTS) {
      expect(css).toContain(`font-family:"${family}";font-style:normal;font-weight:${weights[0]} ${weights[1]};`);
    }
  });

  it("loads font requests and names any that no face matched", async () => {
    const faces: Record<string, string[]> = { "400 16px a": ["a"], "700 16px a": [] , "400 16px b": [] };
    const load = (font: string) => Promise.resolve(faces[font] ?? []);
    await expect(loadFonts(["400 16px a"], load)).resolves.toBeUndefined();
    await expect(loadFonts(Object.keys(faces), load)).rejects.toThrow("no bundled face for 700 16px a, 400 16px b");
  });

  it("asks the readiness gate to load every family at every kit weight", () => {
    const requests = fontLoadRequests();
    expect(requests).toHaveLength(BUNDLED_FONTS.length * KIT_WEIGHTS.length);
    expect(requests).toContain(`700 16px "${SANS_FAMILY}"`);
    expect(requests).toContain(`450 16px "${MONO_FAMILY}"`);
    expect(requests).toContain(`800 16px "${GEIST_FAMILY}"`);
  });

  it("embeds every face as a woff2 data URL, so nothing is fetched", async () => {
    const css = await fontFaceCss();
    expect(css.match(/@font-face/g)).toHaveLength(BUNDLED_FONTS.length);
    expect(css.match(/url\(data:font\/woff2;base64,d09GMg/g)).toHaveLength(BUNDLED_FONTS.length);
    expect(css).not.toMatch(/https?:/);
  });
});

function storyboard(): Storyboard {
  const result = validateStoryboard({
    title: "Ready",
    aspect: "16:9",
    scenes: [{ id: "a", component: "TitleCard", props: { title: "Ready" }, durationMs: 1000 }],
  });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

/** Runs `body`, skipping the test when no Chrome or Edge is installed. */
async function orSkip<T>(ctx: { skip: (note: string) => never }, body: () => Promise<T>): Promise<T> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed: ${error.message}`);
    throw error;
  }
}

describe("render page (integration)", () => {
  it("loads the bundled fonts offline and uses them instead of a fallback", { timeout: 60_000 }, async (ctx) => {
    const input = { storyboard: storyboard(), theme: neutralTheme, durations: {} };
    const html = await bundlePage(input);
    const browser = await orSkip(ctx, launchBrowser);
    try {
      const page = await browser.newPage();
      const requests: string[] = [];
      // Serve the page; refuse (and record) anything else that tries the network.
      await page.route("**/*", (route) => {
        const url = route.request().url();
        if (url === "https://motioncraft.localhost/render.html") return route.fulfill({ contentType: "text/html", body: html });
        requests.push(url);
        return route.abort();
      });
      await page.goto("https://motioncraft.localhost/render.html");
      await page.waitForFunction(() => window.motioncraft !== undefined);
      await page.evaluate(() => window.motioncraft!.renderFrame(0));
      await page.evaluate(() => window.motioncraft!.waitUntilReady(10_000));

      const result = await page.evaluate(
        ({ sans, mono }) => {
          const width = (family: string, weight: number) => {
            const span = document.createElement("span");
            span.textContent = "The quick brown fox jumps over 0123456789";
            span.style.cssText = `font: ${weight} 48px ${family}; position: absolute; white-space: nowrap`;
            document.body.append(span);
            const w = span.getBoundingClientRect().width;
            span.remove();
            return w;
          };
          // Each family against a fallback of the other kind, so a fallback is never mistaken for it.
          const versus = (family: string, fallback: string, w: number) => [width(`"${family}", ${fallback}`, w), width(fallback, w)];
          return {
            loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`),
            sans: sans.flatMap((family) => [400, 600, 800].map((w) => versus(family, "monospace", w))),
            mono: mono.flatMap((family) => [400, 600].map((w) => versus(family, "serif", w))),
          };
        },
        { sans: [SANS_FAMILY, GEIST_FAMILY], mono: [MONO_FAMILY, GEIST_MONO_FAMILY] },
      );
      expect(requests).toEqual([]);
      expect(result.loaded.sort()).toEqual(BUNDLED_FONTS.map((f) => `${f.family} ${f.weights[0]} ${f.weights[1]}`).sort());
      for (const [bundled, fallback] of [...result.sans, ...result.mono]) {
        expect(Math.abs(bundled! - fallback!)).toBeGreaterThan(5);
      }
    } finally {
      await browser.close();
    }
  });

  it("renders every weight the kit uses as itself", { timeout: 60_000 }, async (ctx) => {
    const input = { storyboard: storyboard(), theme: lightTheme, durations: {} };
    const result = await orSkip(ctx, () =>
      withRenderPage(input, async (page) => {
        await showFrame(page, 0);
        return page.evaluate(
          ({ sans, mono, weights }) => {
            const sample = "The quick brown fox jumps over 0123456789";
            // Proportional faces get wider as they get heavier.
            const width = (family: string, weight: number) => {
              const span = document.createElement("span");
              span.textContent = sample;
              span.style.cssText = `font: ${weight} 48px "${family}", serif; position: absolute; white-space: nowrap`;
              document.body.append(span);
              const w = span.getBoundingClientRect().width;
              span.remove();
              return w;
            };
            // Monospaced faces keep their width, so count the ink instead.
            const ink = (family: string, weight: number) => {
              const canvas = document.createElement("canvas");
              canvas.width = 1600;
              canvas.height = 80;
              const g = canvas.getContext("2d")!;
              g.font = `${weight} 48px "${family}", serif`;
              g.fillText(sample, 4, 60);
              const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
              let sum = 0;
              for (let i = 3; i < data.length; i += 4) sum += data[i]!;
              return sum;
            };
            return {
              sans: sans.map((family) => weights.map((w) => width(family, w))),
              mono: mono.map((family) => weights.map((w) => ink(family, w))),
            };
          },
          { sans: [SANS_FAMILY, GEIST_FAMILY], mono: [MONO_FAMILY, GEIST_MONO_FAMILY], weights: [400, 500, 600, 700, 800] },
        );
      }),
    );
    for (const series of [...result.sans, ...result.mono]) {
      // Strictly increasing: each weight is drawn, none falls back to a neighbour.
      for (let i = 1; i < series.length; i++) expect(series[i]!).toBeGreaterThan(series[i - 1]! * 1.005);
    }
  });

  it("holds capture while a delayRender handle is pending", { timeout: 60_000 }, async (ctx) => {
    const input = { storyboard: storyboard(), theme: neutralTheme, durations: {} };
    await orSkip(ctx, () =>
      withRenderPage(input, async (page) => {
        const handle = await page.evaluate(() => window.motioncraft!.delayRender("test clip"));
        let shown = false;
        const showing = showFrame(page, 0).then(() => (shown = true));
        await new Promise((r) => setTimeout(r, 500));
        expect(shown).toBe(false);
        await page.evaluate((h) => window.motioncraft!.continueRender(h), handle);
        await showing;
        expect(shown).toBe(true);
      }),
    );
  });

  it("fails with a clear error naming a handle that is never released", { timeout: 60_000 }, async (ctx) => {
    const input = { storyboard: storyboard(), theme: neutralTheme, durations: {} };
    const error = await orSkip(ctx, () =>
      withRenderPage(input, async (page) => {
        await page.evaluate(() => window.motioncraft!.delayRender("stuck clip"));
        return showFrame(page, 0, 200).catch((e: unknown) => e);
      }),
    );
    expect(error).toBeInstanceOf(RenderNotReadyError);
    expect((error as Error).message).toContain('delayRender("stuck clip")');
  });
});
