import { describe, expect, it } from "vitest";
import { validateStoryboard, type Storyboard } from "../src/index";
import { pageMediaProblems, parsePageArgs } from "../src/render/pageExport";

function storyboard(scenes: unknown[]): Storyboard {
  const result = validateStoryboard({ title: "t", aspect: "16:9", fps: 30, scenes });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

describe("parsePageArgs", () => {
  it("reads the storyboard and --out", () => {
    expect(parsePageArgs(["board.json", "--out", "page.html"])).toEqual({ storyboard: "board.json", out: "page.html" });
    expect(parsePageArgs(["--out=page.HTML", "board.json"])).toEqual({ storyboard: "board.json", out: "page.HTML" });
  });

  it("rejects bad usage with the usage line", () => {
    expect(() => parsePageArgs([])).toThrow(/usage: npx tsx scripts\/page\.ts/);
    expect(() => parsePageArgs(["a.json", "b.json", "--out", "x.html"])).toThrow(/one storyboard/);
    expect(() => parsePageArgs(["a.json"])).toThrow(/--out <file.html> is required/);
    expect(() => parsePageArgs(["a.json", "--out", "x.mp4"])).toThrow(/\.html/);
    expect(() => parsePageArgs(["a.json", "--out", "x.html", "--bogus"])).toThrow(/usage/);
  });
});

describe("pageMediaProblems", () => {
  it("passes a storyboard with no local media", () => {
    expect(pageMediaProblems(storyboard([{ id: "a", component: "Headline", props: { text: "Hi" }, durationMs: 2000 }]))).toEqual([]);
  });

  it("names every image, clip, logo and scene audio file", () => {
    const board = storyboard([
      { id: "pic", component: "Image", props: { src: "media/shot.png" }, durationMs: 2000 },
      { id: "clip", component: "VideoClip", props: { src: "media/clip.mp4" }, durationMs: 2000 },
      { id: "end", component: "EndCard", props: { title: "Bye", logo: "media/logo.svg" }, durationMs: 2000 },
      { id: "talk", component: "Headline", props: { text: "Hi" }, narration: "Hi there.", audio: { file: "media/talk.wav" } },
    ]);
    const problems = pageMediaProblems(board);
    expect(problems).toHaveLength(4);
    for (const file of ["media/shot.png", "media/clip.mp4", "media/logo.svg", "media/talk.wav"]) {
      expect(problems.some((p) => p.includes(file) && p.includes("page export does not support local media yet"))).toBe(true);
    }
  });
});
