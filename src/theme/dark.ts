import { MONO_FAMILY, SANS_FAMILY } from "../render/fontFaces";
import { baseCaption, baseMesh, baseMotion, baseRadius, baseSpacing, baseTypeRamp, baseWeights, SYSTEM_MONO, SYSTEM_SANS } from "./base";
import { DEFAULT_SAFE_PROFILE } from "../storyboard/types";
import type { Theme } from "./types";

// A deep blue-tinted ground with raised surfaces, light text and a periwinkle
// accent, over a living mesh of soft accent light (design v3, life #5).

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
  ground: { style: "mesh", seed: 1, grain: 0, mesh: baseMesh },
  accentIntensity: "subtle",
  fonts: {
    display: `${SANS_FAMILY}, ${SYSTEM_SANS}`,
    body: `${SANS_FAMILY}, ${SYSTEM_SANS}`,
    mono: `${MONO_FAMILY}, ${SYSTEM_MONO}`,
  },
  type: baseTypeRamp,
  weights: baseWeights,
  spacing: baseSpacing,
  radius: baseRadius,
  cardShadow: { y: 24, blur: 72, opacity: 0.5 },
  hairline: 2,
  motion: baseMotion,
  caption: baseCaption,
  safe: DEFAULT_SAFE_PROFILE,
};
