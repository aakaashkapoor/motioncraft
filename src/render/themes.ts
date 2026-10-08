// Themes a storyboard can name in its `theme` field.

import { neutralTheme } from "../theme/neutral";
import type { Theme } from "../theme/types";

export const themes: Record<string, Theme> = {
  neutral: neutralTheme,
};

export function resolveTheme(name: string): Theme {
  const theme = Object.hasOwn(themes, name) ? themes[name] : undefined;
  if (theme === undefined) {
    throw new Error(`unknown theme "${name}" (known: ${Object.keys(themes).join(", ")})`);
  }
  return theme;
}
