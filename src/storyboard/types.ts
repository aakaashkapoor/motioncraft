// The storyboard: the JSON document an agent writes before any scene is built.
// See docs/design.md, "The workflow", step 1.

import type { AccentIntensity, ThemeOverrides } from "../theme/types";

export const ASPECTS = ["9:16", "16:9"] as const;
export type Aspect = (typeof ASPECTS)[number];

/**
 * Which platform UI a 9:16 frame keeps its text clear of (design v3, section
 * C): `shorts` (YouTube Shorts, the default) or `crosspost` (the union of
 * TikTok, Reels and Shorts: smaller, but safe on all three). 16:9 has no
 * overlaid UI, so both profiles are the same there.
 */
export const SAFE_PROFILES = ["shorts", "crosspost"] as const;
export type SafeProfile = (typeof SAFE_PROFILES)[number];
export const DEFAULT_SAFE_PROFILE: SafeProfile = "shorts";

export const DEFAULT_FPS = 30;
export const DEFAULT_THEME = "light";

export const TRANSITION_TYPES = ["cut", "fade", "slide", "zoomBlur", "wipe"] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];

export const SLIDE_DIRECTIONS = ["left", "right", "up", "down"] as const;
/** Which way a `slide` or `wipe` travels: "left" moves content leftward, so the next scene enters from the right. */
export type SlideDirection = (typeof SLIDE_DIRECTIONS)[number];
export const DEFAULT_SLIDE_DIRECTION: SlideDirection = "left";

/** The boundary from a scene into the next one (design v2, section 3). */
export interface SceneTransition {
  type: TransitionType;
  /** Positive integer. Defaults to the theme's `motion.transitionMs`. Ignored by `cut`. */
  durationMs?: number;
  /** Defaults to "left", so a film slides one way throughout. */
  direction?: SlideDirection;
}

/** The target of a shot that pulls the camera back to the whole frame. */
export const WIDE_SHOT = "wide";

/** A box in frame px, as the scene lays out with the camera wide. */
export interface ShotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A camera move (design v3, life #1): from `atMs` the camera pushes in on
 * the `shot` token until `target` fills `fill` of the frame, and holds there
 * until the next shot. A "wide" shot pulls back to the whole frame.
 */
export interface SceneShot {
  /** When the move starts, in ms from the scene's start. */
  atMs: number;
  /** A `shareId` in the scene, a rect in frame px, or "wide". */
  target: string | ShotRect;
  /** Share of the frame the target fills, 0.6-0.85. Defaults to the theme's `motion.shot.fill`. */
  fill?: number;
  /** How long the move takes, in ms. Defaults to the theme's `motion.shot.ms`. */
  durationMs?: number;
}

export interface StoryboardScene {
  /** Unique within the storyboard. */
  id: string;
  /** Name of a kit component. */
  component: string;
  props: Record<string, unknown>;
  narration?: string;
  /**
   * Positive integer, or "clip" to take the length from the scene's VideoClip
   * (resolved by `prepareMedia`). Required when there is no narration.
   */
  durationMs?: number | "clip";
  /** Into the next scene. Defaults to the theme's transition; ignored on the last scene. */
  transition?: SceneTransition;
  /** Camera moves within the scene, in time order. Without any the camera stays wide. */
  shots?: SceneShot[];
}

/** A validated storyboard with defaults applied. */
export interface Storyboard {
  title: string;
  aspect: Aspect;
  fps: number;
  theme: string;
  /** Any theme tokens, deep-merged over the named theme (see `resolveTheme`). */
  themeOverrides?: ThemeOverrides;
  /** Shortcut for `themeOverrides.colors.accent`; a readable `accentText` is picked unless overridden. */
  accent?: string;
  /** Shortcut for `themeOverrides.accentIntensity`. */
  accentIntensity?: AccentIntensity;
  /** The 9:16 safe profile. Defaults to the theme's (`shorts` in every built-in theme). */
  safe?: SafeProfile;
  scenes: StoryboardScene[];
}

/** A storyboard as written, before defaults are applied. */
export type StoryboardInput = Omit<Storyboard, "fps" | "theme"> & {
  fps?: number;
  theme?: string;
};

export type StoryboardValidation =
  | { ok: true; storyboard: Storyboard }
  | { ok: false; errors: string[] };
