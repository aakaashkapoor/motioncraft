// The storyboard: the JSON document an agent writes before any scene is built.
// See docs/design.md, "The workflow", step 1.

import type { Cue } from "../kit/cues";
import type { ColorRole } from "../theme/roles";
import type { Harmony } from "../theme/color";
import type { PalettePreset } from "../theme/palettes";
import { PALETTE_ROLES, type AccentIntensity, type PaletteRole, type ThemeOverrides } from "../theme/types";

export type { PalettePreset };

/**
 * A storyboard's palette: a curated preset by name (see `PALETTE_PRESETS`), or
 * swatches derived from one brand color with a harmony (see `derivePalette`).
 */
export type PaletteSpec = PalettePreset | { from: string; harmony: Harmony };

/** What a scene stands on: the theme's ground, or a palette swatch as a flat field. */
export const SCENE_GROUNDS = ["ground", ...PALETTE_ROLES] as const;
export type SceneGround = "ground" | PaletteRole;

export const ASPECTS = ["9:16", "16:9", "4:5"] as const;
export type Aspect = (typeof ASPECTS)[number];

/**
 * Which platform UI a 9:16 frame keeps its text clear of (design v3, section
 * C): `shorts` (YouTube Shorts, the default) or `crosspost` (the union of
 * TikTok, Reels and Shorts: smaller, but safe on all three) or `tiktok` (clear of
 * TikTok's UI only, so content fills more of the frame). 16:9 and 4:5 have no
 * overlaid UI, so every profile is the same there.
 */
export const SAFE_PROFILES = ["shorts", "crosspost", "tiktok"] as const;
export type SafeProfile = (typeof SAFE_PROFILES)[number];
export const DEFAULT_SAFE_PROFILE: SafeProfile = "shorts";

/**
 * How narration is captioned (design v3, life #4): `standard` pages of 3-6
 * words on a plate, `punch` 1-3 big uppercase words in a dark outline,
 * `pill` the same pages in sentence case with an accent pill sliding behind
 * the spoken word, or `off`. Either way the spoken word is marked in the accent.
 */
export const CAPTION_STYLES = ["standard", "punch", "pill", "off"] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];
export const DEFAULT_CAPTION_STYLE: CaptionStyle = "standard";

/**
 * How the video opens: `settled` (the default) shows the first scene's headline
 * and content as they look once landed at frame 0, so the thumbnail GitHub,
 * Slack and players show before play is never blank; `build` animates them in
 * from nothing.
 */
export const OPENINGS = ["settled", "build"] as const;
export type Opening = (typeof OPENINGS)[number];
export const DEFAULT_OPENING: Opening = "settled";

/** Whether scene `index` opens settled: only the first, and only unless the storyboard says `build`. */
export function opensSettled(storyboard: { opening?: Opening }, index: number): boolean {
  return index === 0 && (storyboard.opening ?? DEFAULT_OPENING) === "settled";
}

export const DEFAULT_FPS = 30;
export const DEFAULT_THEME = "light";

export const TRANSITION_TYPES = ["cut", "fade", "slide", "zoomBlur", "wipe", "iris", "whipPan"] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];

export const SLIDE_DIRECTIONS = ["left", "right", "up", "down"] as const;
/** Which way a `slide`, `wipe` or `whipPan` travels: "left" moves content leftward, so the next scene enters from the right. */
export type SlideDirection = (typeof SLIDE_DIRECTIONS)[number];
export const DEFAULT_SLIDE_DIRECTION: SlideDirection = "left";

/** Where an `iris` opens from, in 0..1 fractions of the frame's width and height. */
export interface TransitionOrigin {
  x: number;
  y: number;
}
export const DEFAULT_IRIS_ORIGIN: TransitionOrigin = { x: 0.5, y: 0.5 };

