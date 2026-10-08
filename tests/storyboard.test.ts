import { describe, expect, it } from "vitest";
import { validateStoryboard } from "../src/index";

function scene(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "intro", component: "Title", props: { text: "Hi" }, durationMs: 2000, ...overrides };
}

function board(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { title: "Demo", aspect: "9:16", scenes: [scene()], ...overrides };
}

function errorsOf(input: unknown): string[] {
  const result = validateStoryboard(input);
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors;
}

describe("validateStoryboard: valid input", () => {
  it("accepts a minimal storyboard and applies defaults", () => {
    const result = validateStoryboard(board());
    expect(result).toEqual({
      ok: true,
      storyboard: {
        title: "Demo",
        aspect: "9:16",
        fps: 30,
        theme: "neutral",
        scenes: [{ id: "intro", component: "Title", props: { text: "Hi" }, durationMs: 2000 }],
      },
    });
  });

  it("keeps explicit fps and theme", () => {
    const result = validateStoryboard(board({ aspect: "16:9", fps: 60, theme: "dark" }));
    expect(result.ok && result.storyboard).toMatchObject({ aspect: "16:9", fps: 60, theme: "dark" });
  });

  it("allows a narrated scene without durationMs", () => {
    const s = scene({ durationMs: undefined, narration: "Welcome." });
    delete s.durationMs;
    const result = validateStoryboard(board({ scenes: [s] }));
    expect(result.ok && result.storyboard.scenes[0]).toEqual({
      id: "intro",
      component: "Title",
      props: { text: "Hi" },
      narration: "Welcome.",
    });
  });

  it("allows a narrated scene with an explicit durationMs", () => {
    const result = validateStoryboard(board({ scenes: [scene({ narration: "Hi." })] }));
    expect(result.ok && result.storyboard.scenes[0]?.durationMs).toBe(2000);
  });

  it("preserves scene order", () => {
    const scenes = [scene({ id: "a" }), scene({ id: "b" }), scene({ id: "c" })];
    const result = validateStoryboard(board({ scenes }));
    expect(result.ok && result.storyboard.scenes.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});

describe("validateStoryboard: document-level rules", () => {
  it("rejects non-object input", () => {
    expect(errorsOf(null)).toEqual(["storyboard must be an object"]);
    expect(errorsOf([])).toEqual(["storyboard must be an object"]);
    expect(errorsOf("x")).toEqual(["storyboard must be an object"]);
  });

  it("requires a non-empty title", () => {
    const b = board();
    delete b.title;
    expect(errorsOf(b)).toEqual(["title is required and must be a non-empty string"]);
    expect(errorsOf(board({ title: "  " }))).toEqual(["title is required and must be a non-empty string"]);
  });

  it("rejects an unknown aspect", () => {
    expect(errorsOf(board({ aspect: "4:3" }))).toEqual(['aspect must be "9:16" or "16:9" (got "4:3")']);
  });

  it("requires aspect", () => {
    const b = board();
    delete b.aspect;
    expect(errorsOf(b)).toEqual(['aspect must be "9:16" or "16:9" (got undefined)']);
  });

  it("rejects a non-positive or non-integer fps", () => {
    for (const fps of [0, -30, 29.97, "30"]) {
      expect(errorsOf(board({ fps }))).toEqual([`fps must be a positive integer (got ${JSON.stringify(fps)})`]);
    }
  });

  it("rejects an empty theme", () => {
    expect(errorsOf(board({ theme: "" }))).toEqual(["theme must be a non-empty string"]);
    expect(errorsOf(board({ theme: 3 }))).toEqual(["theme must be a non-empty string"]);
  });

  it("rejects empty scenes", () => {
    expect(errorsOf(board({ scenes: [] }))).toEqual(["scenes must contain at least one scene"]);
  });

  it("rejects missing or non-array scenes", () => {
    const b = board();
    delete b.scenes;
    expect(errorsOf(b)).toEqual(["scenes is required and must be an array"]);
    expect(errorsOf(board({ scenes: {} }))).toEqual(["scenes is required and must be an array"]);
  });

  it("rejects unknown top-level fields", () => {
    expect(errorsOf(board({ length: 10 }))).toEqual(['unknown field "length"']);
  });

  it("reports every error at once", () => {
    const errors = errorsOf({ aspect: "1:1", scenes: [] });
    expect(errors).toHaveLength(3);
  });
});

describe("validateStoryboard: scene rules", () => {
  it("rejects a scene that is not an object", () => {
    expect(errorsOf(board({ scenes: [scene(), 5] }))).toEqual(["scenes[1]: must be an object"]);
  });

  it("requires a scene id", () => {
    const s = scene();
    delete s.id;
    expect(errorsOf(board({ scenes: [s] }))).toEqual(["scenes[0]: id is required and must be a non-empty string"]);
    expect(errorsOf(board({ scenes: [scene({ id: "" })] }))).toEqual([
      "scenes[0]: id is required and must be a non-empty string",
    ]);
  });

  it("rejects duplicate scene ids", () => {
    const scenes = [scene({ id: "a" }), scene({ id: "b" }), scene({ id: "a" })];
    expect(errorsOf(board({ scenes }))).toEqual(['scenes[2] ("a"): id "a" is already used by scenes[0]']);
  });

  it("rejects a missing component", () => {
    const s = scene();
    delete s.component;
    expect(errorsOf(board({ scenes: [s] }))).toEqual([
      'scenes[0] ("intro"): component is required and must be a non-empty string',
    ]);
    expect(errorsOf(board({ scenes: [scene({ component: 7 })] }))).toEqual([
      'scenes[0] ("intro"): component is required and must be a non-empty string',
    ]);
  });

  it("requires props to be an object", () => {
    const s = scene();
    delete s.props;
    expect(errorsOf(board({ scenes: [s] }))).toEqual(['scenes[0] ("intro"): props is required and must be an object']);
    expect(errorsOf(board({ scenes: [scene({ props: [] })] }))).toEqual([
      'scenes[0] ("intro"): props is required and must be an object',
    ]);
  });

  it("rejects non-string or empty narration", () => {
    expect(errorsOf(board({ scenes: [scene({ narration: 42 })] }))).toEqual([
      'scenes[0] ("intro"): narration must be a non-empty string when present',
    ]);
    expect(errorsOf(board({ scenes: [scene({ narration: " " })] }))).toEqual([
      'scenes[0] ("intro"): narration must be a non-empty string when present',
    ]);
  });

  it("requires durationMs when there is no narration", () => {
    const scenes = [scene({ id: "a" }), scene({ id: "b" }), scene({ id: "intro" })];
    delete scenes[2]!.durationMs;
    expect(errorsOf(board({ scenes }))).toEqual([
      'scenes[2] ("intro"): durationMs is required when there is no narration',
    ]);
  });

  it("rejects a non-positive or non-integer durationMs", () => {
    for (const durationMs of [0, -100, 1.5, "2000"]) {
      expect(errorsOf(board({ scenes: [scene({ durationMs })] }))).toEqual([
        `scenes[0] ("intro"): durationMs must be a positive integer (got ${JSON.stringify(durationMs)})`,
      ]);
    }
  });

  it("rejects unknown scene fields", () => {
    expect(errorsOf(board({ scenes: [scene({ duration: 2000 })] }))).toEqual([
      'scenes[0] ("intro"): unknown field "duration"',
    ]);
  });
});
