import type { SpringPreset } from "../engine/spring";
// The shape every theme fills in (design v2, section 1; type and spacing from
// design v3, sections B and C). A theme is a plain object of tokens: color
// roles, ground style, accent intensity, type, shape, depth and motion. Kit
// components read from it and never hard-code values. A storyboard can
// override any token (see `resolveTheme`).

import type { Aspect, SafeProfile, TransitionType } from "../storyboard/types";

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

/**
 * The steps of the type ramp (design v3, table B), largest first, then mono:
 * `numeral` BigNumber digits; `hero` a 1-3 word hook or end card; `display` a
 * TitleCard title; `headline` a Section headline; `title` card and window
 * titles, big list items; `subtitle` subtitles and captions; `body` card body,
 * list and chat text; `label` timestamps, small UI, notes; `eyebrow` a kicker;
 * `mono` code and terminal.
 */
export const TYPE_ROLES = ["numeral", "hero", "display", "headline", "title", "subtitle", "body", "label", "eyebrow", "mono"] as const;
export type TypeRole = (typeof TYPE_ROLES)[number];

/** The one type ramp: every step, specified for each aspect. Components read size, weight, tracking and line height only from it. */
export type TypeRamp = Record<TypeRole, Record<Aspect, TypeSpec>>;

/** The five weights the system uses. Ramp steps carry their own; these are for emphasis inside a step. */
export interface ThemeWeights {
  regular: number;
  medium: number;
  semibold: number;
  bold: number;
  heavy: number;
}

/** The 8 px spacing scale, in px: 8, 16, 24, 32, 48, 64, 96, 128 by default. */
export interface ThemeSpacing {
  xxs: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  xxxl: number;
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
  /** Default transition between scenes, where the storyboard sets none. */
  transition: TransitionType;
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
  weights: ThemeWeights;
  spacing: ThemeSpacing;
  radius: ThemeRadius;
  cardShadow: ThemeShadow;
  /** Width of hairline borders, in px. */
  hairline: number;
  motion: ThemeMotion;
  /** The 9:16 safe profile layout keeps clear of (design v3, section C). Set by the storyboard's `safe`. */
  safe: SafeProfile;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Any subset of a theme's tokens, deep-merged over a named theme. The safe profile has its own storyboard field. */
export type ThemeOverrides = DeepPartial<Omit<Theme, "name" | "safe">>;
