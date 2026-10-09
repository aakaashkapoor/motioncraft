// Small helpers for choreographing groups and drawing lines.

export interface StaggerOptions {
  /** When the first item starts. Default 0. */
  start?: number;
  /** Gap between consecutive items. */
  step: number;
}

/** When item `index` starts: `start + index * step` (frames, ms or progress). */
export function stagger(index: number, { start = 0, step }: StaggerOptions): number {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`stagger: index must be a whole number >= 0, got ${index}`);
  }
  if (!Number.isFinite(start) || !Number.isFinite(step)) {
    throw new Error(`stagger: start and step must be finite, got start ${start}, step ${step}`);
  }
  return start + index * step;
}

export interface DrawPathStyle {
  strokeDasharray: string;
  strokeDashoffset: number;
}

/**
 * Stroke dash values that reveal a path of `length` as `progress` goes 0 -> 1:
 * hidden at 0, fully drawn at 1. Progress is clamped.
 */
export function drawPath(progress: number, length: number): DrawPathStyle {
  if (!Number.isFinite(length) || length < 0) {
    throw new Error(`drawPath: length must be a finite number >= 0, got ${length}`);
  }
  if (!Number.isFinite(progress)) throw new Error(`drawPath: progress must be finite, got ${progress}`);
  const p = Math.min(1, Math.max(0, progress));
  return { strokeDasharray: `${length} ${length}`, strokeDashoffset: length * (1 - p) };
}
