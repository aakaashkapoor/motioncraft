import { baseMotion, baseRadius, baseSpacing, baseTypeRamp, baseWeights, SYSTEM_MONO, SYSTEM_SANS } from "./base";
import { DEFAULT_SAFE_PROFILE } from "../storyboard/types";
import type { Theme } from "./types";

// The v1 look, kept for compatibility: a near-black solid ground, near-white
// text, one sky-blue accent, system fonts and easeInOutCubic motion.

export const neutralTheme: Theme = {
  name: "neutral",
  colors: {
    ground: "#0b0d10",
    surface: "#1a1d23",
    surfaceAlt: "#22262d",
    text: "#f5f6f8",
    textMuted: "#a3a9b3",
    textSubtle: "#7b818b",
    accent: "#4cc2ff",
    accentText: "#0b0d10",
    border: "#2a2e35",
    shadow: "#030405",
  },
  ground: { style: "solid", seed: 1 },
  accentIntensity: "subtle",
  fonts: {
    display: SYSTEM_SANS,
    body: SYSTEM_SANS,
    mono: SYSTEM_MONO,
  },
  type: baseTypeRamp,
  weights: baseWeights,
  spacing: baseSpacing,
  radius: baseRadius,
  cardShadow: { y: 16, blur: 48, opacity: 0.4 },
  hairline: 2,
  motion: { ...baseMotion, easing: "easeInOutCubic", enterMs: 400, exitMs: 300 },
  safe: DEFAULT_SAFE_PROFILE,
};
