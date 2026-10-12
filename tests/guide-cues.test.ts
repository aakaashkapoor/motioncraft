// docs/agent-guide.md shows word cues in ```json cue blocks: a scene's
// `narration` and a cue `at`. Each must be a correct cue for that narration.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cueErrors, resolveCue, sceneWords, lightTheme, type Cue } from "../src/index";

const GUIDE = join(import.meta.dirname, "..", "docs", "agent-guide.md");

function cueBlocks(markdown: string): Array<{ line: number; body: string }> {
  const lines = markdown.split(/\r?\n/);
  const blocks: Array<{ line: number; body: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^```json cue\s*$/.test(lines[i]!)) continue;
    const start = i;
    const body: string[] = [];
    while (++i < lines.length && !lines[i]!.startsWith("```")) body.push(lines[i]!);
    blocks.push({ line: start + 1, body: body.join("\n") });
  }
  return blocks;
}

describe("word cue examples in docs/agent-guide.md", () => {
  it("are correct cues for their narration, and resolve", async () => {
    const blocks = cueBlocks(await readFile(GUIDE, "utf8"));
    expect(blocks.length).toBeGreaterThan(0);
    for (const { line, body } of blocks) {
      const { narration, at } = JSON.parse(body) as { narration: string; at: unknown };
      expect(cueErrors(at, narration), `line ${line}`).toEqual([]);
      const words = sceneWords(lightTheme, narration, 4000);
      expect(Number.isFinite(resolveCue(at as Cue, words)), `line ${line}`).toBe(true);
    }
  });
});
