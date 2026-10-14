// ExtrudedTitle: beveled 3D letters flip up one by one, the word swings so the
// light runs across the bevels, then settles face-on for the hold. The pure
// plan poses the letters and the word for a scene-clock time and sizes the
// word per aspect; the scene builder makes a mesh per letter.

import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ASPECTS, SceneClockContext, contentArea, darkTheme, kit, lightTheme, sectionLayout, textColumn, type Aspect, type Rect } from "../src/index";
import {
  SETTLE_MS,
  extrudedTitleErrors,
  extrudedTitleLayout,
  letterPose,
  titleCamera,
  titleLetters,
  wordPose,
} from "../src/kit/extrudedTitlePlan";
import { buildExtrudedTitleScene, poseExtrudedTitle } from "../src/kit/extrudedTitleScene";
import { projectBox } from "../src/kit/three/project";

const deg = (r: number) => (r * 180) / Math.PI;
const inside = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

const draw = (props: Record<string, unknown>, frame: number, aspect: Aspect = "16:9", frames = 150) => {
  const Component = kit.ExtrudedTitle!;
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: 30, frame, frames }}>
      <Component text="motioncraft" {...props} progress={frame / (frames - 1)} theme={lightTheme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
};

describe("props", () => {
  it("accepts 1-24 characters on one line, a finish, a subtitle and accent letters", () => {
    expect(extrudedTitleErrors({ text: "motioncraft", finish: "chrome", subtitle: "Prompt in, video out", accentLetters: [0, 6] })).toEqual([]);
    expect(extrudedTitleErrors({ text: "A" })).toEqual([]);
    expect(extrudedTitleErrors({ text: "x".repeat(24) })).toEqual([]);
  });

  it("throws on a 25-character text", () => {
    const long = "x".repeat(25);
    expect(extrudedTitleErrors({ text: long }).join()).toMatch(/text/);
    expect(() => draw({ text: long }, 10)).toThrow(/text/);
  });

  it("rejects a second line, empty text, an unknown finish and accent letters out of range", () => {
    expect(extrudedTitleErrors({ text: "two\nlines" }).join()).toMatch(/text/);
    expect(extrudedTitleErrors({ text: "   " }).join()).toMatch(/text/);
    expect(extrudedTitleErrors({ text: "ok", finish: "gold" }).join()).toMatch(/finish/);
    for (const bad of [[2], [-1], [0.5], [1, 1]]) expect(extrudedTitleErrors({ text: "ok", accentLetters: bad }).join()).toMatch(/accentLetters/);
    expect(extrudedTitleErrors({ text: "ok", subtitle: "" }).join()).toMatch(/subtitle/);
  });
});

describe("the letters", () => {
  it("are one per character, spaces skipped, laid left to right about the centre", () => {
    const letters = titleLetters("SHIP IT");
    expect(letters.map((l) => l.char).join("")).toBe("SHIPIT");
    expect(letters.map((l) => l.index)).toEqual([0, 1, 2, 3, 5, 6]);
    for (let i = 1; i < letters.length; i++) expect(letters[i]!.x).toBeGreaterThan(letters[i - 1]!.x);
    expect(letters[0]!.x + letters.at(-1)!.x).toBeCloseTo(letters[0]!.width / 2 - letters.at(-1)!.width / 2, 1);
  });

  it("builds a mesh per letter (spaces skipped)", () => {
    for (const text of ["motioncraft", "SHIP IT", "a b c"]) {
      const layout = extrudedTitleLayout(lightTheme, "16:9", text, undefined);
      const built = buildExtrudedTitleScene(lightTheme, layout, "glossy", []);
      expect(built.letters).toHaveLength(text.replace(/ /g, "").length);
    }
  });
});

