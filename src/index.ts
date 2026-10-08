// motioncraft public entry point. Modules are added here as they land.
export const VERSION = "0.0.0";

export * from "./storyboard/types";
export { validateStoryboard } from "./storyboard/validate";

export type {
  Theme,
  ThemeColors,
  ThemeFonts,
  ThemeMotion,
  ThemeSpacing,
  ThemeTypeScale,
  TypeStep,
} from "./theme/types";
export { neutralTheme } from "./theme/neutral";
export { contrastRatio, relativeLuminance } from "./theme/contrast";

export { frameSize, safeArea } from "./layout/frame";
export type { Rect, Size } from "./layout/frame";
export { fontScale, fontSize } from "./layout/type";
