import {
  ASPECTS,
  CAPTION_STYLES,
  DEFAULT_FPS,
  DEFAULT_THEME,
  OPENINGS,
  SAFE_PROFILES,
  SCENE_GROUNDS,
  SLIDE_DIRECTIONS,
  TRANSITION_TYPES,
  type Aspect,
  type BrandFont,
  type CaptionStyle,
  type Opening,
  type PaletteSpec,
  type SafeProfile,
  type SceneAudio,
  type SceneEffect,
  type SceneGround,
  type SceneShot,
  type StoryboardFrame,
  type StoryboardOverlay,
  type SceneTransition,
  type Storyboard,
  type StoryboardScene,
  type StoryboardValidation,
} from "./types";
import { overlaysErrors } from "../overlays/errors";
import { frameErrors, frameLabelError } from "../overlays/frameErrors";
import { brandFontsErrors, fontOverrideErrors } from "./brandFonts";
import { sceneComponents } from "./components";
import { effectsErrors } from "./effects";
import { shotsErrors } from "./shots";
import { accentIntensityError, colorError, paletteError, themeOverridesErrors } from "./themeOverrides";
import { cueErrors } from "../kit/cues";
import { headlineLinesErrors } from "../kit/headlineLines";
import { STOCK_VOICES } from "../narration/voices";
import { paletteSwatches } from "../theme/palettes";
import { resolveTheme } from "../theme/resolve";
import type { AccentIntensity, ThemeOverrides } from "../theme/types";

export const MIN_VOICE_SPEED = 0.8;
export const MAX_VOICE_SPEED = 1.4;

/** Whether `value` is a speed the voice can be run at. */
export function isVoiceSpeed(value: unknown): value is number {
  return typeof value === "number" && value >= MIN_VOICE_SPEED && value <= MAX_VOICE_SPEED;
}

