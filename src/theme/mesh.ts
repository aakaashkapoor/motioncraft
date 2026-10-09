// The mesh ground at rest (design v3, life #5): where its blobs sit, how big
// and how strong they are, and their colours, the accent and a lighter tint of
// it. Blobs drift under text on the ground and overlap, so each blob's colour
// is lifted toward the ground's far side from the text, in 5% steps, just far
// enough that text, muted text and accent text keep AA (or what they had on
// the bare ground) at every point of the frame, wherever the blobs drift. The
// light theme's muted text sits barely above AA, so there the blobs become a
// warm light; the dark theme's keep the accent. Pure (cached per theme).

import { random } from "../engine/random";
import { frameSize } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import { parseHex, toHex } from "./color";
import { AA_CONTRAST, contrastRatio, luminanceContrast, relativeLuminance, rgbLuminance } from "./contrast";
import { accentInk } from "./roles";
import type { Theme } from "./types";

export interface MeshRest {
  /** Where the blob rests, in frame px. */
  homeX: number;
  homeY: number;
  /** Diameter in px. */
  size: number;
  /** One loop of its wander, in ms. */
  periodMs: number;
  /** Colour at its center (hex) and its opacity there; it fades to nothing at its rim (see `meshFalloff`). */
  color: string;
  alpha: number;
}

/** How far out from the frame's center the blobs rest, as a share of its half-width and half-height. */
const SPREAD = 0.55;
/** How far the tint is from the accent toward the theme's lightest neutral. */
const TINT = 0.5;
/** A blob's colour moves toward the far side in this many steps of 1/STEPS. */
const STEPS = 20;
/** Spacing of the points where the guard checks text on the ground, in px. */
const SAMPLE_PX = 60;

/** Radii, from a blob's center (0) to its rim (1), where its soft edge is drawn; it is straight between them. */
export const MESH_STOPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] as const;

/** How strong a blob is at `r` (0 its center, 1 its rim): 1 easing out (smoothstep) to 0, like a blurred disc, straight between `MESH_STOPS` as drawn. */
export function meshFalloff(r: number): number {
  const at = (x: number) => 1 - x * x * (3 - 2 * x);
  if (r <= 0) return 1;
  if (r >= 1) return 0;
  const i = Math.min(MESH_STOPS.length - 2, Math.floor(r * (MESH_STOPS.length - 1)));
  const [a, b] = [MESH_STOPS[i]!, MESH_STOPS[i + 1]!];
  return at(a) + ((at(b) - at(a)) * (r - a)) / (b - a);
}

type Rgb = readonly [number, number, number];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** What a frame shows: whole 8-bit channels. */
const shown = (c: Rgb): Rgb => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];

/** The ground under `blobs` (bottom first), each at `strengths[i]` of its full opacity, for the blobs in `subset` (bit i for blob i). */
function under(ground: Rgb, blobs: ReadonlyArray<{ rgb: Rgb; alpha: number }>, strengths: readonly number[], subset: number): Rgb {
  let color = ground;
  blobs.forEach((blob, i) => {
    if (subset & (1 << i)) color = mix(color, blob.rgb, blob.alpha * strengths[i]!);
  });
  return shown(color);
}

/**
 * For points over the frame, the most each blob can show there at any moment:
 * its falloff where its center comes nearest, anywhere in its drift square.
 */
function reach(rests: ReadonlyArray<Pick<MeshRest, "homeX" | "homeY" | "size">>, aspect: Aspect, drift: number): number[][] {
  const { width, height } = frameSize(aspect);
  const points: Array<[number, number]> = rests.map((r) => [r.homeX, r.homeY]);
  for (let y = SAMPLE_PX / 2; y < height; y += SAMPLE_PX) {
    for (let x = SAMPLE_PX / 2; x < width; x += SAMPLE_PX) points.push([x, y]);
  }
  return points
    .map(([x, y]) =>
      rests.map((r) => {
        const dx = Math.max(0, Math.abs(x - r.homeX) - drift);
        const dy = Math.max(0, Math.abs(y - r.homeY) - drift);
        return meshFalloff(Math.hypot(dx, dy) / (r.size / 2));
      }),
    )
    .filter((strengths) => strengths.some((s) => s > 0));
}

/** `make(theme, aspect)`, worked out once per theme object and aspect: the ground asks for it every frame. */
function memo<T>(make: (theme: Theme, aspect: Aspect) => T): (theme: Theme, aspect: Aspect) => T {
  const cache = new WeakMap<Theme, Map<Aspect, T>>();
  return (theme, aspect) => {
    let byAspect = cache.get(theme);
    if (byAspect === undefined) cache.set(theme, (byAspect = new Map()));
    if (!byAspect.has(aspect)) byAspect.set(aspect, make(theme, aspect));
    return byAspect.get(aspect)!;
  };
}

