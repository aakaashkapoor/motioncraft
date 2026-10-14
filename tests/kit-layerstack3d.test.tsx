// LayerStack3D: isometric layer plates arrive as one stack, separate top
// first, and hold apart with a label beside each plate. The pure plan places
// the plates and labels for a scene-clock time; the scene builder makes one
// plate per layer, the highlighted one in the accent material.

import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ASPECTS, SceneClockContext, darkTheme, kit, lightTheme, sectionLayout, textColumn, type Aspect, type Rect } from "../src/index";
import { buildLayerStackScene } from "../src/kit/layerStack3dScene";
import { layerStack3DErrors, layerStackFrame, layerStackLayout, stackCamera, type StackLayer } from "../src/kit/layerStack3dPlan";
import { projectBox } from "../src/kit/three/project";

const WEB_APP: StackLayer[] = [
  { label: "UI", note: "React in the browser", icon: "laptop" },
  { label: "API", note: "Auth and routing", icon: "code" },
  { label: "Queue", note: "Background jobs", icon: "clock" },
  { label: "Database", note: "Postgres", icon: "box" },
];
const SIX: StackLayer[] = ["Edge", "Interface", "Gateway", "Services", "Workers", "Storage"].map((label) => ({ label, note: "One short note" }));

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

const time = (ms: number, endMs = 6000) => ({ ms, endMs, leftMs: endMs - ms });

describe("props", () => {
  it("accepts 2-6 layers, a highlight index and collapse", () => {
    expect(layerStack3DErrors({ layers: WEB_APP, highlight: 1 })).toEqual([]);
    expect(layerStack3DErrors({ layers: WEB_APP.slice(0, 2), collapse: true })).toEqual([]);
    expect(layerStack3DErrors({ layers: SIX })).toEqual([]);
  });

  it("throws on 7 layers", () => {
    const seven = [...SIX, { label: "Backups" }];
    expect(layerStack3DErrors({ layers: seven }).join()).toMatch(/layers/);
    const Component = kit.LayerStack3D!;
    expect(() => renderToStaticMarkup(<Component layers={seven} progress={0.5} theme={lightTheme} aspect="16:9" />)).toThrow(/layers/);
  });

  it("rejects one layer, an empty or long label, an unknown icon and a highlight out of range", () => {
    expect(layerStack3DErrors({ layers: WEB_APP.slice(0, 1) }).join()).toMatch(/layers/);
    expect(layerStack3DErrors({ layers: [{ label: "" }, { label: "B" }] }).join()).toMatch(/label/);
    expect(layerStack3DErrors({ layers: [{ label: "x".repeat(25) }, { label: "B" }] }).join()).toMatch(/label/);
    expect(layerStack3DErrors({ layers: [{ label: "A", icon: "nope" }, { label: "B" }] }).join()).toMatch(/icon/);
    expect(layerStack3DErrors({ layers: WEB_APP, highlight: 4 }).join()).toMatch(/highlight/);
    expect(layerStack3DErrors({ layers: WEB_APP, collapse: "yes" }).join()).toMatch(/collapse/);
  });
});

describe("the scene", () => {
  it.each([2, 4, 6])("has one plate per layer (%i)", (count) => {
    const layers = SIX.slice(0, count);
    const layout = layerStackLayout(lightTheme, "16:9", layers);
    const built = buildLayerStackScene(lightTheme, layout, layers);
    expect(built.plates).toHaveLength(count);
    let meshes = 0;
    built.scene.traverse((o) => {
      if (o.name === "plate") meshes++;
    });
    expect(meshes).toBe(count);
  });

  it("draws the highlighted plate in the accent material and the rest in the surface", () => {
    for (const theme of [lightTheme, darkTheme]) {
      const layout = layerStackLayout(theme, "9:16", WEB_APP);
      const { plates } = buildLayerStackScene(theme, layout, WEB_APP, 1);
      plates.forEach((plate, i) => {
        const material = plate.material as THREE.MeshPhysicalMaterial;
        const role = i === 1 ? "accent" : "surface";
        expect(material.name.endsWith(`:${role}`), material.name).toBe(true);
        expect(material.color.getHexString()).toBe(new THREE.Color(theme.colors[role]).getHexString());
      });
    }
  });
});

