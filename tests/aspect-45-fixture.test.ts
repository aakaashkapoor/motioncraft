// tests/fixtures/aspect-45: one 4:5 storyboard with a scene for every kit
// component, so the stills and layer-1 checks cover the whole kit at 1080x1350.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { kit, validateStoryboard } from "../src/index";

async function load() {
  return validateStoryboard(JSON.parse(await readFile(join(import.meta.dirname, "fixtures", "aspect-45.json"), "utf8")));
}

describe("tests/fixtures/aspect-45", () => {
  it("is a valid 4:5 storyboard", async () => {
    const result = await load();
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(result.storyboard.aspect).toBe("4:5");
  });

  it("has exactly one scene per kit component", async () => {
    const result = await load();
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const components = result.storyboard.scenes.map((scene) => scene.component);
    expect([...components].sort()).toEqual(Object.keys(kit).sort());
  });
});