describe("the motion", () => {
  it("has every letter lying flat at 0 ms and the word face-on after 1.8 s, apart from a drift under 2 degrees", () => {
    const n = titleLetters("motioncraft").length;
    for (let i = 0; i < n; i++) expect(deg(letterPose(0, i, n).rotationX)).toBeCloseTo(-90, 5);
    expect(Math.abs(deg(wordPose(0).rotationY))).toBeGreaterThan(20);
    for (let ms = 1800; ms <= 20000; ms += 137) {
      for (let i = 0; i < n; i++) {
        expect(letterPose(ms, i, n).rotationX).toBe(0);
        expect(letterPose(ms, i, n).lift).toBe(0);
      }
      const word = wordPose(ms);
      expect(Math.abs(deg(word.rotationY - word.drift))).toBeLessThan(0.01);
      expect(Math.abs(deg(word.drift))).toBeLessThan(2);
      expect(word.rotationX).toBe(0);
    }
  });

  it("flips the letters up one after another, 60-80 ms apart, from 100-200 ms", () => {
    const n = 7;
    const firstMove = Array.from({ length: n }, (_, i) => {
      let ms = 0;
      while (letterPose(ms, i, n).rotationX === letterPose(0, i, n).rotationX) ms += 1;
      return ms;
    });
    expect(firstMove[0]).toBeGreaterThanOrEqual(100);
    expect(firstMove[0]).toBeLessThanOrEqual(200);
    for (let i = 1; i < n; i++) {
      expect(firstMove[i]! - firstMove[i - 1]!).toBeGreaterThanOrEqual(59);
      expect(firstMove[i]! - firstMove[i - 1]!).toBeLessThanOrEqual(81);
    }
  });

  it("swings the word through the light and settles by 1.6 s, even for 24 letters", () => {
    const mid = wordPose(900).rotationY;
    expect(Math.abs(deg(mid))).toBeGreaterThan(1);
    expect(Math.abs(deg(mid))).toBeLessThan(25);
    expect(wordPose(SETTLE_MS).rotationY).toBe(0);
    for (let i = 0; i < 24; i++) expect(letterPose(SETTLE_MS, i, 24).rotationX).toBe(0);
  });

  it("drifts through the hold, so it never looks frozen", () => {
    expect(Math.abs(deg(wordPose(3000).rotationY - wordPose(4000).rotationY))).toBeGreaterThan(0.1);
  });
});

const SLOTS: Array<[Aspect, Rect | undefined]> = [
  ...ASPECTS.map((a): [Aspect, Rect | undefined] => [a, undefined]),
  ...ASPECTS.map((a): [Aspect, Rect | undefined] => [a, sectionLayout(lightTheme, a, { eyebrow: "Nesting", headline: "A 3D title" }).content]),
];

describe.each(SLOTS)("layout (%s, slot %j)", (aspect, slot) => {
  it.each(["motioncraft", "SHIP IT", "x".repeat(24), "A"])("puts the word and subtitle inside the area, centred (%s)", (text) => {
    const layout = extrudedTitleLayout(lightTheme, aspect, text, "Prompt in, video out", slot);
    const area = slot ?? contentArea(lightTheme, aspect);
    expect(inside(area, layout.word)).toBe(true);
    expect(inside(area, layout.subtitle!)).toBe(true);
    expect(inside(layout.stage, layout.word)).toBe(true);
    expect(layout.subtitle!.y).toBeGreaterThan(layout.word.y + layout.word.height);
    expect(Math.abs(layout.word.x + layout.word.width / 2 - (area.x + area.width / 2))).toBeLessThanOrEqual(1);
  });

  it("films the settled word at its laid-out size, on its box", () => {
    const layout = extrudedTitleLayout(lightTheme, aspect, "motioncraft", undefined, slot);
    const built = buildExtrudedTitleScene(lightTheme, layout, "glossy", []);
    poseExtrudedTitle(built, SETTLE_MS);
    const front = projectBox(built.front, titleCamera(layout), layout.stage)!;
    expect(front.x).toBeCloseTo(layout.word.x, 0);
    expect(front.y).toBeCloseTo(layout.word.y, 0);
    expect(front.width).toBeCloseTo(layout.word.width, 0);
    expect(front.height).toBeCloseTo(layout.word.height, 0);
  });
});