/** The boundary from a scene into the next one (design v2, section 3). */
export interface SceneTransition {
  type: TransitionType;
  /** Positive integer. Defaults to the theme's `motion.transitionMs`. Ignored by `cut`. */
  durationMs?: number;
  /** Defaults to "left", so a film slides one way throughout. */
  direction?: SlideDirection;
  /** `iris` only: where the circle opens from. Defaults to the center. */
  origin?: TransitionOrigin;
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

export const EFFECT_KINDS = ["ring", "highlight", "shake", "pulse"] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

/**
 * Attention on one element at a moment: a `ring` drawn around it or a
 * `highlight` band swept over it (both hold to the scene's exit), or a short
 * `shake` or `pulse` of the element itself.
 */
export interface SceneEffect {
  /** A `shareId` in the scene, as shots target elements. */
  target: string;
  kind: EffectKind;
  /** When it starts: ms from the scene start or a narration word. */
  at: Cue;
  /** Defaults to `accent`. */
  color?: ColorRole;
  /** `shake` and `pulse` only matter: how long they run, 100-2000 ms. Defaults to 360 (shake) and 320 (pulse). */
  durationMs?: number;
}

/**
 * A scene's own narration audio, used instead of the voice. Paths are relative
 * to the storyboard file. The scene's `narration` text is still required: the
 * captions and checks use it.
 */
export interface SceneAudio {
  /** A WAV file: 16-bit or 24-bit PCM or 32-bit float, mono or stereo, any sample rate. */
  file: string;
  /**
   * A JSON file of `[{ text, startMs, endMs }]`, in ms from the start of the
   * audio, one per narration word. Without it the words are timed evenly over
   * the audio, so captions are approximate.
   */
  words?: string;
}

export interface StoryboardScene {
  /** Unique within the storyboard. */
  id: string;
  /** Name of a kit component. */
  component: string;
  props: Record<string, unknown>;
  narration?: string;
  /** Narration from an audio file instead of the voice; its length sizes the scene as spoken narration does. */
  audio?: SceneAudio;
  /**
   * Positive integer, or "clip" to take the length from the scene's VideoClip
   * (resolved by `prepareMedia`). Required when there is no narration.
   */
  durationMs?: number | "clip";
  /** Into the next scene. Defaults to the theme's transition; ignored on the last scene. */
  transition?: SceneTransition;
  /** Camera moves within the scene, in time order. Without any the camera stays wide. */
  shots?: SceneShot[];
  /** Rings, highlights, shakes and pulses on the scene's elements, each at its cue. */
  effects?: SceneEffect[];
  /**
   * What the scene stands on. `"ground"` (the default) is the theme's ground; a
   * palette role (`"p2"`) fills the whole frame with that swatch, and every
   * component on it draws its text in the swatch's ink (`onP2`). The theme's
   * ground style still draws over the field. Needs a top-level `palette` that
   * has the role. Between two different grounds, a crossfade (fade, zoomBlur,
   * slide) becomes a hard cut at its midpoint.
   */
  ground?: SceneGround;
}

export const OVERLAY_CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type OverlayCorner = (typeof OVERLAY_CORNERS)[number];
export const DEFAULT_OVERLAY_CORNER: OverlayCorner = "top-left";
/** Most overlays a storyboard may have, and the most characters in one overlay's text. */
export const MAX_OVERLAYS = 3;
export const MAX_OVERLAY_TEXT = 28;

/**
 * A corner tag shown across chosen scenes (for example "EXAMPLE BILL" or
 * "Sponsored"), inside the safe area. It is drawn above everything and does
 * not move with the camera or a transition.
 */
export interface StoryboardOverlay {
  /** 1-28 characters; drawn uppercase. */
  text: string;
  /** Defaults to `top-left`. */
  corner?: OverlayCorner;
  /** Ids of the scenes it shows on. Defaults to every scene. */
  scenes?: string[];
}

/** Licenses a brand font may have: each allows commercial use and modification (AGENTS.md). */
export const BRAND_FONT_LICENSES = ["OFL-1.1", "Apache-2.0", "MIT", "CC0-1.0", "UFL-1.0"] as const;
export type BrandFontLicense = (typeof BRAND_FONT_LICENSES)[number];
/** Font files a storyboard can load, by extension. */
export const BRAND_FONT_EXTENSIONS = [".woff2", ".woff", ".ttf", ".otf"] as const;
/** A brand font's weight range when it gives none: one regular face. */
export const DEFAULT_BRAND_WEIGHTS: readonly [number, number] = [400, 400];

/**
 * A font file the storyboard brings, embedded in the render and named in
 * `themeOverrides.fonts` by `name`. One family can span several files (a
 * regular, a bold and an italic), each its own entry with the same name.
 */
export interface BrandFont {
  /** The family's name, as `themeOverrides.fonts` names it. */
  name: string;
  /** A .woff2, .woff, .ttf or .otf file, relative to the storyboard. */
  file: string;
  /** One of `BRAND_FONT_LICENSES`. */
  license: string;
  /** The weights the file covers, [min, max]; a variable font gives its range. Defaults to [400, 400]. */
  weights?: [number, number];
  /** Whether the file is the italic face. Defaults to false. */
  italic?: boolean;
}

/** A validated storyboard with defaults applied. */
export interface Storyboard {
  title: string;
  aspect: Aspect;
  fps: number;
  theme: string;
  /** Font files to embed, named by `themeOverrides.fonts`. */
  fonts?: BrandFont[];
  /** Any theme tokens, deep-merged over the named theme (see `resolveTheme`). */
  themeOverrides?: ThemeOverrides;
  /** Shortcut for `themeOverrides.colors.accent`; a readable `accentText` is picked unless overridden. */
  accent?: string;
  /** Shortcut for `themeOverrides.accentIntensity`. */
  accentIntensity?: AccentIntensity;
  /**
   * Curated preset or a palette derived from one brand color; see
   * `resolveTheme`. Its p1 becomes the accent; an `accent` set alongside it
   * becomes p1 instead, shifting the other swatches down.
   */
  palette?: PaletteSpec;
  /** The 9:16 safe profile. Defaults to the theme's (`shorts` in every built-in theme). */
  safe?: SafeProfile;
  /** How narration is captioned. Defaults to `standard`. */
  captionStyle?: CaptionStyle;
  /** How the first scene opens. Defaults to `settled`. */
  opening?: Opening;
  /** The narration voice (a Kokoro voice name). Defaults to "af_heart". */
  voice?: string;
  /** How fast the voice speaks, 0.8-1.4. Defaults to 1. */
  voiceSpeed?: number;
  /**
   * How written words are spoken: `{ "JSON": "Jaysawn" }` says "Jaysawn" where
   * the narration has `JSON`, while captions keep `JSON`. Keys have no
   * whitespace; values are one word of letters and apostrophes.
   */
  pronounce?: Record<string, string>;
  /** Corner tags across chosen scenes, at most 3. */
  overlays?: StoryboardOverlay[];
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
