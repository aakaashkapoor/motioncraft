import type { SpringPreset } from "../engine/spring";
// The shape every theme fills in (design v2, section 1). A theme is a plain
// object of tokens: color roles, ground style, accent intensity, type, shape,
// depth and motion. Kit components read from it and never hard-code values.
// A storyboard can override any token (see `resolveTheme`).

import type { Aspect } from "../storyboard/types";

/**
 * Colors by role, as hex strings (`#rgb` or `#rrggbb`). Neutrals are tinted,
 * never pure #000 or #fff.
 */
export interface ThemeColors {
  /** Full-frame backdrop. The ground style draws over it (see `ThemeGround`). */
  ground: string;
  /** Cards, panels and other raised areas. */
  surface: string;
  /** A second surface: nested panels, inactive rows, chrome. */
  surfaceAlt: string;
  /** Primary text. */
  text: string;
  /** Secondary text: subtitles, labels, captions. Meets WCAG AA on ground and surface. */
  textMuted: string;
  /** Tertiary text: eyebrows, timestamps, decoration. Large text only. */
  textSubtle: string;
  /** The one highlight color. */
  accent: string;
  /** Text and icons drawn on an accent fill. */
  accentText: string;
  /** Hairline borders and dividers. */
  border: string;
  /** Color of the card shadow (see `ThemeShadow`). */
  shadow: string;
}

export type ColorRole = keyof ThemeColors;

export const GROUND_STYLES = ["solid", "vignette", "grid", "noise"] as const;
/** solid; vignette (a soft radial gradient); grid (a faint dot grid); noise (subtle seeded grain). */
export type GroundStyle = (typeof GROUND_STYLES)[number];

export interface ThemeGround {
  style: GroundStyle;
  /** Seed for the `noise` grain, so the same storyboard gives the same pixels. */
  seed: number;
}

export const ACCENT_INTENSITIES = ["subtle", "bold", "full"] as const;
/**
 * How much accent a video uses: `subtle` (one accent element per scene),
 * `bold` (accent headlines and cards) or `full` (the accent is the ground).
 */
export type AccentIntensity = (typeof ACCENT_INTENSITIES)[number];

/** CSS font-family stacks, ending in a generic family. */
export interface ThemeFonts {
  display: string;
  body: string;
  mono: string;
}

/** One step of the type ramp at one aspect. */
export interface TypeSpec {
  /** Font size in px. */
  size: number;
  /** CSS font weight, 100-900. */
  weight: number;
  /** Letter spacing in em (negative is tighter). */
  tracking: number;
  /** Unitless line height. */
  lineHeight: number;
}

export const TYPE_ROLES = ["eyebrow", "headline", "title", "body", "caption", "mono"] as const;
export type TypeRole = (typeof TYPE_ROLES)[number];

/** The type ramp: every role, specified for each aspect. */
export type TypeRamp = Record<TypeRole, Record<Aspect, TypeSpec>>;

/**
 * Font sizes in px, designed for the 9:16 frame (see `fontScale`). The fitting
 * scale components step down when text is too long for its box.
 */
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

/** Corner radii in px. `md` is the default for cards and panels. */
export interface ThemeRadius {
  sm: number;
  md: number;
  lg: number;
  /** Fully rounded ends for pills and badges. */
  pill: number;
}

/** The card shadow, drawn in `colors.shadow`: soft and long. */
export interface ThemeShadow {
  /** Vertical offset in px. */
  y: number;
  /** Blur radius in px. */
  blur: number;
  /** Shadow color opacity, 0..1. */
  opacity: number;
}

// The spring presets themselves live in the engine; themes only name them.
export const SPRING_PRESETS = ["smooth", "snappy", "gentle", "bouncy"] as const satisfies readonly SpringPreset[];

export interface ThemeMotion {
  /** Name of the default easing curve, e.g. "expoOut" or "easeInOutCubic". */
  easing: string;
  /** How long an element takes to enter, in ms. */
  enterMs: number;
  /** How long an element takes to exit, in ms. */
  exitMs: number;
  /** Default length of a transition between scenes, in ms. */
  transitionMs: number;
  /** Delay between items of a staggered group, in ms. */
  staggerMs: number;
  /** Spring preset names by use. */
  springs: {
    /** Elements arriving. */
    enter: SpringPreset;
    /** Elements leaving. */
    exit: SpringPreset;
    /** A highlight or a value landing. */
    emphasis: SpringPreset;
  };
}

export interface Theme {
  name: string;
  colors: ThemeColors;
  ground: ThemeGround;
  accentIntensity: AccentIntensity;
  fonts: ThemeFonts;
  type: TypeRamp;
  typeScale: ThemeTypeScale;
  spacing: ThemeSpacing;
  radius: ThemeRadius;
  cardShadow: ThemeShadow;
  /** Width of hairline borders, in px. */
  hairline: number;
  motion: ThemeMotion;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Any subset of a theme's tokens, deep-merged over a named theme. */
export type ThemeOverrides = DeepPartial<Omit<Theme, "name">>;
