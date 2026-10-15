// Backdrop3D: abstract full-bleed 3D behind content (a glowing helix, a
// tunnel flown into, and later city and blobs). The pure plan validates the
// props, times the entrance and picks the theme's colours; each variant's
// layout is a pure function of its seed and intensity, and its scene is
// posed for a scene-clock ms.

import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ASPECTS, SceneClockContext, kit, lightTheme, resolveTheme, type Aspect } from "../src/index";
import {
  BACKDROP_SETTLE_MS,
  BACKDROP_START_MS,
  backdrop3DErrors,
  backdropColors,
  backdropRise,
} from "../src/kit/backdrop3dPlan";
import { buildHelixScene, helixLayout, poseHelix } from "../src/kit/backdrop3dHelix";
import { buildTunnelScene, poseTunnel, tunnelLayout, tunnelRings } from "../src/kit/backdrop3dTunnel";
import { BACKDROP_BUILDERS } from "../src/kit/backdrop3dVariants";
import { fieldTheme } from "../src/theme/field";

const reel = resolveTheme({ theme: "dark", palette: "reel" });
const FIELDS = ["p1", "p2", "p3", "p4"] as const;

const draw = (props: Record<string, unknown>, frame: number, aspect: Aspect = "16:9", frames = 150) => {
  const Component = kit.Backdrop3D!;
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: 30, frame, frames }}>
      <Component {...props} progress={frame / (frames - 1)} theme={lightTheme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
};

/** Every colour a built scene draws with: material colours and per-instance colours, as hex. */
function sceneColors(scene: THREE.Scene): Set<string> {
  const colors = new Set<string>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const material = mesh.material as THREE.MeshBasicMaterial | undefined;
    if (material === undefined || !material.visible) return;
    if (object instanceof THREE.InstancedMesh && object.instanceColor !== null) {
      const c = new THREE.Color();
      for (let i = 0; i < object.count; i++) colors.add(`#${object.getColorAt(i, c).getHexString()}`);
    } else colors.add(`#${material.color.getHexString()}`);
  });
  if (scene.fog instanceof THREE.Fog) colors.add(`#${scene.fog.color.getHexString()}`);
  return colors;
}

const themeHexes = (theme: typeof reel) =>
  new Set(
    [...Object.values(theme.colors).filter((v): v is string => typeof v === "string"), ...Object.values(theme.colors.palette ?? {})].map(
      (hex) => `#${new THREE.Color(hex).getHexString()}`,
    ),
  );

describe("props", () => {
  it("accepts the four variants, both intensities and a finite seed", () => {
    for (const variant of ["helix", "blobs", "city", "tunnel"]) expect(backdrop3DErrors({ variant })).toEqual([]);
    expect(backdrop3DErrors({ variant: "helix", intensity: "busy", seed: 7 })).toEqual([]);
    expect(backdrop3DErrors({ variant: "tunnel", intensity: "calm", seed: -2.5 })).toEqual([]);
  });

  it("rejects an unknown variant, a bad intensity and a non-finite seed", () => {
    expect(backdrop3DErrors({ variant: "waves" }).join()).toMatch(/variant/);
    expect(backdrop3DErrors({}).join()).toMatch(/variant/);
    expect(backdrop3DErrors({ variant: "helix", intensity: "wild" }).join()).toMatch(/intensity/);
    for (const seed of [Number.NaN, Infinity, "3"]) expect(backdrop3DErrors({ variant: "helix", seed }).join()).toMatch(/seed/);
  });

  it("throws through the kit on an unknown variant, and on a variant not built yet", () => {
    expect(() => draw({ variant: "waves" }, 10)).toThrow(/Backdrop3D: .*variant/);
    for (const variant of ["helix", "blobs", "city", "tunnel"].filter((v) => BACKDROP_BUILDERS[v as keyof typeof BACKDROP_BUILDERS] === undefined)) {
      expect(() => draw({ variant }, 10)).toThrow(`Backdrop3D: variant "${variant}" is not built yet`);
    }
  });
});