const STORYBOARD_FIELDS = new Set(["title", "aspect", "fps", "theme", "fonts", "themeOverrides", "accent", "accentIntensity", "palette", "safe", "captionStyle", "opening", "voice", "voiceSpeed", "pronounce", "overlays", "frame", "scenes"]);
const SCENE_FIELDS = new Set(["id", "component", "props", "narration", "audio", "durationMs", "transition", "shots", "effects", "ground", "frameLabel"]);
const AUDIO_FIELDS = new Set(["file", "words"]);
const TRANSITION_FIELDS = new Set(["type", "durationMs", "direction", "origin"]);
const ORIGIN_FIELDS = new Set(["x", "y"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function describe(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

function unknownFields(obj: Record<string, unknown>, known: Set<string>): string[] {
  return Object.keys(obj)
    .filter((key) => !known.has(key))
    .map((key) => `unknown field "${key}"`);
}

/** `"a", "b" or "c"`. */
function oneOf(options: readonly string[]): string {
  const quoted = options.map((o) => `"${o}"`);
  return `${quoted.slice(0, -1).join(", ")} or ${quoted.at(-1)}`;
}

const isFraction = (value: unknown) => typeof value === "number" && value >= 0 && value <= 1;

/** An iris origin: exactly `x` and `y`, each 0..1. */
function isOrigin(value: unknown): boolean {
  return isObject(value) && unknownFields(value, ORIGIN_FIELDS).length === 0 && isFraction(value.x) && isFraction(value.y);
}

/** Problems with a scene's `transition`, unprefixed. */
function transitionErrors(raw: unknown): string[] {
  if (!isObject(raw)) return [`transition must be an object (got ${describe(raw)})`];
  const errors = unknownFields(raw, TRANSITION_FIELDS).map((e) => `transition: ${e}`);
  const { type, durationMs, direction, origin } = raw;
  if (!TRANSITION_TYPES.includes(type as never)) {
    errors.push(`transition.type must be ${oneOf(TRANSITION_TYPES)} (got ${describe(type)})`);
  }
  if (durationMs !== undefined && !isPositiveInteger(durationMs)) {
    errors.push(`transition.durationMs must be a positive integer (got ${describe(durationMs)})`);
  }
  if (direction !== undefined && !SLIDE_DIRECTIONS.includes(direction as never)) {
    errors.push(`transition.direction must be ${oneOf(SLIDE_DIRECTIONS)} (got ${describe(direction)})`);
  }
  if (origin !== undefined && type !== "iris") {
    errors.push(`transition.origin only applies to "iris" (got type ${describe(type)})`);
  } else if (origin !== undefined && !isOrigin(origin)) {
    errors.push(`transition.origin must be { "x", "y" } with each a number from 0 to 1 (got ${describe(origin)})`);
  }
  return errors;
}

/** A path relative to the storyboard: not absolute on any platform. */
function isRelativePath(path: string): boolean {
  return !/^([\\/]|[A-Za-z]:)/.test(path);
}

/** Problems with a scene's `audio`, unprefixed. Whether the files exist and parse is `checkSceneAudio`'s job. */
function audioErrors(raw: unknown, narration: unknown): string[] {
  if (!isObject(raw)) return [`audio must be an object { file, words? } (got ${describe(raw)})`];
  const errors = unknownFields(raw, AUDIO_FIELDS).map((e) => `audio: ${e}`);
  const path = (key: "file" | "words", ext: string, what: string): void => {
    const value = raw[key];
    if (!isNonEmptyString(value) || !value.toLowerCase().endsWith(ext)) errors.push(`audio.${key} must be a ${ext} file${what} (got ${describe(value)})`);
    else if (!isRelativePath(value)) errors.push(`audio.${key} must be a path relative to the storyboard (got ${describe(value)})`);
  };
  path("file", ".wav", "; MP3 and AAC are not supported");
  if (raw.words !== undefined) path("words", ".json", " of [{ text, startMs, endMs }]");
  if (narration === undefined) errors.push("narration is required with audio: captions and checks use its text");
  return errors;
}

/** Components that take `lines`, and the prop holding the single text the lines replace. */
const LINES_TEXT_KEY: Record<string, "text" | "title"> = { Headline: "text", TitleCard: "title" };

/** Problems with `lines` on every Headline and TitleCard in the scene, nested ones too, checked against its narration. */
function linesErrors(scene: { component: unknown; props: Record<string, unknown> }, narration: string | undefined): string[] {
  return sceneComponents(scene).flatMap(({ component, props }) => {
    const textKey = LINES_TEXT_KEY[component];
    return textKey === undefined ? [] : headlineLinesErrors(props, textKey, narration).map((e) => `${component}: ${e}`);
  });
}

/** Validates a scene, pushing errors prefixed with `label`. Returns the scene if valid. */
function validateScene(raw: Record<string, unknown>, label: string, errors: string[]): StoryboardScene | undefined {
  const sceneErrors: string[] = unknownFields(raw, SCENE_FIELDS);
  const { component, props, narration, audio, durationMs, transition, shots, effects, ground, frameLabel } = raw;

  if (!isNonEmptyString(component)) sceneErrors.push("component is required and must be a non-empty string");
  if (!isObject(props)) sceneErrors.push("props is required and must be an object");
  else sceneErrors.push(...linesErrors({ component, props }, isNonEmptyString(narration) ? narration : undefined));
  if (narration !== undefined && !isNonEmptyString(narration)) {
    sceneErrors.push("narration must be a non-empty string when present");
  }
  if (audio !== undefined) sceneErrors.push(...audioErrors(audio, narration));
  if (durationMs === undefined) {
    if (narration === undefined) sceneErrors.push("durationMs is required when there is no narration");
  } else if (durationMs === "clip") {
    if (isObject(props) && !sceneComponents({ component, props }).some((use) => use.component === "VideoClip")) {
      sceneErrors.push('durationMs "clip" takes the length from a VideoClip, and this scene has none');
    }
  } else if (!isPositiveInteger(durationMs)) {
    sceneErrors.push(`durationMs must be a positive integer (got ${describe(durationMs)})`);
  }
  if (transition !== undefined) sceneErrors.push(...transitionErrors(transition));
  if (shots !== undefined && isObject(props)) sceneErrors.push(...shotsErrors(shots, { component, props, durationMs }));
  if (effects !== undefined && isObject(props)) sceneErrors.push(...effectsErrors(effects, { component, props, narration, durationMs }));
  if (ground !== undefined && !SCENE_GROUNDS.includes(ground as never)) sceneErrors.push(`ground must be ${oneOf(SCENE_GROUNDS)} (got ${describe(ground)})`);
  const frameLabelProblem = frameLabel === undefined ? undefined : frameLabelError(frameLabel);
  if (frameLabelProblem !== undefined) sceneErrors.push(frameLabelProblem);

  errors.push(...sceneErrors.map((e) => `${label}: ${e}`));
  if (sceneErrors.length > 0) return undefined;

  const scene: StoryboardScene = { id: raw.id as string, component: component as string, props: props as Record<string, unknown> };
  if (narration !== undefined) scene.narration = narration as string;
  if (audio !== undefined) scene.audio = audio as SceneAudio;
  if (durationMs !== undefined) scene.durationMs = durationMs as number | "clip";
  if (transition !== undefined) scene.transition = transition as SceneTransition;
  if (shots !== undefined) scene.shots = shots as SceneShot[];
  if (effects !== undefined) scene.effects = effects as SceneEffect[];
  if (ground !== undefined) scene.ground = ground as SceneGround;
  if (frameLabel !== undefined) scene.frameLabel = frameLabel as string;
  return scene;
}

function validateScenes(raw: unknown, errors: string[]): StoryboardScene[] {
  if (!Array.isArray(raw)) {
    errors.push("scenes is required and must be an array");
    return [];
  }
  if (raw.length === 0) {
    errors.push("scenes must contain at least one scene");
    return [];
  }

  const scenes: StoryboardScene[] = [];
  const firstIndexById = new Map<string, number>();
  raw.forEach((item: unknown, i) => {
    if (!isObject(item)) {
      errors.push(`scenes[${i}]: must be an object`);
      return;
    }
    const { id } = item;
    if (!isNonEmptyString(id)) {
      errors.push(`scenes[${i}]: id is required and must be a non-empty string`);
      // Still check the rest of the scene so all problems are reported together.
      validateScene({ ...item, id: "" }, `scenes[${i}]`, errors);
      return;
    }
    const label = `scenes[${i}] (${JSON.stringify(id)})`;
    const firstIndex = firstIndexById.get(id);
    if (firstIndex !== undefined) {
      errors.push(`${label}: id "${id}" is already used by scenes[${firstIndex}]`);
    } else {
      firstIndexById.set(id, i);
    }
    const scene = validateScene(item, label, errors);
    if (scene) scenes.push(scene);
  });
  return scenes;
}

/**
 * Problems with a cue prop (see `Cue`) at `at` (a path such as
 * `props.at`), checked against the scene's `narration`: for a component's
 * prop check to call on each cue it takes.
 */
export function validateCue(cue: unknown, narration: string | undefined, at: string): string[] {
  return cueErrors(cue, narration).map((error) => `${at}: ${error}`);
}

/** Problems with the storyboard's `pronounce` map: one written word to one to four spoken words. */
function pronounceErrors(raw: unknown): string[] {
  if (!isObject(raw)) return [`pronounce must be an object mapping a written word to how it is spoken (got ${describe(raw)})`];
  const errors: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const at = `pronounce[${JSON.stringify(key)}]`;
    if (key === "" || /\s/.test(key)) errors.push(`${at}: the written word must be non-empty with no whitespace`);
    if (typeof value !== "string" || !/^[A-Za-z']+( [A-Za-z']+){0,3}$/.test(value)) {
      errors.push(`${at} must be 1 to 4 words of letters and apostrophes, separated by single spaces (got ${describe(value)})`);
    }
  }
  return errors;
}

/**
 * The palette roles a storyboard's theme fields resolve to (an `accent` set
 * beside the palette can add a swatch), or the error resolving them threw.
 */
function paletteRoles(input: Record<string, unknown>): { roles: string[] } | { error: string } {
  try {
    const palette = resolveTheme(input as unknown as Parameters<typeof resolveTheme>[0]).colors.palette;
    return { roles: palette === undefined ? [] : paletteSwatches(palette).map((s) => s.role) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Problems with the scenes' palette grounds: each needs a top-level `palette`
 * that has the role. Only scenes whose `ground` is itself valid are checked,
 * and the roles only when the theme fields validated (`themeValid`): otherwise
 * their own errors already say what is wrong.
 */
function sceneGroundErrors(input: Record<string, unknown>, themeValid: boolean): string[] {
  if (!Array.isArray(input.scenes)) return [];
  const used = input.scenes.flatMap((scene: unknown, i) =>
    isObject(scene) && typeof scene.ground === "string" && scene.ground !== "ground" && SCENE_GROUNDS.includes(scene.ground as never)
      ? [{ label: isNonEmptyString(scene.id) ? `scenes[${i}] (${JSON.stringify(scene.id)})` : `scenes[${i}]`, ground: scene.ground }]
      : [],
  );
  if (used.length === 0) return [];
  if (input.palette === undefined) return used.map(({ label, ground }) => `${label}: ground "${ground}" needs a top-level "palette"`);
  if (!themeValid) return [];
  const resolved = paletteRoles({ ...input, theme: input.theme ?? DEFAULT_THEME });
  if ("error" in resolved) return [`palette: the theme does not resolve, so scene grounds cannot be checked: ${resolved.error}`];
  const { roles } = resolved;
  return used.filter(({ ground }) => !roles.includes(ground)).map(({ label, ground }) => `${label}: ground "${ground}" is not in the palette (it has ${roles.join(", ")})`);
}

/**
 * Validates a storyboard document and applies defaults (`fps` 30, `theme` "light").
 * Collects every problem rather than stopping at the first.
 */
export function validateStoryboard(input: unknown): StoryboardValidation {
  if (!isObject(input)) return { ok: false, errors: ["storyboard must be an object"] };

  const errors: string[] = unknownFields(input, STORYBOARD_FIELDS);
  const { title, aspect, fps = DEFAULT_FPS, theme = DEFAULT_THEME } = input;

  if (!isNonEmptyString(title)) errors.push("title is required and must be a non-empty string");
  if (!ASPECTS.includes(aspect as Aspect)) {
    errors.push(`aspect must be ${oneOf(ASPECTS)} (got ${describe(aspect)})`);
  }
  if (!isPositiveInteger(fps)) errors.push(`fps must be a positive integer (got ${describe(fps)})`);
  if (!isNonEmptyString(theme)) errors.push("theme must be a non-empty string");
  const themeErrorsFrom = errors.length;
  const { fonts, themeOverrides, accent, accentIntensity } = input;
  if (fonts !== undefined) errors.push(...brandFontsErrors(fonts));
  if (themeOverrides !== undefined) {
    const overrideErrors = themeOverridesErrors(themeOverrides);
    errors.push(...overrideErrors);
    if (overrideErrors.length === 0) {
      const brandNames = Array.isArray(fonts) ? fonts.flatMap((f: unknown) => (isObject(f) && isNonEmptyString(f.name) ? [f.name] : [])) : [];
      errors.push(...fontOverrideErrors(themeOverrides, brandNames));
    }
  }
  const accentProblem = accent === undefined ? undefined : colorError("accent", accent);
  if (accentProblem !== undefined) errors.push(accentProblem);
  const intensityProblem = accentIntensity === undefined ? undefined : accentIntensityError("accentIntensity", accentIntensity);
  if (intensityProblem !== undefined) errors.push(intensityProblem);
  const { palette } = input;
  const paletteProblem = palette === undefined ? undefined : paletteError("palette", palette);
  if (paletteProblem !== undefined) errors.push(paletteProblem);
  // Whether the theme fields resolve, so scene grounds can be checked against the palette.
  const themeValid = errors.length === themeErrorsFrom && isNonEmptyString(theme);
  const { safe } = input;
  if (safe !== undefined && !SAFE_PROFILES.includes(safe as SafeProfile)) {
    errors.push(`safe must be ${oneOf(SAFE_PROFILES)} (got ${describe(safe)})`);
  }
  const { captionStyle } = input;
  if (captionStyle !== undefined && !CAPTION_STYLES.includes(captionStyle as CaptionStyle)) {
    errors.push(`captionStyle must be ${oneOf(CAPTION_STYLES)} (got ${describe(captionStyle)})`);
  }
  const { opening } = input;
  if (opening !== undefined && !OPENINGS.includes(opening as Opening)) {
    errors.push(`opening must be ${oneOf(OPENINGS)} (got ${describe(opening)})`);
  }

  const { voice } = input;
  if (voice !== undefined) {
    if (!isNonEmptyString(voice)) errors.push(`voice must be a non-empty string (got ${describe(voice)})`);
    else if (!(STOCK_VOICES as readonly string[]).includes(voice)) errors.push(`voice must be one of ${STOCK_VOICES.join(", ")} (got ${describe(voice)})`);
  }

  const { voiceSpeed } = input;
  if (voiceSpeed !== undefined && !isVoiceSpeed(voiceSpeed)) {
    errors.push(`voiceSpeed must be a number from ${MIN_VOICE_SPEED} to ${MAX_VOICE_SPEED} (got ${describe(voiceSpeed)})`);
  }

  const { pronounce } = input;
  if (pronounce !== undefined) errors.push(...pronounceErrors(pronounce));

  const scenes = validateScenes(input.scenes, errors);
  errors.push(...sceneGroundErrors(input, themeValid));
  const { overlays } = input;
  if (overlays !== undefined) {
    const ids = Array.isArray(input.scenes) ? input.scenes.map((scene: unknown) => (isObject(scene) ? scene.id : undefined)).filter((id): id is string => typeof id === "string") : [];
    errors.push(...overlaysErrors(overlays, ids));
  }
  const { frame } = input;
  if (frame !== undefined) errors.push(...frameErrors(frame, overlays));

  if (errors.length > 0) return { ok: false, errors };
  const storyboard: Storyboard = { title: title as string, aspect: aspect as Aspect, fps: fps as number, theme: theme as string, scenes };
  if (fonts !== undefined) storyboard.fonts = fonts as BrandFont[];
  if (themeOverrides !== undefined) storyboard.themeOverrides = themeOverrides as ThemeOverrides;
  if (accent !== undefined) storyboard.accent = accent as string;
  if (accentIntensity !== undefined) storyboard.accentIntensity = accentIntensity as AccentIntensity;
  if (palette !== undefined) storyboard.palette = palette as PaletteSpec;
  if (safe !== undefined) storyboard.safe = safe as SafeProfile;
  if (captionStyle !== undefined) storyboard.captionStyle = captionStyle as CaptionStyle;
  if (opening !== undefined) storyboard.opening = opening as Opening;
  if (voice !== undefined) storyboard.voice = voice as string;
  if (voiceSpeed !== undefined) storyboard.voiceSpeed = voiceSpeed as number;
  if (pronounce !== undefined) storyboard.pronounce = pronounce as Record<string, string>;
  if (overlays !== undefined) storyboard.overlays = overlays as StoryboardOverlay[];
  if (frame !== undefined) storyboard.frame = frame as StoryboardFrame;
  return { ok: true, storyboard };
}
