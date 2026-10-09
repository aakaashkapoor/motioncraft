import { baseMotion, baseRadius, baseSpacing, baseTypeRamp, baseTypeScale, SYSTEM_MONO, SYSTEM_SANS } from "./base";
import type { Theme } from "./types";

// A deep blue-tinted ground with raised surfaces, light text and a periwinkle
// accent, over a faint dot grid.

export const darkTheme: Theme = {
  name: "dark",
  colors: {
    ground: "#0e1116",
    surface: "#181c23",
    surfaceAlt: "#20252e",
    text: "#f1f3f6",
    textMuted: "#a4abb7",
    textSubtle: "#767e8b",
    accent: "#7c9cff",
    accentText: "#0e1116",
    border: "#2b313b",
    shadow: "#030406",
  },
  ground: { style: "grid", seed: 1 },
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
  cardShadow: { y: 24, blur: 72, opacity: 0.5 },
  hairline: 2,
  motion: baseMotion,
};
