// A physical spring: a damped harmonic oscillator solved in closed form, so
// any frame can be computed directly. Pure and deterministic.

import { spring as springEasing, type Easing, type SpringOptions } from "./easing";

export interface SpringConfig {
  /** Default 1. */
  mass: number;
  /** Default 100. */
  stiffness: number;
  /** Default 10. Higher settles with less bounce. */
  damping: number;
  /** Never go past `to`. Default false. */
  overshootClamping: boolean;
}

export const springPresets = {
  /** No bounce at all. */
  smooth: { damping: 200 },
  /** Quick, with a hint of bounce. */
  snappy: { damping: 20, stiffness: 200 },
  /** Slow and soft. */
  gentle: { damping: 30, stiffness: 60 },
  /** Visibly bounces. */
  bouncy: { damping: 8 },
} as const satisfies Record<string, Partial<SpringConfig>>;

export type SpringPreset = keyof typeof springPresets;

const DEFAULTS: SpringConfig = { mass: 1, stiffness: 100, damping: 10, overshootClamping: false };

/** How close to the target counts as settled. */
export const SPRING_SETTLE_THRESHOLD = 0.005;

export interface SpringParams {
  frame: number;
  fps: number;
  /** A preset name or (partial) config. */
  config?: SpringPreset | Partial<SpringConfig>;
  /** Stretch the natural settle curve to exactly this many frames. */
  durationInFrames?: number;
  /** Frames to hold at `from` before starting. Default 0. */
  delay?: number;
  /** Default 0. */
  from?: number;
  /** Default 1. */
  to?: number;
}

function resolveConfig(config: SpringParams["config"]): SpringConfig {
  const partial = typeof config === "string" ? springPresets[config] : config;
  if (partial === undefined && config !== undefined) throw new Error(`spring: unknown preset "${String(config)}"`);
  const resolved = { ...DEFAULTS, ...partial };
  if (!Number.isFinite(resolved.mass) || resolved.mass <= 0) {
    throw new Error(`spring: mass must be a finite number > 0, got ${resolved.mass}`);
  }
  if (!Number.isFinite(resolved.stiffness) || resolved.stiffness <= 0) {
    throw new Error(`spring: stiffness must be a finite number > 0, got ${resolved.stiffness}`);
  }
  if (!Number.isFinite(resolved.damping) || resolved.damping < 0) {
    throw new Error(`spring: damping must be a finite number >= 0, got ${resolved.damping}`);
  }
  return resolved;
}

function checkFps(fps: number) {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`spring: fps must be a positive number, got ${fps}`);
}

/**
 * Displacement from the target at time `t` seconds, for a spring released from
 * rest at displacement -1. Also returns an upper bound on |displacement| from
 * `t` onward (the decay envelope), used to decide when it has settled.
 */
function displacement({ mass, stiffness, damping }: SpringConfig, t: number): { x: number; bound: number } {
  const x0 = -1;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * w0 * t);
    const b = (zeta * w0 * x0) / wd;
    return {
      x: decay * (x0 * Math.cos(wd * t) + b * Math.sin(wd * t)),
      bound: decay * Math.hypot(x0, b),
    };
  }
  if (zeta === 1) {
    // Released from rest, critical and over-damped motion is monotonic, so
    // |x| itself bounds the future.
    const x = Math.exp(-w0 * t) * (x0 + w0 * x0 * t);
    return { x, bound: Math.abs(x) };
  }
  const root = w0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * w0 + root;
  const r2 = -zeta * w0 - root;
  const a = (-r2 * x0) / (r1 - r2);
  const x = a * Math.exp(r1 * t) + (x0 - a) * Math.exp(r2 * t);
  return { x, bound: Math.abs(x) };
}

/** Natural 0 -> 1 progress at frame `frame` (may be fractional). */
function progressAt(config: SpringConfig, frame: number, fps: number): number {
  const p = 1 + displacement(config, frame / fps).x;
  return config.overshootClamping ? Math.min(p, 1) : p;
}

/**
 * Frames until the spring stays within 0.005 of its target for good: the first
 * frame from which every later frame is settled.
 */
export function measureSpring({
  fps,
  config,
  threshold = SPRING_SETTLE_THRESHOLD,
}: {
  fps: number;
  config?: SpringParams["config"];
  threshold?: number;
}): number {
  checkFps(fps);
  const resolved = resolveConfig(config);
  if (resolved.damping === 0) throw new Error("measureSpring: a spring with damping 0 never settles");
  const limit = fps * 3600;
  let lastUnsettled = -1;
  for (let frame = 0; frame <= limit; frame++) {
    const { x, bound } = displacement(resolved, frame / fps);
    const p = 1 + x;
    const settled = Math.abs(1 - (resolved.overshootClamping ? Math.min(p, 1) : p)) < threshold;
    if (!settled) lastUnsettled = frame;
    if (bound < threshold) return lastUnsettled + 1;
  }
  throw new Error(`measureSpring: spring does not settle within an hour at ${fps} fps`);
}

/**
 * A spring value at `frame`, going from `from` to `to`. With `durationInFrames`
 * the natural settle curve is stretched to that length and lands exactly on
 * `to` at its end.
 */
export function spring(params: SpringParams): number;
/** v1: a spring-shaped easing curve. */
export function spring(options?: SpringOptions): Easing;
export function spring(params?: SpringParams | SpringOptions): number | Easing {
  if (params === undefined || !("frame" in params)) return springEasing(params);
  const { frame, fps, config, durationInFrames, delay = 0, from = 0, to = 1 } = params;
  if (!Number.isFinite(frame)) throw new Error(`spring: frame must be finite, got ${frame}`);
  checkFps(fps);
  if (!Number.isFinite(delay)) throw new Error(`spring: delay must be finite, got ${delay}`);
  if (durationInFrames !== undefined && (!Number.isFinite(durationInFrames) || durationInFrames <= 0)) {
    throw new Error(`spring: durationInFrames must be a positive number, got ${durationInFrames}`);
  }
  const resolved = resolveConfig(config);

  const local = frame - delay;
  if (local <= 0) return from;
  let progress: number;
  if (durationInFrames === undefined) {
    progress = progressAt(resolved, local, fps);
  } else {
    if (local >= durationInFrames) return to;
    const natural = measureSpring({ fps, config: resolved });
    progress = progressAt(resolved, (local * natural) / durationInFrames, fps);
  }
  return from + (to - from) * progress;
}
