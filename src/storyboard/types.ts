// The storyboard: the JSON document an agent writes before any scene is built.
// See docs/design.md, "The workflow", step 1.

import type { AccentIntensity, ThemeOverrides } from "../theme/types";

export const ASPECTS = ["9:16", "16:9"] as const;
export type Aspect = (typeof ASPECTS)[number];

export const DEFAULT_FPS = 30;
export const DEFAULT_THEME = "light";

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
