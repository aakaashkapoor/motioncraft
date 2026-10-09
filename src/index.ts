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
  BeatToken,
  BreatheToken,
  DriftToken,
  GridBreatheToken,
  MeshSpec,
  CubicBezier,
  CurveName,
  ExitToken,
  FlowToken,
  MarkToken,
  MotionCurve,
  MotionToken,
  SpringCurve,
  StaggeredToken,
  TextInToken,
  ThemeOverrides,
  ThemeRadius,
  ThemeShadow,
  ThemeSpacing,
  ThemeWeights,
  TypeRamp,
  TypeRole,
  TypeSpec,
} from "./theme/types";
export { ACCENT_INTENSITIES, CURVE_NAMES, GROUND_STYLES, TYPE_ROLES } from "./theme/types";
export { neutralTheme } from "./theme/neutral";
export { lightTheme } from "./theme/light";
export { darkTheme } from "./theme/dark";
export { deepMerge, resolveTheme, themes } from "./theme/resolve";
export { accentInk, cardColors, headlineColor, type CardColors } from "./theme/roles";
export { mixColors, withAlpha } from "./theme/color";
export { contrastRatio, relativeLuminance } from "./theme/contrast";
export { groundTint, MESH_STOPS, meshFalloff, meshLayout, type MeshRest } from "./theme/mesh";

export { frameSize } from "./layout/frame";
export { clearOfKeepOuts, safeArea, safeZones, type SafeZones } from "./layout/safe";
export { blockCenterY, placeBlock } from "./layout/block";
export type { Rect, Size } from "./layout/frame";
export { fontSize, rampSizes, rampSteps, TYPE_FIT_ATTRIBUTE, typeCss, typeSpec, type TypeCss } from "./layout/type";
export { CAPTION_MAX_LINES, captionBand, captionBandHeight, contentArea, textColumn } from "./layout/caption";
export { AVG_CHAR_EM, charsPerLine, estimateLines, estimateTextHeight } from "./layout/textFit";
export type { TextStyle } from "./layout/textFit";

export { DEFAULT_TRANSITION_MS, buildTimeline, frameAt, scenesOnScreen, soloFrames } from "./engine/timeline";
export type { ActiveScene, FrameInfo, SceneDurations, SceneTransitionState, Timeline, TimelineScene, TimelineTransition, TransitionDefaults } from "./engine/timeline";
export * from "./transitions";
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
export { FlowDiagram, flowDiagramLayout, flowDiagramTiming, type FlowArrow, type FlowDiagramLayout, type FlowDiagramProps, type FlowDiagramTiming } from "./kit";
export { StepList, stepListLayout, stepListTiming, type StepListProps } from "./kit";
export { ICON_NAMES, Icon, isIconName, type IconName, type IconProps } from "./icons";
export { cancelRender, continueRender, delayRender, RenderNotReadyError, READY_TIMEOUT_MS } from "./render/ready";
export { Ground, groundStyle, type GroundProps } from "./kit";
export { grainSeed, gridBreath, meshBlobs, type MeshBlob } from "./kit";
export { Section, sectionLayout, sectionTiming, type SectionContent, type SectionLayout, type SectionProps } from "./kit/Section";
export * from "./kit/windows";
export { ChatWindow, chatTiming, chatWindowLayout, type ChatAvatar, type ChatMessage, type ChatReaction, type ChatSidebar, type ChatTiming, type ChatWindowLayout, type ChatWindowProps } from "./kit/ChatWindow";
export { AnchorProvider, Arrow, anchorPoint, arrowGeometry, arrowTiming, pointAlong, resolveArrowEnds, type AnchorBoxes, type ArrowEnd, type ArrowProps, type Point } from "./kit/Arrow";
export { FlowDotMark, flowDot, flowGlow, type FlowDot } from "./kit/flow";
export { Card, CardFace, cardHeight, cardMetrics, type CardData, type CardProps } from "./kit/Card";
export { CardRow, cardRowLayout, cardRowTiming, type CardRowLayout, type CardRowProps } from "./kit/CardRow";
export { FeatureList, featureListTiming, type FeatureItem, type FeatureListProps } from "./kit/FeatureList";
export * from "./kit/media";
export { Pinned, pinnedLayout, type PinnedCorner, type PinnedLayout, type PinnedProps } from "./kit/Pinned";
export { Handoff, handoffLayout, type HandoffLayout, type HandoffProps } from "./kit/Handoff";
export { MotionDelay, NOMINAL_SCENE_MS, SceneClockContext, useSceneMs, useSceneTime, type SceneClock, type SceneTime } from "./kit/frameContext";
export { arrive, cascadeStep, curveEasing, exitMs, exitOpacity, fade, fitSequence, tween, type Timed } from "./kit/motion";
