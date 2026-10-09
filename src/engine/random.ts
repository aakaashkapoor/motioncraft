// Deterministic randomness: the same seed always gives the same value, so
// every render of a frame is identical.

export type Seed = number | string;

/** A 32-bit integer hash of the seed and any extra integers (murmur3 mixing). */
function hash(seed: Seed, ...ints: number[]): number {
  let h = 0x9e3779b9;
  const mix = (k: number) => {
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    h ^= Math.imul(k, 0x1b873593);
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  };
  if (typeof seed === "string") {
    for (let i = 0; i < seed.length; i++) mix(seed.charCodeAt(i));
    mix(seed.length);
  } else {
    if (!Number.isFinite(seed)) throw new Error(`random: seed must be finite, got ${seed}`);
    // Mix both halves of the float so fractional seeds differ too.
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, seed === 0 ? 0 : seed);
    mix(view.getInt32(0));
    mix(view.getInt32(4));
  }
  for (const n of ints) mix(n);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A deterministic value in [0, 1) for the seed. */
export function random(seed: Seed): number {
  return hash(seed) / 2 ** 32;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Dot product of the lattice point's pseudo-random unit gradient with (dx, dy). */
function gradient(seed: Seed, ix: number, iy: number, dx: number, dy: number): number {
  const angle = (hash(seed, ix, iy) / 2 ** 32) * 2 * Math.PI;
  return Math.cos(angle) * dx + Math.sin(angle) * dy;
}

/**
 * Smooth 2D gradient (Perlin) noise in [-1, 1]. Deterministic for a seed;
 * nearby points give nearby values, and it is 0 on integer lattice points.
 */
export function noise2D(seed: Seed, x: number, y: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`noise2D: x and y must be finite, got (${x}, ${y})`);
  }
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fade(fx);
  const v = fade(fy);
  const n00 = gradient(seed, ix, iy, fx, fy);
  const n10 = gradient(seed, ix + 1, iy, fx - 1, fy);
  const n01 = gradient(seed, ix, iy + 1, fx, fy - 1);
  const n11 = gradient(seed, ix + 1, iy + 1, fx - 1, fy - 1);
  const top = n00 + (n10 - n00) * u;
  const bottom = n01 + (n11 - n01) * u;
  // Unit-gradient 2D Perlin noise stays within ±√½; scale up to ±1.
  const value = (top + (bottom - top) * v) * Math.SQRT2;
  return Math.min(1, Math.max(-1, value)) + 0;
}
