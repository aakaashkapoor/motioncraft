import { MONO_FAMILY, SANS_FAMILY } from "../render/fontFaces";
import { baseCaption, baseMesh, baseMotion, baseRadius, baseSpacing, baseTypeRamp, baseWeights, SYSTEM_MONO, SYSTEM_SANS } from "./base";
import { DEFAULT_SAFE_PROFILE } from "../storyboard/types";
import type { Theme } from "./types";

// The default theme, from the owner's reference (design v3): a flat warm-grey
// ground, pure white cards with a soft wide shadow, pale chips, near-black
// text, the reference's warm grey for quiet marks and one orange accent.
// Muted text is that grey deepened just enough to read at WCAG AA on the
// ground; text set in the accent goes through `accentInk` for the same reason.

export const lightTheme: Theme = {
  name: "light",
  colors: {
    ground: "#e6e7df",
    surface: "#ffffff",
    surfaceAlt: "#f1f2ea",
    text: "#1c1b18",
    textMuted: "#676660",
    textSubtle: "#8d8c85",
    accent: "#fb5a1f",
    accentText: "#1c1b18",
    border: "#dcddd4",
    shadow: "#2e2d24",
  },
  ground: { style: "solid", seed: 1, grain: 0, mesh: baseMesh },
  accentIntensity: "subtle",
  fonts: {
    display: `${SANS_FAMILY}, ${SYSTEM_SANS}`,
    body: `${SANS_FAMILY}, ${SYSTEM_SANS}`,
    mono: `${MONO_FAMILY}, ${SYSTEM_MONO}`,
  },
  type: baseTypeRamp,
  weights: baseWeights,
  spacing: baseSpacing,
  radius: { ...baseRadius, md: 28 },
  cardShadow: { y: 24, blur: 80, opacity: 0.08 },
  hairline: 2,
  // The reference keeps the camera calm: no breathing unless a storyboard switches it on (1.00 -> 1.02 then).
  motion: baseMotion,
  caption: baseCaption,
  safe: DEFAULT_SAFE_PROFILE,
};
