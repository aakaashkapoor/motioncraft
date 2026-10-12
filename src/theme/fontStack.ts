// CSS font stacks in `themeOverrides.fonts`: which families a stack names, which
// of them are fonts the render actually has, and the stack the theme uses. A
// stack may name a bundled font (by its name or private family), a brand font
// the storyboard declares, a CSS generic family, or one of the system fonts the
// built-in stacks fall back to.

import { brandFamily, BUNDLED_FONTS, MONO_FAMILY, SANS_FAMILY } from "../render/fontFaces";
import { SYSTEM_MONO, SYSTEM_SANS } from "./base";

/** CSS generic font families. */
export const GENERIC_FAMILIES = ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong"] as const;

/** One family in a stack: as written, and its name without quotes. */
interface StackEntry {
  raw: string;
  name: string;
}

/** The families in a CSS font stack, in order. */
export function fontStackEntries(stack: string): StackEntry[] {
  return stack
    .split(",")
    .map((raw) => raw.trim())
    .filter((raw) => raw !== "")
    .map((raw) => ({ raw, name: raw.replace(/^(["'])(.*)\1$/, "$2").trim() }));
}

const key = (name: string) => name.toLowerCase();

const GENERIC = new Set<string>(GENERIC_FAMILIES);
/** The system fonts the built-in stacks fall back to: allowed as fallbacks, never guaranteed. */
const SYSTEM_FALLBACKS = new Set([...fontStackEntries(SYSTEM_SANS), ...fontStackEntries(SYSTEM_MONO)].map((e) => key(e.name)));
/** Bundled fonts by name and by private family, to their private family. */
const BUNDLED = new Map(BUNDLED_FONTS.flatMap(({ family, name }) => [[key(name), family], [key(family), family]] as const));

type Kind = "brand" | "bundled" | "generic" | "fallback";

/** What `name` is, given the storyboard's brand font names; undefined if the render has no such font. */
function kindOf(name: string, brandNames: readonly string[]): Kind | undefined {
  const k = key(name);
  if (brandNames.some((brand) => key(brand) === k || brandFamily(brand) === k)) return "brand";
  if (BUNDLED.has(k)) return "bundled";
  if (GENERIC.has(k)) return "generic";
  if (SYSTEM_FALLBACKS.has(k)) return "fallback";
  return undefined;
}

/** Names in `stack` that are neither bundled, declared in `brandNames`, generic nor a system fallback. */
export function unknownFontNames(stack: string, brandNames: readonly string[]): string[] {
  return fontStackEntries(stack)
    .filter(({ name }) => kindOf(name, brandNames) === undefined)
    .map(({ name }) => name);
}

/**
 * The stack the theme uses for an override: brand and bundled names become
 * their private families; a brand font is followed by the bundled sans (or
 * mono) unless the stack already has a bundled font; and a stack without a
 * generic family ends with the system stack.
 */
export function resolveFontStack(stack: string, brandNames: readonly string[], mono = false): string {
  const entries = fontStackEntries(stack).map(({ raw, name }) => {
    const kind = kindOf(name, brandNames);
    if (kind === "brand") return { kind, css: `"${brandFamily(brandNames.find((b) => key(b) === key(name) || brandFamily(b) === key(name))!)}"` };
    if (kind === "bundled") return { kind, css: BUNDLED.get(key(name))! };
    return { kind, css: raw };
  });
  const lastBrand = entries.map((e) => e.kind).lastIndexOf("brand");
  if (lastBrand >= 0 && !entries.some((e) => e.kind === "bundled")) entries.splice(lastBrand + 1, 0, { kind: "bundled", css: mono ? MONO_FAMILY : SANS_FAMILY });
  const css = entries.map((e) => e.css);
  if (!entries.some((e) => e.kind === "generic")) css.push(mono ? SYSTEM_MONO : SYSTEM_SANS);
  return css.join(", ");
}