/** The mesh's blobs at rest, for the theme's seed. */
export const meshLayout: (theme: Theme, aspect: Aspect) => MeshRest[] = memo(layout);

function layout(theme: Theme, aspect: Aspect): MeshRest[] {
  const { width, height } = frameSize(aspect);
  const { ground, surface, text, textMuted, accent } = theme.colors;
  const { seed, mesh } = theme.ground;
  const { px, minMs, maxMs } = theme.motion.drift;
  const key = (i: number, what: string) => `${seed}:mesh:${i}:${what}`;
  const turn = random(key(0, "turn"));
  const places = Array.from({ length: mesh.blobs }, (_, i) => {
    const angle = 2 * Math.PI * (turn + i / mesh.blobs);
    return {
      homeX: width / 2 + (width / 2) * SPREAD * Math.cos(angle),
      homeY: height / 2 + (height / 2) * SPREAD * Math.sin(angle),
      size: Math.round(mesh.minPx + random(key(i, "size")) * (mesh.maxPx - mesh.minPx)),
      periodMs: Math.round(minMs + random(key(i, "period")) * (maxMs - minMs)),
      alpha: Math.round((mesh.minAlpha + random(key(i, "alpha")) * (mesh.maxAlpha - mesh.minAlpha)) * 1000) / 1000,
    };
  });

  const lightest = [ground, surface, text].reduce((a, b) => (relativeLuminance(b) > relativeLuminance(a) ? b : a));
  const wanted = [parseHex(accent), mix(parseHex(accent), parseHex(lightest), TINT)];
  // Lifting a blob toward whichever of ground and surface stands furthest from the text only helps it read.
  const away = parseHex(contrastRatio(surface, text) > contrastRatio(ground, text) ? surface : ground);
  const base = parseHex(ground);
  const readers = [text, textMuted, accentInk(theme)].map((color) => ({
    luminance: relativeLuminance(color),
    floor: Math.min(AA_CONTRAST, contrastRatio(color, ground)),
  }));
  const reads = (c: Rgb) => {
    const l = rgbLuminance(c);
    return readers.every(({ luminance, floor }) => luminanceContrast(luminance, l) >= floor);
  };
  const points = reach(places, aspect, px);

  const blobs: Array<{ rgb: Rgb; alpha: number }> = [];
  for (const [i, place] of places.entries()) {
    let rgb: Rgb = base;
    for (let step = 0; step <= STEPS; step++) {
      const candidate = shown(mix(wanted[i % 2]!, away, step / STEPS));
      const trial = [...blobs, { rgb: candidate, alpha: place.alpha }];
      // Every overlap that includes this blob, at every point, at its strongest there.
      const ok = points.every((strengths) => {
        for (let subset = 1 << i; subset < 1 << (i + 1); subset++) if (!reads(under(base, trial, strengths, subset))) return false;
        return true;
      });
      if (ok) {
        rgb = candidate;
        break;
      }
    }
    blobs.push({ rgb, alpha: place.alpha });
  }
  return places.map((place, i) => ({ ...place, color: toHex(blobs[i]!.rgb) }));
}

/** The mesh's worst ground for text: the point and overlap of blobs, wherever they drift, that leaves the text the least contrast. */
const meshTint = memo((theme: Theme, aspect: Aspect): string => {
  const rests = meshLayout(theme, aspect);
  const blobs = rests.map((r) => ({ rgb: parseHex(r.color), alpha: r.alpha }));
  const base = parseHex(theme.colors.ground);
  const text = relativeLuminance(theme.colors.text);
  let worst: Rgb = base;
  for (const strengths of reach(rests, aspect, theme.motion.drift.px)) {
    for (let subset = 1; subset < 1 << blobs.length; subset++) {
      const color = under(base, blobs, strengths, subset);
      if (luminanceContrast(text, rgbLuminance(color)) < luminanceContrast(text, rgbLuminance(worst))) worst = color;
    }
  }
  return toHex(worst);
});

/**
 * The ground colour text can end up on where the ground moves under it: for
 * the mesh, the point and overlap of blobs, wherever they drift, that leaves
 * the text the least contrast. Undefined for styles that stay put under text.
 * The contrast check judges text on the ground against this.
 */
export function groundTint(theme: Theme, aspect: Aspect): string | undefined {
  return theme.ground.style === "mesh" ? meshTint(theme, aspect) : undefined;
}
