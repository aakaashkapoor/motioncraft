// The storyboard: the JSON document an agent writes before any scene is built.
// See docs/design.md, "The workflow", step 1.

export const ASPECTS = ["9:16", "16:9"] as const;
export type Aspect = (typeof ASPECTS)[number];

export const DEFAULT_FPS = 30;
export const DEFAULT_THEME = "neutral";

export interface StoryboardScene {
  /** Unique within the storyboard. */
  id: string;
  /** Name of a kit component. */
  component: string;
  props: Record<string, unknown>;
  narration?: string;
  /** Positive integer. Required when there is no narration. */
  durationMs?: number;
}

/** A validated storyboard with defaults applied. */
export interface Storyboard {
  title: string;
  aspect: Aspect;
  fps: number;
  theme: string;
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
