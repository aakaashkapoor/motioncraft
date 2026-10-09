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
        theme: "light",
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

describe("validateStoryboard: theme overrides", () => {
  it("keeps themeOverrides, accent and accentIntensity", () => {
    const themeOverrides = { colors: { ground: "#fafafa" }, ground: { style: "grid" }, motion: { enter: { ms: 300 } } };
    const result = validateStoryboard(board({ themeOverrides, accent: "#FF6A00", accentIntensity: "bold" }));
    expect(result.ok && result.storyboard).toMatchObject({ themeOverrides, accent: "#FF6A00", accentIntensity: "bold" });
  });

  it("leaves the optional fields out when absent", () => {
    const result = validateStoryboard(board());
    expect(result.ok && Object.keys(result.storyboard).sort()).toEqual(["aspect", "fps", "scenes", "theme", "title"]);
  });

  it("rejects a bad accent or accentIntensity", () => {
    expect(errorsOf(board({ accent: "orange" }))).toEqual(['accent must be a hex color like "#ff6a00" (got "orange")']);
    expect(errorsOf(board({ accentIntensity: "loud" }))).toEqual([
      'accentIntensity must be "subtle", "bold" or "full" (got "loud")',
    ]);
  });

  it("takes the living ground: the mesh style, grain as an opacity 0..1, and its tokens", () => {
    const themeOverrides = {
      ground: { style: "mesh", grain: 0.18, mesh: { maxAlpha: 0.2 } },
      motion: { drift: { px: 40 }, "grid.breathe": { ms: 6000 }, grainFps: 12 },
    };
    expect(validateStoryboard(board({ themeOverrides })).ok).toBe(true);
    expect(errorsOf(board({ themeOverrides: { ground: { grain: 1.5 } } }))).toEqual(["themeOverrides.ground.grain must be an opacity from 0 to 1 (got 1.5)"]);
    expect(errorsOf(board({ themeOverrides: { ground: { grain: -0.1 } } }))).toEqual(["themeOverrides.ground.grain must be an opacity from 0 to 1 (got -0.1)"]);
  });

  it("requires themeOverrides to be an object", () => {
    expect(errorsOf(board({ themeOverrides: "dark" }))).toEqual(["themeOverrides must be an object"]);
  });

  it("checks themeOverrides against the theme's shape", () => {
    expect(
      errorsOf(
        board({
          themeOverrides: {
            colors: { ground: "#fff", text: "black", glow: "#ffffff" },
            ground: { style: "plasma", seed: 1.5 },
            radius: { md: "12px" },
            type: { headline: { "9:16": { size: -4 } } },
            accentIntensity: "max",
            name: "mine",
            motion: { enter: { curve: "wobbly" } },
            fonts: 3,
          },
        }),
      ),
    ).toEqual([
      'themeOverrides.colors.text must be a hex color like "#ff6a00" (got "black")',
      'themeOverrides.colors: unknown field "glow"',
      'themeOverrides.ground.style must be "solid", "vignette", "grid", "noise" or "mesh" (got "plasma")',
      "themeOverrides.ground.seed must be an integer (got 1.5)",
      'themeOverrides.radius.md must be a number (got "12px")',
      "themeOverrides.type.headline.9:16.size must be a positive number (got -4)",
      'themeOverrides.accentIntensity must be "subtle", "bold" or "full" (got "max")',
      'themeOverrides: unknown field "name"',
      'themeOverrides.motion.enter.curve must be "linear", "expoOut", "expoIn", "expoInOut", "sineInOut" or "power4InOut", a cubic bezier [x1, y1, x2, y2] with x1 and x2 in 0..1, or a spring { "stiffness": ..., "damping": ... } (got "wobbly")',
      "themeOverrides.fonts must be an object (got 3)",
    ]);
  });

  it("takes a motion token's curve as a name, a cubic bezier or a spring", () => {
    const ok = (curve: unknown) => validateStoryboard(board({ themeOverrides: { motion: { fx: { curve } } } })).ok;
    expect(ok("expoOut")).toBe(true);
    expect(ok([0.2, 0, 0, 1])).toBe(true);
    expect(ok([0.38, 1.21, 0.22, 1])).toBe(true);
    expect(ok({ stiffness: 170, damping: 18 })).toBe(true);
    expect(ok([1.2, 0, 0, 1])).toBe(false);
    expect(ok([0.2, 0, 0])).toBe(false);
    expect(ok({ stiffness: 170 })).toBe(false);
    expect(ok({ stiffness: -1, damping: 18 })).toBe(false);
    // A partial spring merges over a spring curve.
    expect(validateStoryboard(board({ themeOverrides: { motion: { enter: { curve: { damping: 24 } } } } })).ok).toBe(true);
  });

  it("names the v3 token for a v2 motion field", () => {
    expect(errorsOf(board({ themeOverrides: { motion: { enterMs: 300, springs: { emphasis: "snappy" } } } }))).toEqual([
      'themeOverrides.motion: unknown field "enterMs" (motion tokens are named by design v3, table D: use "enter": { "ms": ... })',
      'themeOverrides.motion: unknown field "springs" (motion tokens are named by design v3, table D: use "enter", "pop" and "exit" with a "curve")',
    ]);
  });
});

