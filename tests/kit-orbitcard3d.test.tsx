// OrbitCard3D: a feature card orbits a dot sphere and lands in front of it.
// The sphere is a deterministic Fibonacci point cloud; the card starts its
// orbit behind the sphere and is in front, face-on, once it has landed; its
// face texture carries the title.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASPECTS, darkTheme, kit, lightTheme } from "../src/index";
import { ORBIT_LAND_MS, orbitCard3DErrors, orbitCardLayout, orbitPose, paintCardFace, sphereGeometry, spherePoints, type FaceContext } from "../src/kit/orbitCard3dPlan";

describe("the dot sphere", () => {
  it.each([400, 1600, 4000])("has exactly %i points, the same on every build", (dots) => {
    const a = sphereGeometry(dots);
    const b = sphereGeometry(dots);
    expect(a.getAttribute("position").count).toBe(dots);
    expect(Array.from(a.getAttribute("position").array)).toEqual(Array.from(b.getAttribute("position").array));
  });

  it("puts every point on the unit sphere, spread from pole to pole", () => {
    const p = spherePoints(1600);
    let minY = 1;
    let maxY = -1;
    for (let i = 0; i < 1600; i++) {
      const [x, y, z] = [p[3 * i]!, p[3 * i + 1]!, p[3 * i + 2]!];
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    expect(minY).toBeLessThan(-0.99);
    expect(maxY).toBeGreaterThan(0.99);
  });
});

describe("the orbit", () => {
  it("has the card behind the sphere at 400 ms", () => {
    const pose = orbitPose(400);
    expect(pose.card.z).toBeLessThan(0);
    expect(Math.cos(pose.angle)).toBeLessThan(0);
  });

  it("has the card in front, face-on, from 1.9 s", () => {
    for (const ms of [1900, 2500, 9000]) {
      const pose = orbitPose(ms);
      expect(pose.card.z).toBeGreaterThan(0);
      expect(pose.card.x).toBeCloseTo(0, 6);
      expect(pose.angle).toBeCloseTo(0, 6);
      expect(pose.tilt).toBeCloseTo(0, 6);
      expect(pose.dolly).toBeCloseTo(1, 6);
    }
    expect(ORBIT_LAND_MS).toBeLessThanOrEqual(1800);
  });

  it("holds still until its first move at 100-200 ms, then travels about 220 degrees", () => {
    expect(orbitPose(0)).toEqual(orbitPose(99));
    expect(orbitPose(200).angle).not.toBe(orbitPose(0).angle);
    const travel = (orbitPose(ORBIT_LAND_MS).angle - orbitPose(0).angle) * (180 / Math.PI);
    expect(travel).toBeCloseTo(220, 6);
  });
});

describe("props", () => {
  it("accepts 400-4000 dots and a 1-32 char title", () => {
    expect(orbitCard3DErrors({ title: "Checked every frame", dots: 400 })).toEqual([]);
    expect(orbitCard3DErrors({ title: "Checked every frame", dots: 4000, subtitle: "x".repeat(60), icon: "check" })).toEqual([]);
  });

  it.each([399, 4001, 1600.5, Number.NaN])("rejects %s dots", (dots) => {
    expect(orbitCard3DErrors({ title: "A", dots }).join()).toMatch(/dots/);
    const Component = kit.OrbitCard3D!;
    expect(() => renderToStaticMarkup(<Component title="A" dots={dots} progress={0.5} theme={lightTheme} aspect="9:16" />)).toThrow(/dots/);
  });

  it("rejects a missing or long title, a long subtitle and an unknown icon", () => {
    expect(orbitCard3DErrors({}).join()).toMatch(/title/);
    expect(orbitCard3DErrors({ title: "x".repeat(33) }).join()).toMatch(/title/);
    expect(orbitCard3DErrors({ title: "A", subtitle: "x".repeat(61) }).join()).toMatch(/subtitle/);
    expect(orbitCard3DErrors({ title: "A", icon: "nope" }).join()).toMatch(/icon/);
  });
});

/** A 2D context that records the text it is asked to draw. */
function recorder(): FaceContext & { texts: string[] } {
  const texts: string[] = [];
  const noop = () => {};
  return {
    texts,
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    textBaseline: "alphabetic",
    textAlign: "left",
    letterSpacing: "0px",
    clearRect: noop,
    beginPath: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    roundRect: noop,
    fillText: (text: string) => texts.push(text),
    measureText: (text: string) => ({ width: text.length * 20 }),
  } as unknown as FaceContext & { texts: string[] };
}

describe("the card face", () => {
  it.each(ASPECTS)("paints the title, the subtitle and the icon (%s)", (aspect) => {
    const ctx = recorder();
    const layout = orbitCardLayout(lightTheme, aspect);
    const lines = paintCardFace(ctx, { theme: darkTheme, aspect, layout, title: "Checked every frame", subtitle: "Layout, contrast and timing", icon: "check", drawIcon: () => {} });
    expect(ctx.texts.join(" ")).toContain("Checked every frame");
    expect(ctx.texts.join(" ")).toContain("Layout, contrast and timing");
    // Where the lines went, inside the copy box, for the checks.
    expect(lines.map((l) => l.text).join(" ")).toBe(ctx.texts.join(" "));
    for (const line of lines) {
      expect(line.x).toBeGreaterThanOrEqual(0);
      expect(line.y).toBeGreaterThanOrEqual(0);
      expect(line.x + line.width).toBeLessThanOrEqual(layout.copyPx.width + 0.5);
      expect(line.y + line.height).toBeLessThanOrEqual(layout.copyPx.height + 0.5);
    }
    expect(lines[0]!.color).toBe("text");
    expect(lines.at(-1)!.color).toBe("textMuted");
  });

  it("shrinks the copy to fit a small card", () => {
    const ctx = recorder();
    const layout = orbitCardLayout(lightTheme, "4:5", { x: 0, y: 0, width: 440, height: 460 });
    const lines = paintCardFace(ctx, { theme: lightTheme, aspect: "4:5", layout, title: "Checked every frame", subtitle: "Layout, contrast and timing", icon: "check", drawIcon: () => {} });
    for (const line of lines) expect(line.y + line.height).toBeLessThanOrEqual(layout.copyPx.height + 0.5);
    expect(lines.map((l) => l.text).join(" ")).toBe("Checked every frame Layout, contrast and timing");
  });

  it("paints a title alone", () => {
    const ctx = recorder();
    const layout = orbitCardLayout(lightTheme, "16:9");
    paintCardFace(ctx, { theme: lightTheme, aspect: "16:9", layout, title: "Renders locally", drawIcon: () => {} });
    expect(ctx.texts.join(" ")).toBe("Renders locally");
  });
});

describe("layout", () => {
  it("takes the primary width in 9:16 and 4:5 and about 45% of the content width in 16:9", () => {
    expect(orbitCardLayout(lightTheme, "9:16").cardPx).toBeCloseTo(760, -1);
    expect(orbitCardLayout(lightTheme, "4:5").cardPx).toBeLessThanOrEqual(760);
    expect(orbitCardLayout(lightTheme, "4:5").cardPx).toBeGreaterThan(600);
    expect(orbitCardLayout(lightTheme, "16:9").cardPx / 1728).toBeCloseTo(0.45, 1);
  });

  it.each(ASPECTS)("keeps the card inside its area (%s)", (aspect) => {
    const area = { x: 100, y: 500, width: 700, height: 600 };
    const { root, box, cardPx, cardHeightPx } = orbitCardLayout(lightTheme, aspect, area);
    expect(root).toEqual(area);
    expect(cardPx).toBeLessThanOrEqual(area.width);
    expect(cardHeightPx).toBeLessThanOrEqual(area.height);
    expect(box.y).toBeGreaterThanOrEqual(area.y - 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height + 0.5);
  });
});
