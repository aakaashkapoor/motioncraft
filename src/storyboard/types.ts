// The storyboard: the JSON document an agent writes before any scene is built.
// See docs/design.md, "The workflow", step 1.

import type { AccentIntensity, ThemeOverrides } from "../theme/types";

export const ASPECTS = ["9:16", "16:9"] as const;
export type Aspect = (typeof ASPECTS)[number];

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
