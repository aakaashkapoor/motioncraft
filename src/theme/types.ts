// The shape every theme fills in. A theme sets the look (colors, fonts, sizes)
// and the motion style; kit components read from it and never hard-code values.

/** Colors as hex strings (`#rgb` or `#rrggbb`). */
export interface ThemeColors {
  /** Full-frame backdrop. */
  background: string;
  /** Cards, panels and other raised areas drawn on the background. */
  surface: string;
  /** Primary text. Must reach 7:1 contrast on background (WCAG AAA). */
  text: string;
  /** Secondary text: labels, captions, axis ticks. */
  muted: string;
  /** Main highlight color. */
  accent: string;
  /** Second highlight, for contrast with accent (e.g. "before vs after"). */
  accentAlt: string;
}

/** CSS font-family stacks, ending in a generic family. */
export interface ThemeFonts {
  display: string;
  body: string;
  mono: string;
}

/** Font sizes in px, designed for the 9:16 frame (see `fontScale`). */
export interface ThemeTypeScale {
  caption: number;
  body: number;
  subtitle: number;
  title: number;
  display: number;
}

export type TypeStep = keyof ThemeTypeScale;

/** Spacing in px, designed for the 9:16 frame. */
export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface ThemeMotion {
  /** Name of the default easing curve, e.g. "easeInOutCubic". */
  easing: string;
  /** How long a scene takes to enter, in ms. */
  sceneEnterMs: number;
  /** How long a scene takes to exit, in ms. */
  sceneExitMs: number;
}

export interface Theme {
  name: string;
  colors: ThemeColors;
  fonts: ThemeFonts;
  typeScale: ThemeTypeScale;
  spacing: ThemeSpacing;
  /** Corner radius for cards and panels, in px. */
  radius: number;
  motion: ThemeMotion;
}
