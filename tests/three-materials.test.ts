// Theme-aware 3D materials and studio lights: colours come from the theme
// (never hex literals in src/kit/three), each preset is its own finish, and
// the studio rig is four shadowless lights.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { material, MATERIAL_PRESETS, studioLights } from "../src/kit/three";
import { darkTheme } from "../src/theme/dark";
import { lightTheme } from "../src/theme/light";
import { neutralTheme } from "../src/theme/neutral";

const THEMES = [lightTheme, darkTheme, neutralTheme];

/** The colour three would get from a theme's sRGB hex token (in its linear working space). */
const linear = (hex: string) => new THREE.Color(hex).getHex(THREE.LinearSRGBColorSpace);

describe("material", () => {
  it("reads CSS hex as sRGB and stores it linear, so the sRGB output shows the theme's own colour", () => {
    const grey = new THREE.Color("#808080");
    expect(grey.r).toBeCloseTo(0.2158, 3);
    expect(grey.getHexString()).toBe("808080");
  });

  it("colours every preset from the theme: its default role, or the one asked for", () => {
    for (const theme of THEMES) {
      expect(material(theme, "matte").color.getHex()).toBe(new THREE.Color(theme.colors.surface).getHex());
      expect(material(theme, "glossy").color.getHex()).toBe(new THREE.Color(theme.colors.accent).getHex());
      expect(material(theme, "matte", "accent").color.getHex()).toBe(new THREE.Color(theme.colors.accent).getHex());
      expect(material(theme, "glossy", "text").color.getHex()).toBe(new THREE.Color(theme.colors.text).getHex());
      expect(material(theme, "matte", "ground").color.getHex(THREE.LinearSRGBColorSpace)).toBe(linear(theme.colors.ground));
    }
  });

  it("changes colour with the theme, for every preset", () => {
    for (const preset of MATERIAL_PRESETS) {
      const colours = new Set(THEMES.map((theme) => material(theme, preset).color.getHex()));
      expect(colours.size, preset).toBe(THEMES.length);
    }
  });

  it("gives each preset its own finish", () => {
    const finishes = MATERIAL_PRESETS.map((preset) => {
      const m = material(lightTheme, preset, "accent");
      expect(m).toBeInstanceOf(THREE.MeshPhysicalMaterial);
      return JSON.stringify([m.roughness, m.metalness, m.transmission, m.clearcoat]);
    });
    expect(new Set(finishes).size).toBe(MATERIAL_PRESETS.length);
    const glass = material(lightTheme, "glass");
    expect(glass.transmission).toBeGreaterThan(0.5);
    expect(glass.thickness).toBeGreaterThan(0);
    expect(material(lightTheme, "chrome").metalness).toBe(1);
    expect(material(lightTheme, "matte").metalness).toBe(0);
  });

  it("returns a fresh material each call", () => {
    expect(material(lightTheme, "matte")).not.toBe(material(lightTheme, "matte"));
  });
});

describe("studioLights", () => {
  it("adds key, fill, rim and ambient light to the scene, none casting shadows", () => {
    const scene = new THREE.Scene();
    const lights = studioLights(scene, lightTheme);
    const added = scene.children.filter((child): child is THREE.Light => child instanceof THREE.Light);
    expect(added).toHaveLength(4);
    expect(new Set(added)).toEqual(new Set([lights.key, lights.fill, lights.rim, lights.ambient]));
    for (const light of added) {
      expect(light.castShadow).toBe(false);
      expect(light.intensity).toBeGreaterThan(0);
    }
    expect(lights.ambient).toBeInstanceOf(THREE.HemisphereLight);
    // The key is the brightest, and they come from different sides.
    expect(lights.key.intensity).toBeGreaterThan(lights.fill.intensity);
    expect(Math.sign(lights.key.position.x)).not.toBe(Math.sign(lights.fill.position.x));
    expect(lights.rim.position.z).toBeLessThan(0);
  });

  it("tints the lights from the theme", () => {
    const tints = (theme: typeof lightTheme) => {
      const lights = studioLights(new THREE.Scene(), theme);
      return [lights.key.color, lights.fill.color, lights.rim.color, lights.ambient.color, lights.ambient.groundColor].map((c) => c.getHex());
    };
    expect(tints(lightTheme)).not.toEqual(tints(darkTheme));
    // The hemisphere's ground bounce is the theme's ground.
    const lights = studioLights(new THREE.Scene(), darkTheme);
    expect(lights.ambient.groundColor.getHex()).toBe(new THREE.Color(darkTheme.colors.ground).getHex());
    // Light colours are light, whether the theme is light or dark.
    for (const theme of THEMES) {
      const { key } = studioLights(new THREE.Scene(), theme);
      const hsl = key.color.getHSL({ h: 0, s: 0, l: 0 });
      expect(hsl.l, theme.name).toBeGreaterThan(0.7);
    }
  });
});

describe("src/kit/three", () => {
  it("has no hex colour literals: colours come from the theme", () => {
    const dir = join(import.meta.dirname, "..", "src", "kit", "three");
    const offenders: string[] = [];
    for (const file of readdirSync(dir, { recursive: true }) as string[]) {
      if (!/\.tsx?$/.test(file)) continue;
      readFileSync(join(dir, file), "utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (/#[0-9a-f]{3,8}\b|0x[0-9a-f]{6}\b/i.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