describe("size", () => {
  it("fills nearly all the text column in 9:16 and 4:5 and about 70% of the content width in 16:9", () => {
    for (const aspect of ASPECTS) {
      const area = aspect === "16:9" ? contentArea(lightTheme, aspect) : textColumn(lightTheme, aspect);
      const share = extrudedTitleLayout(lightTheme, aspect, "motioncraft", undefined).word.width / area.width;
      if (aspect === "16:9") expect(share).toBeCloseTo(0.7, 2);
      else expect(share).toBeCloseTo(0.92, 2);
    }
  });

  it("steps a long word down rather than wrapping it", () => {
    const short = extrudedTitleLayout(lightTheme, "9:16", "motioncraft", undefined);
    const long = extrudedTitleLayout(lightTheme, "9:16", "motioncraftmotioncraft", undefined);
    expect(long.em).toBeLessThan(short.em);
    expect(long.word.height).toBeLessThan(short.word.height);
  });
});

describe("the scene", () => {
  it.each([lightTheme, darkTheme])("draws the letters in the finish, the accent letters in the accent ($name)", (theme) => {
    for (const finish of ["matte", "glossy", "chrome"] as const) {
      const layout = extrudedTitleLayout(theme, "9:16", "SHIP IT", undefined);
      const built = buildExtrudedTitleScene(theme, layout, finish, [0, 5]);
      const names = built.letters.map((l) => (l.mesh.material as THREE.Material).name);
      // Indices are into `text`: 0 is "S", 5 is the "I" of "IT" (the space is index 4).
      expect(names[0]).toBe(`${finish}:accent`);
      expect(names[4]).toBe(`${finish}:accent`);
      for (const i of [1, 2, 3, 5]) expect(names[i]!.startsWith(`${finish}:`)).toBe(true);
      for (const i of [1, 2, 3, 5]) expect(names[i]).not.toBe(`${finish}:accent`);
    }
  });

  it("has the letters lying flat at 0 ms and standing after 1.8 s", () => {
    const layout = extrudedTitleLayout(lightTheme, "16:9", "motioncraft", undefined);
    const built = buildExtrudedTitleScene(lightTheme, layout, "glossy", []);
    poseExtrudedTitle(built, 0);
    for (const { pivot } of built.letters) expect(deg(pivot.rotation.x)).toBeCloseTo(-90, 5);
    poseExtrudedTitle(built, 1800);
    for (const { pivot } of built.letters) expect(pivot.rotation.x).toBe(0);
  });

  it("gives the letters depth about 0.35 of the cap height, with a bevel", () => {
    const layout = extrudedTitleLayout(lightTheme, "16:9", "H", undefined);
    const built = buildExtrudedTitleScene(lightTheme, layout, "glossy", []);
    const box = new THREE.Box3().setFromObject(built.letters[0]!.mesh);
    const size = box.getSize(new THREE.Vector3());
    expect(size.z / size.y).toBeGreaterThan(0.3);
    expect(size.z / size.y).toBeLessThan(0.45);
  });
});

describe("the markup", () => {
  it("is identical for the same frame twice", () => {
    for (const frame of [0, 12, 40, 100]) {
      expect(draw({ subtitle: "Prompt in, video out" }, frame)).toBe(draw({ subtitle: "Prompt in, video out" }, frame));
    }
  });

  it("carries the flip and the swing, settled by 2.4 s, and the subtitle fades in after the word settles", () => {
    expect(draw({}, 3)).toContain('data-title-swing="0.0000"');
    expect(draw({}, 72)).toContain('data-title-flip="1.0000"');
    expect(draw({}, 72)).toContain('data-title-swing="1.0000"');
    const subtitle = (frame: number) => /data-title-subtitle=""[^>]*opacity:([\d.]+)/.exec(draw({ subtitle: "Prompt in, video out" }, frame))?.[1];
    expect(Number(subtitle(30) ?? 0)).toBe(0);
    expect(Number(subtitle(72))).toBe(1);
  });
});
