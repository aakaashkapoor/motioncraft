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
export { CAPTION_LINE_HEIGHT, CAPTION_MAX_LINES, captionBand, captionBandHeight, contentArea } from "./layout/caption";
export { AVG_CHAR_EM, charsPerLine, estimateLines, estimateTextHeight } from "./layout/textFit";
export type { TextStyle } from "./layout/textFit";

export { buildTimeline, frameAt } from "./engine/timeline";
export type { FrameInfo, SceneDurations, Timeline, TimelineScene } from "./engine/timeline";
export { Easing, easeInOutCubic, easeOutBack, easeSpring, expoIn, expoOut, linear } from "./engine/easing";
export type { SpringOptions } from "./engine/easing";
export { bezier } from "./engine/bezier";
export { interpolate, interpolateColors } from "./engine/interpolate";
export type { Extrapolate, InterpolateOptions } from "./engine/interpolate";
export { SPRING_SETTLE_THRESHOLD, measureSpring, spring, springPresets } from "./engine/spring";
export type { SpringConfig, SpringParams, SpringPreset } from "./engine/spring";
export { drawPath, stagger } from "./engine/choreography";
export type { DrawPathStyle, StaggerOptions } from "./engine/choreography";
export { noise2D, random } from "./engine/random";
export type { Seed } from "./engine/random";

export {
  Caption,
  TitleCard,
  asKitComponent,
  captionLimits,
  kit,
  pageAt,
  pageCaption,
  presence,
  themeEasing,
  titleCardStep,
} from "./kit";
export type { CaptionLimits, CaptionProps, KitComponent, KitProps, TitleCardProps } from "./kit";
export { BigNumber, bigNumberStep, countedValue, formatBigNumber, type BigNumberProps } from "./kit/BigNumber";
export { FlowDiagram, flowDiagramLayout, type FlowArrow, type FlowDiagramLayout, type FlowDiagramProps } from "./kit";
export { StepList, stepListLayout, stepListTiming, type StepListProps } from "./kit";