describe("validateStoryboard: camera shots", () => {
  const windowScene = (shots: unknown, overrides: Record<string, unknown> = {}) =>
    scene({ component: "AppWindow", props: { title: "Plan", shareId: "plan" }, durationMs: 5000, shots, ...overrides });
  const shotErrors = (shots: unknown, overrides?: Record<string, unknown>) => errorsOf(board({ scenes: [windowScene(shots, overrides)] }));

  it("keeps shots onto a shareId, a rect and back to wide", () => {
    const shots = [
      { atMs: 800, target: "plan", fill: 0.8, durationMs: 700 },
      { atMs: 2400, target: { x: 100, y: 300, width: 400, height: 300 } },
      { atMs: 3600, target: "wide" },
    ];
    const result = validateStoryboard(board({ scenes: [windowScene(shots)] }));
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(result.storyboard.scenes[0]!.shots).toEqual(shots);
  });

  it("leaves shots out when a scene has none", () => {
    const result = validateStoryboard(board());
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(result.storyboard.scenes[0]).not.toHaveProperty("shots");
  });

  it("requires an array of shot objects", () => {
    expect(shotErrors({ atMs: 0, target: "plan" })).toEqual(['scenes[0] ("intro"): shots must be an array of shots (got {"atMs":0,"target":"plan"})']);
    expect(shotErrors([5])).toEqual(['scenes[0] ("intro"): shots[0] must be an object (got 5)']);
  });

  it("checks each shot's fields", () => {
    expect(shotErrors([{ atMs: -1, target: "plan", zoom: 2 }])).toEqual([
      'scenes[0] ("intro"): shots[0]: unknown field "zoom"',
      'scenes[0] ("intro"): shots[0].atMs must be a whole number of ms >= 0 (got -1)',
    ]);
    expect(shotErrors([{ atMs: 1.5, target: "plan" }])).toEqual(['scenes[0] ("intro"): shots[0].atMs must be a whole number of ms >= 0 (got 1.5)']);
    expect(shotErrors([{ atMs: 0, target: "plan", fill: 0.9 }])).toEqual([
      'scenes[0] ("intro"): shots[0].fill must be a number from 0.6 to 0.85 (got 0.9)',
    ]);
    expect(shotErrors([{ atMs: 0, target: "plan", fill: 0.5 }])).toHaveLength(1);
    expect(shotErrors([{ atMs: 0, target: "plan", durationMs: 0 }])).toEqual([
      'scenes[0] ("intro"): shots[0].durationMs must be a positive integer (got 0)',
    ]);
    expect(shotErrors([{ atMs: 0, target: "wide", fill: 0.7 }])).toEqual([
      'scenes[0] ("intro"): shots[0].fill has no effect on a "wide" shot',
    ]);
  });

  it("requires a target: a shareId in the scene, a rect, or \"wide\"", () => {
    expect(shotErrors([{ atMs: 0 }])).toEqual([
      'scenes[0] ("intro"): shots[0].target must be a shareId in the scene, a rect { "x", "y", "width", "height" } in frame px, or "wide" (got undefined)',
    ]);
    expect(shotErrors([{ atMs: 0, target: "chat" }])).toEqual([
      'scenes[0] ("intro"): shots[0].target "chat" is not a shareId in this scene (it has "plan")',
    ]);
    expect(shotErrors([{ atMs: 0, target: { x: 0, y: 0, width: 0, height: 10 } }])).toEqual([
      'scenes[0] ("intro"): shots[0].target must be a shareId in the scene, a rect { "x", "y", "width", "height" } in frame px, or "wide" (got {"x":0,"y":0,"width":0,"height":10})',
    ]);
  });

  it("finds a shareId nested in the scene, such as a docked window", () => {
    const pinned = scene({
      component: "Pinned",
      props: { pinned: { component: "ChatWindow", props: { shareId: "chat", messages: [] } } },
      shots: [{ atMs: 0, target: "chat" }],
    });
    expect(validateStoryboard(board({ scenes: [pinned] })).ok).toBe(true);
  });

  it("wants shots in time order, starting inside the scene", () => {
    expect(shotErrors([{ atMs: 2000, target: "plan" }, { atMs: 1000, target: "wide" }])).toEqual([
      'scenes[0] ("intro"): shots[1].atMs (1000) is before shots[0].atMs (2000): list shots in time order',
    ]);
    expect(shotErrors([{ atMs: 5000, target: "plan" }])).toEqual([
      'scenes[0] ("intro"): shots[0].atMs (5000) is not before the end of the scene (5000 ms)',
    ]);
  });
});

describe("validateStoryboard: breathing", () => {
  it("lets a storyboard switch the camera's breathing on", () => {
    expect(validateStoryboard(board({ themeOverrides: { motion: { breathe: { on: true } } } })).ok).toBe(true);
    expect(errorsOf(board({ themeOverrides: { motion: { breathe: { on: "yes" } } } }))).toEqual([
      'themeOverrides.motion.breathe.on must be true or false (got "yes")',
    ]);
  });

  it("keeps the camera tokens within design v3's ranges", () => {
    const ok = (motion: unknown) => validateStoryboard(board({ themeOverrides: { motion } })).ok;
    expect(ok({ breathe: { scale: 1.04, driftPx: 16 }, shot: { fill: 0.6 } })).toBe(true);
    expect(errorsOf(board({ themeOverrides: { motion: { shot: { fill: 0 }, breathe: { scale: 0.98, driftPx: 40 } } } }))).toEqual([
      "themeOverrides.motion.shot.fill must be a number from 0.6 to 0.85 (got 0)",
      "themeOverrides.motion.breathe.scale must be a number from 1 to 1.04 (got 0.98)",
      "themeOverrides.motion.breathe.driftPx must be a number from 0 to 16 (got 40)",
    ]);
  });
});