describe("the entrance", () => {
  it("rises from 0 at 0 ms to 1 by 1.5 s, never backwards", () => {
    expect(backdropRise(0)).toBe(0);
    expect(backdropRise(BACKDROP_START_MS)).toBe(0);
    expect(BACKDROP_SETTLE_MS).toBeLessThanOrEqual(1500);
    expect(backdropRise(1500)).toBe(1);
    expect(backdropRise(60_000)).toBe(1);
    let last = 0;
    for (let ms = 0; ms <= 1600; ms += 25) {
      const rise = backdropRise(ms);
      expect(rise).toBeGreaterThanOrEqual(last);
      last = rise;
    }
  });

  it("puts the rise and the variant in the markup, filling the frame or the slot", () => {
    for (const aspect of ASPECTS) {
      const early = draw({ variant: "helix" }, 3, aspect);
      const mid = draw({ variant: "helix" }, 20, aspect);
      const late = draw({ variant: "helix" }, 60, aspect);
      expect(early).toContain('data-backdrop="helix"');
      expect(early).toContain('data-backdrop-rise="0.0000"');
      expect(mid).not.toMatch(/data-backdrop-rise="(0\.0000|1\.0000)"/);
      expect(late).toContain('data-backdrop-rise="1.0000"');
      expect(late).toContain('data-three-stage="Backdrop3D"');
    }
    const Component = kit.Backdrop3D!;
    const html = renderToStaticMarkup(<Component variant="tunnel" progress={0.5} theme={lightTheme} aspect="9:16" area={{ x: 40, y: 600, width: 1000, height: 800 }} />);
    expect(html).toMatch(/left:40px;top:600px;width:1000px;height:800px/);
  });
});

describe("colours", () => {
  it("are the ink, the accent, a grey step and the swatches other than the ground", () => {
    for (const role of FIELDS) {
      const theme = fieldTheme(reel, role);
      const colors = backdropColors(theme);
      expect(colors.ink).toBe(theme.colors.text);
      expect(colors.accent).toBe(theme.colors.accent);
      expect([theme.colors.textMuted, theme.colors.textSubtle]).toContain(colors.grey);
      expect(colors.swatches).not.toContain(theme.colors.ground);
      expect(colors.swatches.length).toBeGreaterThan(0);
    }
    expect(backdropColors(lightTheme).swatches).toEqual([lightTheme.colors.accent]);
  });

  it("every colour a built scene uses is one of the theme's, on every reel field", () => {
    for (const role of FIELDS) {
      const theme = fieldTheme(reel, role);
      const allowed = themeHexes(theme);
      for (const [variant, builder] of Object.entries(BACKDROP_BUILDERS)) {
        for (const intensity of ["calm", "busy"] as const) {
          const built = builder!.build(theme, 1, intensity, { width: 1920, height: 1080 });
          builder!.pose(built.state, 2000);
          for (const hex of sceneColors(built.scene)) expect(allowed, `${variant} ${intensity} on ${role}: ${hex}`).toContain(hex);
        }
      }
    }
  });
});

