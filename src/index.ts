// motioncraft public entry point. Modules are added here as they land.
export const VERSION = "0.0.0";

export * from "./storyboard/types";
export { validateStoryboard } from "./storyboard/validate";

export type {
  AccentIntensity,
  ColorRole,
  GroundStyle,
  Theme,
  ThemeColors,
  ThemeFonts,
  ThemeGround,
  ThemeMotion,
  ThemeOverrides,
  ThemeRadius,
  ThemeShadow,
  ThemeSpacing,
  ThemeTypeScale,
  TypeRamp,
  TypeRole,
  TypeSpec,
  TypeStep,
} from "./theme/types";
export { ACCENT_INTENSITIES, GROUND_STYLES, SPRING_PRESETS, TYPE_ROLES } from "./theme/types";
export { neutralTheme } from "./theme/neutral";
export { lightTheme } from "./theme/light";
export { darkTheme } from "./theme/dark";
export { deepMerge, resolveTheme, themes } from "./theme/resolve";
export { cardColors, headlineColor, type CardColors } from "./theme/roles";
export { mixColors, withAlpha } from "./theme/color";
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
export { ICON_NAMES, Icon, isIconName, type IconName, type IconProps } from "./icons";
export { cancelRender, continueRender, delayRender, RenderNotReadyError, READY_TIMEOUT_MS } from "./render/ready";
export { Ground, groundStyle, type GroundProps } from "./kit";
export { AppWindow, BrowserWindow, slotTransform, windowLayout, type AppWindowProps, type BrowserWindowProps, type SlotContent } from "./kit";
// motioncraft public entry point. Modules are added here as they land.
export const VERSION = "0.0.0";

export * from "./storyboard/types";
export { validateStoryboard } from "./storyboard/validate";

export type {
  AccentIntensity,
  ColorRole,
  GroundStyle,
  Theme,
  ThemeColors,
  ThemeFonts,
  ThemeGround,
  ThemeMotion,
  ThemeOverrides,
  ThemeRadius,
  ThemeShadow,
  ThemeSpacing,
  ThemeTypeScale,
  TypeRamp,
  TypeRole,
  TypeSpec,
  TypeStep,
} from "./theme/types";
export { ACCENT_INTENSITIES, GROUND_STYLES, SPRING_PRESETS, TYPE_ROLES } from "./theme/types";
export { neutralTheme } from "./theme/neutral";
export { lightTheme } from "./theme/light";
export { darkTheme } from "./theme/dark";
export { deepMerge, resolveTheme, themes } from "./theme/resolve";
export { cardColors, headlineColor, type CardColors } from "./theme/roles";
export { mixColors, withAlpha } from "./theme/color";
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
export { ICON_NAMES, Icon, isIconName, type IconName, type IconProps } from "./icons";
export { cancelRender, continueRender, delayRender, RenderNotReadyError, READY_TIMEOUT_MS } from "./render/ready";
export { Ground, groundStyle, type GroundProps } from "./kit";
export * from "./kit/windows";
export { ChatWindow, chatTiming, chatWindowLayout, type ChatAvatar, type ChatMessage, type ChatReaction, type ChatSidebar, type ChatTiming, type ChatWindowLayout, type ChatWindowProps } from "./kit/ChatWindow";
export { AnchorProvider, Arrow, anchorPoint, arrowGeometry, arrowTiming, resolveArrowEnds, type AnchorBoxes, type ArrowEnd, type ArrowProps } from "./kit/Arrow";
