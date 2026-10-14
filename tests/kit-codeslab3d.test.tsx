// CodeSlab3D: highlighted code on a lit, beveled 3D slab that turns through
// space and settles face-on. The pure plan poses the slab for a scene-clock
// time, places it per aspect and paints its face onto a 2D context; the scene
// builder makes the slab, its face and a text key per painted line.

import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ASPECTS, SceneClockContext, darkTheme, kit, lightTheme, sectionLayout, type Aspect, type Rect } from "../src/index";
import {
  SLAB_SETTLE_MS,
  bandSweeps,
  codeLines,
  codeSlab3DErrors,
  codeSlabLayout,
  frontZ,
  paintSlabFace,
  PX_PER_UNIT,
  slabCamera,
  slabPose,
  slabTokens,
  type SlabFaceContext,
} from "../src/kit/codeSlab3dPlan";
import { buildCodeSlabScene, poseCodeSlab } from "../src/kit/codeSlab3dScene";
import { projectBox } from "../src/kit/three/project";

const AREA = `function area(r: number) {
  if (r < 0) return 0;
  const pi = Math.PI;
  const sq = r * r;
  return pi * sq;
}`;
const SHELL = "npm install motioncraft\nnpx motioncraft init\nnpx motioncraft render";
const deg = (r: number) => (r * 180) / Math.PI;

const inside = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

/** A 2D context that records the text it is asked to draw; every glyph is 0.6 em wide. */
function recorder() {
  const calls: Array<{ text: string; x: number; y: number }> = [];
  let px = 10;
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    textBaseline: "alphabetic",
    textAlign: "left",
    letterSpacing: "0px",
    get font() {
      return `${px}px mono`;
    },
    set font(value: string) {
      px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(value)![1]!);
    },
    clearRect() {},
    fillRect() {},
    beginPath() {},
    roundRect() {},
    fill() {},
    clip() {},
    save() {},
    restore() {},
    fillText(text: string, x: number, y: number) {
      calls.push({ text, x, y });
    },
    measureText(text: string) {
      return { width: text.length * px * 0.6 } as TextMetrics;
    },
  } as unknown as SlabFaceContext;
  /** The text drawn on each row (by y), left to right. */
  const rows = () => {
    const byY = new Map<number, typeof calls>();
    for (const call of calls) byY.set(call.y, [...(byY.get(call.y) ?? []), call]);
    return [...byY.entries()].sort(([a], [b]) => a - b).map(([, row]) => row.sort((a, b) => a.x - b.x).map((c) => c.text).join(""));
  };
  return { ctx, rows };
}

describe("props", () => {
  it("accepts 1-14 lines, a language, highlighted lines and a title", () => {
    expect(codeSlab3DErrors({ code: AREA, language: "ts", highlightLines: [5], title: "area.ts" })).toEqual([]);
    expect(codeSlab3DErrors({ code: "x" })).toEqual([]);
    expect(codeSlab3DErrors({ code: Array(14).fill("a").join("\n") + "\n" })).toEqual([]);
  });

  it("throws on 15 lines", () => {
    const fifteen = Array(15).fill("let a = 1;").join("\n");
    expect(codeSlab3DErrors({ code: fifteen }).join()).toMatch(/code/);
    const Component = kit.CodeSlab3D!;
    expect(() => renderToStaticMarkup(<Component code={fifteen} progress={0.5} theme={lightTheme} aspect="16:9" />)).toThrow(/code/);
  });

  it("throws on highlighted lines out of range", () => {
    const Component = kit.CodeSlab3D!;
    for (const bad of [[0], [7], [1.5], [2, 2]]) {
      expect(codeSlab3DErrors({ code: AREA, highlightLines: bad }).join()).toMatch(/highlightLines/);
    }
    expect(() => renderToStaticMarkup(<Component code={AREA} highlightLines={[7]} progress={0.5} theme={lightTheme} aspect="9:16" />)).toThrow(/highlightLines/);
  });

  it("rejects empty code and a long title", () => {
    expect(codeSlab3DErrors({ code: "  " }).join()).toMatch(/code/);
    expect(codeSlab3DErrors({ code: AREA, title: "x".repeat(41) }).join()).toMatch(/title/);
  });
});

