import type { Theme } from "./types";

// The default theme: clean and high-contrast. Near-black background, near-white
// text, one sky-blue accent (plus an amber alternate for comparisons).
// System font stacks only; no bundled fonts yet.

const SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
const MONO = 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

export const neutralTheme: Theme = {
  name: "neutral",
  colors: {
    background: "#0b0d10",
    surface: "#1a1d23",
    text: "#f5f6f8",
    muted: "#a3a9b3",
    accent: "#4cc2ff",
    accentAlt: "#ffb547",
  },
  fonts: {
    display: SANS,
    body: SANS,
    mono: MONO,
  },
  // Sized for a 1080px-wide vertical frame viewed on a phone.
  typeScale: {
    caption: 40,
    body: 52,
    subtitle: 64,
    title: 88,
    display: 128,
  },
  spacing: {
    xs: 8,
    sm: 16,
    md: 32,
    lg: 56,
    xl: 96,
  },
  radius: 24,
  motion: {
    easing: "easeInOutCubic",
    sceneEnterMs: 400,
    sceneExitMs: 300,
  },
};
