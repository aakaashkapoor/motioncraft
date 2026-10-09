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

/** Named curves: `expoOut` is `1 - 2^(-10t)`, `expoIn` its mirror, `expoInOut` the two joined, `power4InOut` the quartic in-out. */
export const CURVE_NAMES = ["linear", "expoOut", "expoIn", "expoInOut", "sineInOut", "power4InOut"] as const;
export type CurveName = (typeof CURVE_NAMES)[number];

/** CSS `cubic-bezier(x1, y1, x2, y2)`: x1 and x2 in 0..1; y may leave 0..1 to overshoot. */
export type CubicBezier = readonly [x1: number, y1: number, x2: number, y2: number];

/** A physical spring (mass 1, see `spring`), its settle curve stretched to the token's duration. */
export interface SpringCurve {
  stiffness: number;
  damping: number;
}

/** The shape of a motion over its duration, 0 -> 1. Springs and some beziers overshoot. */
export type MotionCurve = CurveName | CubicBezier | SpringCurve;

/** A duration and the curve played over it. */
export interface MotionToken {
  /** Duration in ms. */
  ms: number;
  curve: MotionCurve;
}

/** A motion played by a group, item after item. */
export interface StaggeredToken extends MotionToken {
  /** Delay between consecutive items, in ms. */
  staggerMs: number;
}

/** Text rising in: `staggerMs` per word, or per character or line. */
export interface TextInToken extends StaggeredToken {
  charStaggerMs: number;
  lineStaggerMs: number;
}

/** Anything leaving: fast, a share of its entry, within `minMs`-`maxMs`. */
export interface ExitToken {
  share: number;
  minMs: number;
  maxMs: number;
  curve: MotionCurve;
}

/**
 * A marker sweep, starting `delayMs` after the text it marks lands (design
 * v3, life #6): a bar of the accent at `opacity` behind the word, tilted up
 * to the right by `tiltDeg`, or an underline `underlinePx` thick.
 */
export interface MarkToken extends MotionToken {
  delayMs: number;
  tiltDeg: number;
  /** Opacity of the bar's accent, 0..1. */
  opacity: number;
  underlinePx: number;
}

/** The camera's drift over a whole scene: scale 1 -> `scale`. */
export interface BreatheToken {
  scale: number;
  curve: MotionCurve;
}

/** A hold before a payoff. */
export interface BeatToken {
  ms: number;
}

/**
 * A flowing connector (design v3, life #11): once a connector has drawn, a dot
 * travels it, one trip per `ms`, and the node it reaches glows.
 */
export interface FlowToken extends MotionToken {
  /** The dot's diameter in px (10-14). */
  dotPx: number;
  /** Width of the glow ring around the dot and the lit node, in px. */
  glowPx: number;
  /** Opacity of the accent in the glow ring, 0..1. */
  glowOpacity: number;
}

/**
 * Motion by use (design v3, table D). Every kit timing is milliseconds from
 * the scene clock; a scene's length decides only how long the hold lasts.
 * Position and scale may overshoot (springs, `enter`'s bezier); opacity and
 * colour never do. The table's `transition` row is `transition` and
 * `transitionMs`; each presentation draws its own cut-the-curve shape.
 */
export interface ThemeMotion {
  /** Curve of the v1 helpers `presence` and `themeEasing`, e.g. "expoOut". The kit reads the tokens below. */
  easing: string;
  /** Default transition between scenes, where the storyboard sets none. */
  transition: TransitionType;
  /** Default length of a transition between scenes, in ms (500-600). */
  transitionMs: number;
  /** A scene's first motion starts this long in (100-200 ms). */
  leadMs: number;
  /** A cascade (cards, rows, words) finishes within about this long of the scene's start; a long group staggers tighter. */
  cascadeMs: number;
  /** Opacity, colour, a highlight on or off. */
  "fx.fast": MotionToken;
  /** Fades and blur clearing. */
  fx: MotionToken;
  /** A word or line rising in. */
  "text.in": TextInToken;
  /** A headline's characters rising in one by one (design v3, life #3). */
  "text.char": StaggeredToken;
  /** Words leaving. */
  "text.out": StaggeredToken;
  /** Cards, windows and chips arriving. */
  enter: StaggeredToken;
  /** The one big element of a scene arriving. */
  "enter.hero": MotionToken;
  /** Emphasis: a highlighted card, an active badge. */
  pop: MotionToken;
  /** Anything leaving. */
  exit: ExitToken;
  /** A number rolling to its value. */
  count: MotionToken;
  /** A marker or underline sweeping in. */
  mark: MarkToken;
  /** The camera moving to a new framing. */
  shot: MotionToken;
  /** The camera drifting during holds. */
  breathe: BreatheToken;
  /** A hold before a payoff. */
  beat: BeatToken;
  /** A dot flowing along a drawn connector, lighting the node it reaches. */
  flow: FlowToken;
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
