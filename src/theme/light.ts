import { baseMotion, baseRadius, baseSpacing, baseTypeRamp, baseTypeScale, SYSTEM_MONO, SYSTEM_SANS } from "./base";
import type { Theme } from "./types";

// The default theme: a warm light-grey ground, white cards with soft long
// shadows, near-black text and one blue accent.

export const lightTheme: Theme = {
  name: "light",
  colors: {
    ground: "#f1efeb",
    surface: "#fdfcfa",
    surfaceAlt: "#f7f5f1",
    text: "#1c1a17",
    textMuted: "#56524b",
    textSubtle: "#807b72",
    accent: "#2f54d4",
    accentText: "#fbfaf8",
    border: "#e0dcd4",
    shadow: "#2a2418",
  },
  ground: { style: "vignette", seed: 1 },
  accentIntensity: "subtle",
  fonts: {
    display: `"Geist", ${SYSTEM_SANS}`,
    body: `"Geist", ${SYSTEM_SANS}`,
    mono: `"Geist Mono", ${SYSTEM_MONO}`,
  },
  type: baseTypeRamp,
  typeScale: baseTypeScale,
  spacing: baseSpacing,
  radius: baseRadius,
  cardShadow: { y: 24, blur: 64, opacity: 0.12 },
  hairline: 2,
  motion: baseMotion,
};
