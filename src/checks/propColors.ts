// Colours in scene props, shared by the storyboard checks that read them
// (theme-color, palette-area): which prop keys hold a colour, and every string
// in a scene's props with its path.

/** Prop keys that hold a color. */
export const COLOR_KEY = /(colou?r|background|fill|stroke|tint)$/i;
/** CSS color syntax other than hex, which can never match a hex token. */
export const CSS_COLOR_FUNCTION = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;

/** `#abc` → `#aabbcc`, lower case. */
export function normalizeHex(color: string): string {
  const hex = color.trim().toLowerCase().slice(1);
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex}`;
}

export interface PropString {
  /** Where it is, e.g. `messages[0].avatar.color`. */
  path: string;
  /** The innermost key, e.g. `color`. */
  key: string;
  value: string;
}

/** Every string in `props` with its path. */
export function propStrings(props: unknown): PropString[] {
  const found: PropString[] = [];
  const walk = (value: unknown, path: string, key: string): void => {
    if (typeof value === "string") found.push({ path, key, value });
    else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${path}[${i}]`, key));
    else if (typeof value === "object" && value !== null) {
      for (const [k, child] of Object.entries(value)) walk(child, path === "" ? k : `${path}.${k}`, k);
    }
  };
  walk(props, "", "");
  return found;
}
