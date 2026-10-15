// The pure parts of Backdrop3D: its prop rules, the entrance on the scene
// clock, the theme colours the backdrops draw with, and each variant's
// density and speed per intensity. No WebGL here, so all of it runs in tests.

import type { Theme } from "../theme/types";
import { paletteSwatches } from "../theme/palettes";

export const BACKDROP_VARIANTS = ["helix", "blobs", "city", "tunnel"] as const;
export type BackdropVariant = (typeof BACKDROP_VARIANTS)[number];
export const BACKDROP_INTENSITIES = ["calm", "busy"] as const;
export type BackdropIntensity = (typeof BACKDROP_INTENSITIES)[number];

/** What is wrong with Backdrop3D props; empty when they are fine. */
export function backdrop3DErrors(props: Record<string, unknown>): string[] {
  const { variant, intensity, seed } = props;
  const errors: string[] = [];
  if (!(BACKDROP_VARIANTS as readonly unknown[]).includes(variant)) errors.push(`\`variant\` must be one of ${BACKDROP_VARIANTS.join(", ")} (got ${JSON.stringify(variant)})`);
  if (intensity !== undefined && !(BACKDROP_INTENSITIES as readonly unknown[]).includes(intensity)) errors.push(`\`intensity\` must be one of ${BACKDROP_INTENSITIES.join(", ")}`);
  if (seed !== undefined && (typeof seed !== "number" || !Number.isFinite(seed))) errors.push("`seed` must be a finite number");
  return errors;
}

// ---- The entrance ----

/** The backdrop starts on the lead and has settled, whole and readable, by BACKDROP_SETTLE_MS. */
export const BACKDROP_START_MS = 150;
export const BACKDROP_SETTLE_MS = 1400;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;

/** How far the entrance has come at `ms` on the scene clock: 0 until the start, eased out, exactly 1 from the settle. */
export function backdropRise(ms: number): number {
  if (ms <= BACKDROP_START_MS) return 0;
  if (ms >= BACKDROP_SETTLE_MS) return 1;
  return easeOutCubic((ms - BACKDROP_START_MS) / (BACKDROP_SETTLE_MS - BACKDROP_START_MS));
}

/**
 * One element's own entrance inside the backdrop's: it starts `delayMs` after
 * the backdrop and lasts `durationMs`, both chosen so it lands by the settle.
 */
export function stagedRise(ms: number, delayMs: number, durationMs: number): number {
  return easeOutCubic((ms - BACKDROP_START_MS - delayMs) / durationMs);
}

// ---- Colours ----

export interface BackdropColors {
  /** The ground's ink (theme text). */
  ink: string;
  accent: string;
  /** A quieter step of the ink toward the ground. */
  grey: string;
  /** The palette swatches other than the ground (the accent alone without a palette). */
  swatches: string[];
}

/** The theme colours a backdrop draws with: never anything else. */
export function backdropColors(theme: Theme): BackdropColors {
  const { text, accent, textSubtle, ground, palette } = theme.colors;
  const swatches = palette === undefined ? [] : paletteSwatches(palette).map((s) => s.color).filter((c) => c.toLowerCase() !== ground.toLowerCase());
  return { ink: text, accent, grey: textSubtle, swatches: swatches.length === 0 ? [accent] : swatches };
}

// ---- Density and speed ----

export interface HelixSpec {
  /** Strands wound round the torus, and squares on each. */
  strands: number;
  perStrand: number;
  /** Times each strand winds round the tube in one trip round the ring. */
  windings: number;
  /** Turns a minute about the torus's own axis. */
  turnsPerMinute: number;
}

export const HELIX_SPECS: Record<BackdropIntensity, HelixSpec> = {
  calm: { strands: 3, perStrand: 360, windings: 7, turnsPerMinute: 2 },
  busy: { strands: 4, perStrand: 440, windings: 9, turnsPerMinute: 4 },
};

export interface TunnelSpec {
  /** Rings in view at once, and the gap between them (one unit is a ring's radius). */
  rings: number;
  spacing: number;
  /** How fast the camera flies in, ring radii a second. */
  speed: number;
}

export const TUNNEL_SPECS: Record<BackdropIntensity, TunnelSpec> = {
  calm: { rings: 14, spacing: 1.1, speed: 0.9 },
  busy: { rings: 20, spacing: 0.8, speed: 1.8 },
};

export interface BlobSpec {
  /** Metaballs drifting at once. */
  count: number;
  /** Each axis of a ball's path takes this long to swing once, ms (seeded within the range). */
  periodMinMs: number;
  periodMaxMs: number;
}

export const BLOB_SPECS: Record<BackdropIntensity, BlobSpec> = {
  calm: { count: 6, periodMinMs: 9000, periodMaxMs: 15000 },
  busy: { count: 9, periodMinMs: 5000, periodMaxMs: 8500 },
};

export interface CitySpec {
  /** Grid cells a side. */
  size: number;
  /** The camera's slow turn for the hold: ms per swing. */
  turnPeriodMs: number;
}

export const CITY_SPECS: Record<BackdropIntensity, CitySpec> = {
  calm: { size: 9, turnPeriodMs: 18_000 },
  busy: { size: 12, turnPeriodMs: 9_000 },
};
