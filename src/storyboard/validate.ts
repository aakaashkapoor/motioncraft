import {
  ASPECTS,
  CAPTION_STYLES,
  DEFAULT_FPS,
  DEFAULT_THEME,
  SAFE_PROFILES,
  SLIDE_DIRECTIONS,
  TRANSITION_TYPES,
  type Aspect,
  type CaptionStyle,
  type SafeProfile,
  type SceneShot,
  type SceneTransition,
  type Storyboard,
  type StoryboardScene,
  type StoryboardValidation,
} from "./types";
import { sceneComponents } from "./components";
import { shotsErrors } from "./shots";
import { accentIntensityError, colorError, themeOverridesErrors } from "./themeOverrides";
import type { AccentIntensity, ThemeOverrides } from "../theme/types";

const STORYBOARD_FIELDS = new Set(["title", "aspect", "fps", "theme", "themeOverrides", "accent", "accentIntensity", "safe", "captionStyle", "scenes"]);
const SCENE_FIELDS = new Set(["id", "component", "props", "narration", "durationMs", "transition", "shots"]);
const TRANSITION_FIELDS = new Set(["type", "durationMs", "direction"]);

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

/** Problems with a scene's `transition`, unprefixed. */
function transitionErrors(raw: unknown): string[] {
  if (!isObject(raw)) return [`transition must be an object (got ${describe(raw)})`];
  const errors = unknownFields(raw, TRANSITION_FIELDS).map((e) => `transition: ${e}`);
  const { type, durationMs, direction } = raw;
  if (!TRANSITION_TYPES.includes(type as never)) {
    errors.push(`transition.type must be ${oneOf(TRANSITION_TYPES)} (got ${describe(type)})`);
  }
  if (durationMs !== undefined && !isPositiveInteger(durationMs)) {
    errors.push(`transition.durationMs must be a positive integer (got ${describe(durationMs)})`);
  }
  if (direction !== undefined && !SLIDE_DIRECTIONS.includes(direction as never)) {
    errors.push(`transition.direction must be ${oneOf(SLIDE_DIRECTIONS)} (got ${describe(direction)})`);
  }
  return errors;
}

/** Validates a scene, pushing errors prefixed with `label`. Returns the scene if valid. */
function validateScene(raw: Record<string, unknown>, label: string, errors: string[]): StoryboardScene | undefined {
  const sceneErrors: string[] = unknownFields(raw, SCENE_FIELDS);
  const { component, props, narration, durationMs, transition, shots } = raw;

  if (!isNonEmptyString(component)) sceneErrors.push("component is required and must be a non-empty string");
  if (!isObject(props)) sceneErrors.push("props is required and must be an object");
  if (narration !== undefined && !isNonEmptyString(narration)) {
    sceneErrors.push("narration must be a non-empty string when present");
  }
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

  errors.push(...sceneErrors.map((e) => `${label}: ${e}`));
  if (sceneErrors.length > 0) return undefined;

  const scene: StoryboardScene = { id: raw.id as string, component: component as string, props: props as Record<string, unknown> };
  if (narration !== undefined) scene.narration = narration as string;
  if (durationMs !== undefined) scene.durationMs = durationMs as number | "clip";
  if (transition !== undefined) scene.transition = transition as SceneTransition;
  if (shots !== undefined) scene.shots = shots as SceneShot[];
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
 * Validates a storyboard document and applies defaults (`fps` 30, `theme` "light").
 * Collects every problem rather than stopping at the first.
 */
export function validateStoryboard(input: unknown): StoryboardValidation {
  if (!isObject(input)) return { ok: false, errors: ["storyboard must be an object"] };

  const errors: string[] = unknownFields(input, STORYBOARD_FIELDS);
  const { title, aspect, fps = DEFAULT_FPS, theme = DEFAULT_THEME } = input;

  if (!isNonEmptyString(title)) errors.push("title is required and must be a non-empty string");
  if (!ASPECTS.includes(aspect as Aspect)) {
    errors.push(`aspect must be ${ASPECTS.map((a) => `"${a}"`).join(" or ")} (got ${describe(aspect)})`);
  }
  if (!isPositiveInteger(fps)) errors.push(`fps must be a positive integer (got ${describe(fps)})`);
  if (!isNonEmptyString(theme)) errors.push("theme must be a non-empty string");
  const { themeOverrides, accent, accentIntensity } = input;
  if (themeOverrides !== undefined) errors.push(...themeOverridesErrors(themeOverrides));
  const accentProblem = accent === undefined ? undefined : colorError("accent", accent);
  if (accentProblem !== undefined) errors.push(accentProblem);
  const intensityProblem = accentIntensity === undefined ? undefined : accentIntensityError("accentIntensity", accentIntensity);
  if (intensityProblem !== undefined) errors.push(intensityProblem);
  const { safe } = input;
  if (safe !== undefined && !SAFE_PROFILES.includes(safe as SafeProfile)) {
    errors.push(`safe must be ${oneOf(SAFE_PROFILES)} (got ${describe(safe)})`);
  }
  const { captionStyle } = input;
  if (captionStyle !== undefined && !CAPTION_STYLES.includes(captionStyle as CaptionStyle)) {
    errors.push(`captionStyle must be ${oneOf(CAPTION_STYLES)} (got ${describe(captionStyle)})`);
  }

  const scenes = validateScenes(input.scenes, errors);

  if (errors.length > 0) return { ok: false, errors };
  const storyboard: Storyboard = { title: title as string, aspect: aspect as Aspect, fps: fps as number, theme: theme as string, scenes };
  if (themeOverrides !== undefined) storyboard.themeOverrides = themeOverrides as ThemeOverrides;
  if (accent !== undefined) storyboard.accent = accent as string;
  if (accentIntensity !== undefined) storyboard.accentIntensity = accentIntensity as AccentIntensity;
  if (safe !== undefined) storyboard.safe = safe as SafeProfile;
  if (captionStyle !== undefined) storyboard.captionStyle = captionStyle as CaptionStyle;
  return { ok: true, storyboard };
}