describe("the motion", () => {
  it("is turned at 300 ms and face-on after 1.8 s, apart from a drift under 2 degrees", () => {
    const early = slabPose(300);
    expect(Math.abs(deg(early.rotation.x))).toBeGreaterThan(10);
    expect(Math.abs(deg(early.rotation.y))).toBeGreaterThan(5);
    expect(early.offset.z).toBeLessThan(0);
    for (let ms = 1800; ms <= 20000; ms += 137) {
      const pose = slabPose(ms);
      expect(Math.abs(deg(pose.rotation.x - pose.drift.x))).toBeLessThan(0.5);
      expect(Math.abs(deg(pose.rotation.y - pose.drift.y))).toBeLessThan(0.5);
      expect(Math.abs(deg(pose.drift.x))).toBeLessThan(2);
      expect(Math.abs(deg(pose.drift.y))).toBeLessThan(2);
      expect(pose.offset).toEqual({ y: -0, z: -0 });
    }
  });

  it("drifts through the hold, so it never looks frozen", () => {
    const a = slabPose(3000).rotation.y;
    const b = slabPose(4000).rotation.y;
    expect(Math.abs(deg(a - b))).toBeGreaterThan(0.1);
  });

  it("holds still before the lead and moves from 150 ms", () => {
    expect(slabPose(0)).toEqual(slabPose(150));
    expect(slabPose(200).done).toBeGreaterThan(0);
  });

  it("sweeps the highlight bands in after the slab settles", () => {
    expect(bandSweeps(SLAB_SETTLE_MS, 2)).toEqual([0, 0]);
    const mid = bandSweeps(SLAB_SETTLE_MS + 150, 2);
    expect(mid[0]).toBeGreaterThan(mid[1]!);
    expect(bandSweeps(2400, 14).every((s) => s === 1)).toBe(true);
  });
});

const SLOTS: Array<[Aspect, Rect | undefined]> = [
  ...ASPECTS.map((a): [Aspect, Rect | undefined] => [a, undefined]),
  ...ASPECTS.map((a): [Aspect, Rect | undefined] => [a, sectionLayout(lightTheme, a, { eyebrow: "Nesting", headline: "Code on a slab" }).content]),
];

describe.each(SLOTS)("layout (%s, slot %j)", (aspect, slot) => {
  it.each([
    ["the function", AREA, true],
    ["the shell snippet", SHELL, false],
  ] as const)("puts the slab inside its area, centred (%s)", (_, code, titled) => {
    const layout = codeSlabLayout(lightTheme, aspect, codeLines(code), titled, slot);
    expect(inside(slot ?? layout.root, layout.box)).toBe(true);
    expect(inside(layout.stage, layout.box)).toBe(true);
    const area = slot ?? layout.root;
    expect(Math.abs(layout.box.x + layout.box.width / 2 - (area.x + area.width / 2))).toBeLessThanOrEqual(1);
  });

  it("films the settled face at its painted size, on its box", () => {
    const layout = codeSlabLayout(lightTheme, aspect, codeLines(AREA), true, slot);
    const camera = slabCamera(layout);
    const { face, bevel, box } = layout;
    const z = frontZ(layout);
    const half = { x: face.width / 2 / PX_PER_UNIT, y: face.height / 2 / PX_PER_UNIT };
    const seen = projectBox(new THREE.Box3(new THREE.Vector3(-half.x, -half.y, z), new THREE.Vector3(half.x, half.y, z)), camera, layout.stage)!;
    expect(seen.x).toBeCloseTo(box.x + bevel, 1);
    expect(seen.y).toBeCloseTo(box.y + bevel, 1);
    expect(seen.width).toBeCloseTo(face.width, 1);
    expect(seen.height).toBeCloseTo(face.height, 1);
  });
});

