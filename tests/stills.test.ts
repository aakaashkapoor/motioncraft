import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildTimeline, neutralTheme, validateStoryboard, type Storyboard, type StoryboardInput } from "../src/index";
import { parseStillsArgs } from "../src/render/args";
import { BrowserNotFoundError } from "../src/render/browser";
import { pageHtml } from "../src/render/bundle";
import { estimateDurations, estimateNarrationMs } from "../src/render/durations";
import { checkFrames, parseFrameList, perSceneFrames } from "../src/render/frames";
import { Frame } from "../src/render/page";
import { renderStills } from "../src/render/stills";
import { resolveTheme } from "../src/render/themes";

function storyboard(input: Partial<StoryboardInput> = {}): Storyboard {
  const result = validateStoryboard({
    title: "Test",
    aspect: "9:16",
    scenes: [{ id: "a", component: "TitleCard", props: { title: "A" }, durationMs: 1000 }],
    ...input,
  });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

describe("perSceneFrames", () => {
  it("picks the start, middle and end of each scene", () => {
    // 30 fps: 1 s = frames 0..29, 2 s = frames 30..89.
    const timeline = buildTimeline(
      storyboard({
        scenes: [
          { id: "a", component: "TitleCard", props: {}, durationMs: 1000 },
          { id: "b", component: "TitleCard", props: {}, durationMs: 2000 },
        ],
      }),
      {},
    );
    expect(perSceneFrames(timeline)).toEqual([0, 14, 29, 30, 59, 89]);
  });

  it("de-duplicates frames shared by short scenes", () => {
    const timeline = buildTimeline(
      storyboard({
        fps: 10,
        scenes: [
          { id: "one", component: "TitleCard", props: {}, durationMs: 100 },
          { id: "two", component: "TitleCard", props: {}, durationMs: 200 },
          { id: "three", component: "TitleCard", props: {}, durationMs: 300 },
        ],
      }),
      {},
    );
    // one: frame 0; two: frames 1..2; three: frames 3..5.
    expect(perSceneFrames(timeline)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("returns only frames inside the timeline", () => {
    const timeline = buildTimeline(storyboard(), {});
    const frames = perSceneFrames(timeline);
    expect(() => checkFrames(frames, timeline)).not.toThrow();
    expect(frames.at(-1)).toBe(timeline.totalFrames - 1);
  });
});

describe("parseFrameList", () => {
  it("parses, sorts and de-duplicates", () => {
    expect(parseFrameList("30, 0,15,0")).toEqual([0, 15, 30]);
  });

  it.each(["", "1,,2", "-1", "1.5", "abc"])("rejects %j", (text) => {
    expect(() => parseFrameList(text)).toThrow(/--frames/);
  });
});

describe("checkFrames", () => {
  const timeline = buildTimeline(storyboard(), {}); // 30 frames

  it("accepts frames inside the timeline", () => {
    expect(() => checkFrames([0, 29], timeline)).not.toThrow();
  });

  it("names out-of-range frames", () => {
    expect(() => checkFrames([0, 30, 99], timeline)).toThrow("frames 30, 99 out of range: valid frames are 0..29");
  });
});

describe("parseStillsArgs", () => {
  it("parses --frames", () => {
    expect(parseStillsArgs(["sb.json", "--out", "out", "--frames", "0,15,30"])).toEqual({
      storyboard: "sb.json",
      out: "out",
      frames: [0, 15, 30],
    });
  });

  it("parses --per-scene, which is also the default", () => {
    expect(parseStillsArgs(["sb.json", "--out", "out", "--per-scene"]).frames).toBe("per-scene");
    expect(parseStillsArgs(["sb.json", "--out", "out"]).frames).toBe("per-scene");
  });

  it("rejects bad usage", () => {
    expect(() => parseStillsArgs(["--out", "out"])).toThrow(/one storyboard/);
    expect(() => parseStillsArgs(["sb.json"])).toThrow(/--out/);
    expect(() => parseStillsArgs(["sb.json", "--out", "o", "--frames", "1", "--per-scene"])).toThrow(/not both/);
    expect(() => parseStillsArgs(["sb.json", "--out", "o", "--bogus"])).toThrow();
  });
});

describe("estimateDurations", () => {
  it("estimates narrated scenes without durationMs and leaves the rest alone", () => {
    const sb = storyboard({
      scenes: [
        { id: "timed", component: "TitleCard", props: {}, narration: "five words of narration here", durationMs: 9000 },
        { id: "spoken", component: "TitleCard", props: {}, narration: "five words of narration here" },
      ],
    });
    expect(estimateNarrationMs("five words of narration here")).toBe(2600);
    expect(estimateDurations(sb)).toEqual({ spoken: 2600 });
  });
});

describe("resolveTheme", () => {
  it("knows the neutral theme and names the known themes otherwise", () => {
    expect(resolveTheme("neutral")).toBe(neutralTheme);
    expect(() => resolveTheme("nope")).toThrow(/unknown theme "nope" \(known: light, dark, neutral\)/);
  });
});

describe("Frame", () => {
  const sb = storyboard({
    scenes: [
      { id: "a", component: "TitleCard", props: { title: "First" }, durationMs: 1000, narration: "Spoken words" },
      { id: "b", component: "TitleCard", props: { title: "Second" }, durationMs: 1000 },
    ],
  });
  const timeline = buildTimeline(sb, {});
  const render = (frame: number, board = sb) =>
    renderToStaticMarkup(createElement(Frame, { storyboard: board, theme: neutralTheme, timeline, frame }));
  /** The frame's text, without markup: caption words are each in their own element. */
  const textOf = (html: string) => html.replace(/<[^>]*>/g, "");

  it("renders the scene on screen at the frame, with its narration as a caption", () => {
    const html = render(15);
    expect(html).toContain("First");
    expect(textOf(html)).toContain("Spoken words");
    expect(html).not.toContain("Second");
    expect(html).toMatch(/^<div style="position:relative;width:1080px;height:1920px/);
  });

  it("has no caption when the scene has no narration", () => {
    const html = render(45);
    expect(html).toContain("Second");
    expect(textOf(html)).not.toContain("Spoken");
  });

  it("is deterministic", () => {
    expect(render(7)).toBe(render(7));
  });

  it("rejects unknown components", () => {
    const bad = { ...sb, scenes: sb.scenes.map((s) => ({ ...s, component: "Nope" })) };
    expect(() => render(0, bad)).toThrow(/unknown component "Nope"/);
  });
});

describe("pageHtml", () => {
  it("embeds input that cannot close its script element", () => {
    const sb = storyboard({ title: "</script><b>" });
    const html = pageHtml("console.log('</script>')", { storyboard: sb, theme: neutralTheme, durations: {} });
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(html).toContain('id="motioncraft-input"');
  });
});

/** Width and height from a PNG's IHDR chunk. */
function pngSize(png: Buffer): { width: number; height: number } {
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("renderStills (integration)", () => {
  it("renders frame 0 of examples/hello at exactly 1080x1920", { timeout: 60_000 }, async (ctx) => {
    const raw: unknown = JSON.parse(await readFile(join(import.meta.dirname, "..", "examples", "hello", "storyboard.json"), "utf8"));
    const validation = validateStoryboard(raw);
    if (!validation.ok) throw new Error(validation.errors.join("\n"));
    const { storyboard: sb } = validation;
    expect(sb.aspect).toBe("9:16");

    const outDir = await mkdtemp(join(tmpdir(), "motioncraft-stills-"));
    try {
      const paths = await renderStills({
        storyboard: sb,
        theme: resolveTheme(sb.theme),
        durations: estimateDurations(sb),
        frames: [0],
        outDir,
      }).catch((error: unknown) => {
        if (error instanceof BrowserNotFoundError) {
          ctx.skip(`no Chrome or Edge installed, skipping browser render: ${error.message}`);
        }
        throw error;
      });
      expect(paths).toEqual([join(outDir, "frame-00000.png")]);
      expect(pngSize(await readFile(paths[0]!))).toEqual({ width: 1080, height: 1920 });
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
