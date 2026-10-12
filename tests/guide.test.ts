// docs/agent-guide.md is what an agent reads before writing a storyboard, so its
// examples must work. Every ```json block is a correct example: a whole
// storyboard, a single scene, or top-level storyboard fields. Each must
// validate, pass the storyboard checks in both aspects, and render.
// ```json incorrect blocks only have to be JSON.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkStoryboard, formatIssue } from "../src/checks";
import { ASPECTS, kit, resolveTheme, validateStoryboard, type Storyboard } from "../src/index";
import { mediaUses } from "../src/render/media";
import { sceneComponents } from "../src/storyboard/components";

const GUIDE = join(import.meta.dirname, "..", "docs", "agent-guide.md");

interface Block {
  line: number;
  info: string;
  body: string;
}

function codeBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const open = /^```(\S*)\s*(.*)$/.exec(lines[i]!);
    if (open === null) continue;
    const start = i;
    const body: string[] = [];
    while (++i < lines.length && !lines[i]!.startsWith("```")) body.push(lines[i]!);
    blocks.push({ line: start + 1, info: `${open[1]} ${open[2]}`.trim(), body: body.join("\n") });
  }
  return blocks;
}

const filler = { id: "filler", component: "TitleCard", props: { title: "Next" }, durationMs: 2000 };

/** A block as whole storyboards, one per aspect unless it fixes its own. */
function asStoryboards(value: Record<string, unknown>): unknown[] {
  if (Array.isArray(value.scenes)) return [value];
  const base = { title: "Guide example", theme: "light" };
  if (typeof value.component === "string") {
    const scene = { durationMs: 3000, ...value, transition: value.transition ?? { type: "fade" } };
    return ASPECTS.map((aspect) => ({ ...base, aspect, scenes: [scene, filler] }));
  }
  return ASPECTS.map((aspect) => ({ ...base, aspect, ...value, scenes: [{ ...filler, id: "only" }] }));
}

let markdown = "";
let correct: Array<{ block: Block; value: Record<string, unknown> }> = [];
let mediaDir = "";

beforeAll(async () => {
  markdown = await readFile(GUIDE, "utf8");
  correct = codeBlocks(markdown)
    .filter((b) => b.info === "json")
    .map((block) => ({ block, value: JSON.parse(block.body) as Record<string, unknown> }));
  mediaDir = await mkdtemp(join(tmpdir(), "motioncraft-guide-"));
});

afterAll(async () => {
  await rm(mediaDir, { recursive: true, force: true });
});

/** Puts a placeholder file at every media path the storyboard names, so the media check can pass. */
async function stubMedia(sb: Storyboard): Promise<void> {
  for (const use of mediaUses(sb, mediaDir)) {
    if (use.path === undefined) continue;
    await mkdir(dirname(use.path), { recursive: true });
    await writeFile(use.path, Buffer.from([0]));
  }
}

describe("docs/agent-guide.md", () => {
  it("has correct and incorrect examples", () => {
    expect(correct.length).toBeGreaterThan(Object.keys(kit).length);
    const incorrect = codeBlocks(markdown).filter((b) => b.info === "json incorrect");
    expect(incorrect.length).toBeGreaterThanOrEqual(4);
    for (const block of incorrect) expect(() => JSON.parse(block.body), `line ${block.line}`).not.toThrow();
  });

  it("covers every kit component with a heading and an example", () => {
    const used = new Set(
      correct.flatMap(({ value }) =>
        asStoryboards(value).flatMap((sb) => (sb as { scenes: Array<{ component: string; props: Record<string, unknown> }> }).scenes.flatMap((s) => sceneComponents(s).map((u) => u.component))),
      ),
    );
    for (const name of Object.keys(kit)) {
      expect(markdown, `heading for ${name}`).toMatch(new RegExp(`^#+ \`?${name}\`?\\s*$`, "m"));
      expect(used.has(name), `example for ${name}`).toBe(true);
    }
  });

  it("every correct example validates, passes the storyboard checks and renders in both aspects", async () => {
    for (const { block, value } of correct) {
      for (const input of asStoryboards(value)) {
        const where = `agent-guide.md line ${block.line}`;
        const result = validateStoryboard(input);
        expect(result.ok ? [] : result.errors, where).toEqual([]);
        if (!result.ok) continue;
        const sb = result.storyboard;
        await stubMedia(sb);
        const issues = await checkStoryboard(sb, { mediaDir });
        expect(issues.map(formatIssue), where).toEqual([]);

        const theme = resolveTheme(sb);
        for (const scene of sb.scenes) {
          const component = kit[scene.component];
          expect(component, `${where}: component ${scene.component}`).toBeDefined();
          const html = renderToStaticMarkup(createElement(component!, { ...scene.props, progress: 0.5, theme, aspect: sb.aspect }));
          expect(html.length, where).toBeGreaterThan(0);
        }
      }
    }
  });
});