describe("helix", () => {
  it("lays out the same for a seed and differently for another", () => {
    expect(helixLayout(1, "calm")).toEqual(helixLayout(1, "calm"));
    expect(helixLayout(2, "calm")).not.toEqual(helixLayout(1, "calm"));
  });

  it("is denser and quicker when busy", () => {
    const calm = helixLayout(1, "calm");
    const busy = helixLayout(1, "busy");
    expect(busy.squares.length).toBeGreaterThan(calm.squares.length);
    expect(Math.abs(busy.spinPerMs)).toBeGreaterThan(Math.abs(calm.spinPerMs));
  });

  it("builds one instanced square per point, hidden at 0 ms and grown by the settle, and keeps turning", () => {
    const layout = helixLayout(3, "calm");
    const built = buildHelixScene(reel, layout, { width: 1080, height: 1920 });
    const squares = built.state.squares;
    expect(squares).toBeInstanceOf(THREE.InstancedMesh);
    expect(squares.count).toBe(layout.squares.length);
    const scaleAt = (ms: number) => {
      poseHelix(built.state, ms);
      const m = new THREE.Matrix4();
      let total = 0;
      for (let i = 0; i < squares.count; i++) {
        squares.getMatrixAt(i, m);
        total += new THREE.Vector3().setFromMatrixColumn(m, 0).length();
      }
      return total / squares.count;
    };
    expect(scaleAt(0)).toBeCloseTo(0, 5);
    const settled = scaleAt(BACKDROP_SETTLE_MS);
    expect(settled).toBeGreaterThan(0);
    expect(scaleAt(BACKDROP_SETTLE_MS + 4000)).toBeCloseTo(settled, 5);
    const at = (ms: number) => {
      poseHelix(built.state, ms);
      return squares.instanceMatrix.array.slice(0, 16).join();
    };
    expect(at(3000)).not.toBe(at(4000));
    expect(at(3000)).toBe(at(3000));
  });

  it("frames the torus inside the stage in both aspects", () => {
    for (const size of [
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
      { width: 1080, height: 1350 },
    ]) {
      const built = buildHelixScene(reel, helixLayout(1, "busy"), size);
      for (const ms of [BACKDROP_SETTLE_MS, 5000, 12_345]) {
        poseHelix(built.state, ms);
        const { squares } = built.state;
        const m = new THREE.Matrix4();
        const p = new THREE.Vector3();
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < squares.count; i++) {
          squares.getMatrixAt(i, m);
          p.setFromMatrixPosition(m).project(built.camera);
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
        // Inside, with a margin, and big: at least 60% of the narrow side.
        expect(Math.max(-minX, maxX, -minY, maxY)).toBeLessThan(0.95);
        const span = Math.max((maxX - minX) / 2, size.width >= size.height ? (maxY - minY) / 2 : 0);
        expect(span).toBeGreaterThan(0.6);
      }
    }
  });
});

describe("tunnel", () => {
  it("lays out the same for a seed and differently for another", () => {
    expect(tunnelLayout(1, "calm")).toEqual(tunnelLayout(1, "calm"));
    expect(tunnelLayout(2, "calm")).not.toEqual(tunnelLayout(1, "calm"));
  });

  it("is denser and quicker when busy", () => {
    const calm = tunnelLayout(1, "calm");
    const busy = tunnelLayout(1, "busy");
    expect(busy.count / busy.spacing).toBeGreaterThan(calm.count / calm.spacing);
    expect(busy.speedPerMs).toBeGreaterThan(calm.speedPerMs);
  });

  it("flies forward forever: rings are always ahead of the camera, exactly one in the accent", () => {
    const layout = tunnelLayout(5, "busy");
    for (const ms of [0, 800, 1400, 5000, 60_000, 600_000]) {
      const { camera, rings } = tunnelRings(layout, ms);
      expect(rings).toHaveLength(layout.count);
      for (const ring of rings) expect(ring.z).toBeLessThan(camera.z);
      expect(rings.filter((r) => r.accent)).toHaveLength(1);
    }
    expect(tunnelRings(layout, 9000).camera.z).toBeLessThan(tunnelRings(layout, 4000).camera.z);
    expect(tunnelRings(layout, 4000)).toEqual(tunnelRings(layout, 4000));
  });

  it("builds one instanced ring mesh in the ink, with the accent on one instance", () => {
    const theme = fieldTheme(reel, "p2");
    const built = buildTunnelScene(theme, tunnelLayout(1, "calm"), { width: 1920, height: 1080 });
    poseTunnel(built.state, 3000);
    const { rings } = built.state;
    expect(rings).toBeInstanceOf(THREE.InstancedMesh);
    const c = new THREE.Color();
    const hexes = Array.from({ length: rings.count }, (_, i) => `#${rings.getColorAt(i, c).getHexString()}`);
    const accent = `#${new THREE.Color(theme.colors.accent).getHexString()}`;
    expect(hexes.filter((h) => h === accent)).toHaveLength(1);
    expect(new Set(hexes).size).toBe(2);
  });
});