describe("the motion", () => {
  it.each(ASPECTS)("has the plates stacked at 0 ms and separated after 1.6 s (%s)", (aspect) => {
    const layout = layerStackLayout(lightTheme, aspect, WEB_APP);
    const start = layerStackFrame(lightTheme, layout, time(0), false);
    const held = layerStackFrame(lightTheme, layout, time(1600), false);
    const pitch = (f: typeof start) => f.plates.slice(1).map((p, i) => f.plates[i]!.y - p.y);
    // Stacked: each plate rests on the one below (its thickness and a hairline).
    for (const gap of pitch(start)) expect(gap).toBeLessThan(layout.plate.thick * 1.2);
    // Apart: a clear gap between every pair, every plate settled.
    for (const gap of pitch(held)) expect(gap).toBeGreaterThan(layout.plate.thick * 4);
    expect(held).toEqual(layerStackFrame(lightTheme, layout, time(2400), false));
    // Labels are hidden while stacked, all shown once apart.
    expect(start.labels.every((l) => l.opacity === 0)).toBe(true);
    expect(held.labels.every((l) => l.opacity === 1)).toBe(true);
  });

  it("separates top first, one plate after another", () => {
    const layout = layerStackLayout(lightTheme, "16:9", WEB_APP);
    const f = layerStackFrame(lightTheme, layout, time(600), false);
    const opened = f.gaps;
    for (let i = 1; i < opened.length; i++) expect(opened[i - 1]!).toBeGreaterThan(opened[i]!);
  });

  it("collapses back into one stack in the last 700 ms before the exit", () => {
    const layout = layerStackLayout(lightTheme, "16:9", WEB_APP);
    const endMs = 5000;
    const exit = 450;
    const before = layerStackFrame(lightTheme, layout, time(endMs - exit - 720, endMs), true);
    const after = layerStackFrame(lightTheme, layout, time(endMs - exit, endMs), true);
    expect(before.gaps.every((g) => g === 1)).toBe(true);
    expect(after.gaps.every((g) => g === 0)).toBe(true);
    expect(after.labels.every((l) => l.opacity === 0)).toBe(true);
    // Without collapse it holds apart to the end.
    expect(layerStackFrame(lightTheme, layout, time(endMs - exit, endMs), false).gaps.every((g) => g === 1)).toBe(true);
  });
});

const SLOTS: Array<[Aspect, Rect | undefined]> = [
  ...ASPECTS.map((a): [Aspect, Rect | undefined] => [a, undefined]),
  ...ASPECTS.map((a): [Aspect, Rect | undefined] => [a, sectionLayout(lightTheme, a, { eyebrow: "Nesting", headline: "Every layer in its slot" }).content]),
];

describe.each(SLOTS)("layout (%s, slot %j)", (aspect, slot) => {
  it.each([
    ["the web app", WEB_APP],
    ["two layers", WEB_APP.slice(0, 2)],
    ["six layers", slot === undefined ? SIX : SIX.slice(0, 4)],
  ] as const)("puts each label beside its plate, never overlapping (%s)", (_, layers) => {
    const layout = layerStackLayout(lightTheme, aspect, layers, slot);
    const frame = layerStackFrame(lightTheme, layout, time(1800), false);
    const area = slot ?? layout.area;
    frame.labels.forEach((label, i) => {
      const plate = frame.plates[i]!.box;
      // Right of the plate, its middle level with the plate.
      expect(label.box.x).toBeGreaterThan(plate.x + plate.width);
      const mid = label.box.y + label.box.height / 2;
      expect(mid).toBeGreaterThan(plate.y);
      expect(mid).toBeLessThan(plate.y + plate.height);
      expect(inside(area, label.box), `${JSON.stringify(label.box)} in ${JSON.stringify(area)}`).toBe(true);
      if (aspect === "9:16") expect(label.box.x + label.box.width).toBeLessThanOrEqual(textColumn(lightTheme, aspect).x + textColumn(lightTheme, aspect).width + 0.5);
      for (const other of frame.labels.slice(i + 1)) expect(overlaps(label.box, other.box)).toBe(false);
    });
    for (const plate of frame.plates) expect(inside(area, plate.box), `${JSON.stringify(plate.box)} in ${JSON.stringify(area)}`).toBe(true);
  });

  it("centres the stack and its labels", () => {
    const layout = layerStackLayout(lightTheme, aspect, WEB_APP, slot);
    const { group } = layout;
    const area = slot ?? layout.area;
    expect(Math.abs(group.x + group.width / 2 - (area.x + area.width / 2))).toBeLessThanOrEqual(2);
  });

  it("matches the camera the stage films with", () => {
    const layout = layerStackLayout(lightTheme, aspect, WEB_APP, slot);
    const frame = layerStackFrame(lightTheme, layout, time(1800), false);
    const camera = stackCamera(layout);
    const { stage, plate } = layout;
    for (const p of frame.plates) {
      const box = new THREE.Box3(new THREE.Vector3(-plate.size / 2, p.y - plate.thick / 2, -plate.size / 2), new THREE.Vector3(plate.size / 2, p.y + plate.thick / 2, plate.size / 2));
      const seen = projectBox(box, camera, stage)!;
      expect(seen.x).toBeCloseTo(p.box.x, 1);
      expect(seen.y).toBeCloseTo(p.box.y, 1);
      expect(seen.width).toBeCloseTo(p.box.width, 1);
      expect(seen.height).toBeCloseTo(p.box.height, 1);
    }
  });
});

describe("the markup", () => {
  it("shows every label's title and note once the plates are apart", () => {
    const Component = kit.LayerStack3D!;
    const html = renderToStaticMarkup(
      <SceneClockContext.Provider value={{ fps: 30, frame: 60, frames: 150 }}>
        <Component layers={WEB_APP} highlight={1} progress={0.4} theme={lightTheme} aspect="16:9" />
      </SceneClockContext.Provider>,
    );
    for (const layer of WEB_APP) {
      expect(html).toContain(`>${layer.label}<`);
      expect(html).toContain(`>${layer.note}<`);
    }
    expect(html.match(/data-stack-label="\d"/g)).toHaveLength(4);
  });
});