describe.each(ASPECTS)("readable when settled (%s)", (aspect) => {
  it.each([
    ["the function", AREA],
    ["the shell snippet", SHELL],
  ])("draws the code at least at the ramp's mono step on the hold (%s)", (_, code) => {
    const layout = codeSlabLayout(lightTheme, aspect, codeLines(code), true);
    expect(layout.size).toBeGreaterThanOrEqual(lightTheme.type.mono[aspect].size);
    // On a hold frame, drift included, a row of code is shown at least as tall as painted.
    const built = buildCodeSlabScene(lightTheme, aspect, layout, slabTokens(code, "ts"), "area.ts", []);
    const camera = slabCamera(layout);
    for (const ms of [1800, 3350, 5100]) {
      poseCodeSlab(built, slabPose(ms), layout);
      const seen = projectBox(built.face, camera, layout.stage)!;
      const shown = (layout.size * seen.height) / layout.face.height;
      expect(shown).toBeGreaterThanOrEqual(lightTheme.type.mono[aspect].size - 0.5);
    }
  });
});

describe("the face", () => {
  it.each([lightTheme, darkTheme])("paints every line of the code ($name)", (theme) => {
    for (const [code, language] of [
      [AREA, "ts"],
      [SHELL, "sh"],
    ] as const) {
      const layout = codeSlabLayout(theme, "16:9", codeLines(code), true);
      const { ctx, rows } = recorder();
      const lines = paintSlabFace(ctx, { theme, aspect: "16:9", layout, tokens: slabTokens(code, language), title: "area.ts", bands: [{ line: 2, sweep: 0.5 }] });
      expect(rows()).toEqual(["area.ts", ...codeLines(code)]);
      expect(lines.map((l) => l.text)).toEqual(["area.ts", ...codeLines(code).map((l) => l.trim())]);
      for (const line of lines) expect(inside({ x: 0, y: 0, ...layout.face }, line)).toBe(true);
    }
  });

  it("paints no title bar without a title", () => {
    const layout = codeSlabLayout(lightTheme, "9:16", codeLines(SHELL), false);
    expect(layout.bar).toBe(0);
    const { ctx, rows } = recorder();
    paintSlabFace(ctx, { theme: lightTheme, aspect: "9:16", layout, tokens: slabTokens(SHELL, "sh"), bands: [] });
    expect(rows()).toEqual(codeLines(SHELL));
  });
});

describe("the scene", () => {
  it("has a slab in the surface colour and a text key per painted line", () => {
    for (const theme of [lightTheme, darkTheme]) {
      const layout = codeSlabLayout(theme, "16:9", codeLines(AREA), true);
      const built = buildCodeSlabScene(theme, "16:9", layout, slabTokens(AREA, "ts"), "area.ts", [5]);
      const [material] = built.body.material as THREE.MeshPhysicalMaterial[];
      expect(material!.name).toBe("glossy:surface");
      expect(material!.color.getHexString()).toBe(new THREE.Color(theme.colors.surface).getHexString());
      // Without a DOM the face is not painted, so there are no text keys.
      expect(built.text).toEqual([]);
    }
  });

  it("is posed below, behind and turned before it settles", () => {
    const layout = codeSlabLayout(lightTheme, "9:16", codeLines(AREA), true);
    const built = buildCodeSlabScene(lightTheme, "9:16", layout, slabTokens(AREA, "ts"), undefined, []);
    poseCodeSlab(built, slabPose(300), layout);
    expect(built.slab.position.y).toBeLessThan(0);
    expect(built.slab.position.z).toBeLessThan(0);
    poseCodeSlab(built, slabPose(1600), layout);
    expect(built.slab.position.length()).toBe(0);
    expect(built.slab.rotation.x).toBe(0);
  });
});

describe("the markup", () => {
  it("carries the entrance and the bands, settled by 2.4 s", () => {
    const Component = kit.CodeSlab3D!;
    const html = (frame: number) =>
      renderToStaticMarkup(
        <SceneClockContext.Provider value={{ fps: 30, frame, frames: 150 }}>
          <Component code={AREA} highlightLines={[5]} title="area.ts" progress={frame / 149} theme={lightTheme} aspect="16:9" />
        </SceneClockContext.Provider>,
      );
    expect(html(3)).toContain('data-slab="0.0000"');
    expect(html(72)).toContain('data-slab="1.0000"');
    expect(html(72)).toContain('data-slab-bands="1.0000"');
  });
});
