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
  CountToken,
  CaptionHighlight,
  CaptionMotionToken,
  DriftToken,
  GridBreatheToken,
  LiftToken,
  LiftOutToken,
  MeshSpec,
  CubicBezier,
  CursorToken,
  CurveName,
  ExitToken,
  FlowToken,
  MarkToken,
  MotionCurve,
  MotionToken,
  PopToken,
  ShineToken,
  ShotToken,
  SpringCurve,
  StaggeredToken,
  TextInToken,
  ThemeCaption,
  ThemeOverrides,
  ThemeRadius,
  ThemeShadow,
  ThemeSpacing,
  ThemeWeights,
  TypeRamp,
  TypeRole,
  TypeSpec,
  TypingToken,
} from "./theme/types";
export { ACCENT_INTENSITIES, CAPTION_HIGHLIGHTS, CURVE_NAMES, GROUND_STYLES, TYPE_ROLES } from "./theme/types";
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
export { CAPTION_MAX_LINES, CAPTION_PAGE_WORDS, captionBand, captionBandHeight, captionType, contentArea, textColumn, type ShownCaptionStyle } from "./layout/caption";
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
  pageRanges,
  presence,
  themeEasing,
  titleCardStep,
} from "./kit";
export type { CaptionLimits, CaptionProps, KitComponent, KitProps, PageRange, TitleCardProps } from "./kit";
export { BigNumber, bigNumberStep, bigNumberTiming, formatBigNumber, odometerColumns, odometerText, type BigNumberProps, type BigNumberTiming, type OdometerColumn } from "./kit/BigNumber";
export { captionColors, captionTrack, type CaptionColors } from "./kit/Caption";
export { activeWordAt, evenWordTimes, pageIndexAt, timedPages, wordLight, type TimedPage, type TimedWord } from "./kit/captionWords";
export { FlowDiagram, flowDiagramLayout, flowDiagramTiming, type FlowArrow, type FlowDiagramLayout, type FlowDiagramProps, type FlowDiagramTiming } from "./kit";
export { StepList, stepListLayout, stepListTiming, type StepListProps } from "./kit";
export { ICON_NAMES, Icon, isIconName, type IconName, type IconProps } from "./icons";
export { cancelRender, continueRender, delayRender, RenderNotReadyError, READY_TIMEOUT_MS } from "./render/ready";
export { Ground, groundStyle, type GroundProps } from "./kit";
export { grainSeed, gridBreath, meshBlobs, type MeshBlob } from "./kit";
export { Section, sectionLayout, sectionTiming, type SectionContent, type SectionLayout, type SectionProps } from "./kit/Section";
export * from "./kit/windows";
export { ChatWindow, chatMoments, chatTiming, chatWindowLayout, type ChatAction, type ChatAvatar, type ChatCursor, type ChatLift, type ChatMessage, type ChatMoments, type ChatReaction, type ChatSidebar, type ChatTiming, type ChatWindowLayout, type ChatWindowProps } from "./kit/ChatWindow";
export { AnchorProvider, Arrow, anchorPoint, arrowGeometry, arrowTiming, pointAlong, resolveArrowEnds, type AnchorBoxes, type ArrowEnd, type ArrowProps, type Point } from "./kit/Arrow";
export { FlowDotMark, flowDot, flowGlow, type FlowDot } from "./kit/flow";
export { Shine, shineBand, shineGradient, shineText, type ShineBand, type ShineProps } from "./kit/shine";
export { highlightAt, highlightLevel, highlightShineMs, highlightStops, type HighlightProgression, type HighlightSpec, type HighlightStop } from "./kit/progression";
export { Cursor, cursorAt, cursorTiming, type CursorProps, type CursorState, type CursorTiming } from "./kit/cursor";
export { liftPose, liftScale, liftShadow, type LiftEnds, type LiftPlace, type LiftPose } from "./kit/liftOut";
export { Card, CardFace, cardHeight, cardMetrics, type CardData, type CardProps } from "./kit/Card";
export { CardRow, cardRowLayout, cardRowTiming, type CardRowLayout, type CardRowProps } from "./kit/CardRow";
export { FeatureList, featureListTiming, type FeatureItem, type FeatureListProps } from "./kit/FeatureList";
export * from "./kit/media";
export { Pinned, pinnedLayout, type PinnedCorner, type PinnedLayout, type PinnedProps } from "./kit/Pinned";
export { Handoff, handoffLayout, type HandoffLayout, type HandoffProps } from "./kit/Handoff";
export { HEADLINE_MOTIONS, HEADLINE_ROLES, Headline, HeadlineText, MARK_STYLES, headlineBox, headlineMarks, headlineTiming, headlineWords, markSweep, wordLeaving, type HeadlineMarks, type HeadlineMotion, type HeadlineProps, type HeadlineRole, type HeadlineTextProps, type HeadlineTiming, type MarkStyle } from "./kit/Headline";
export { SceneFrame, frameLineSpec, sceneFrameLayout, sceneFrameTiming, type SceneFrameLayout, type SceneFrameProps, type SceneFrameText, type SceneFrameTiming } from "./kit/SceneFrame";
export { PromptCard, promptCardLayout, promptCardTiming, type PromptCardLayout, type PromptCardProps, type PromptCardTiming } from "./kit/PromptCard";
export { EndCard, endCardLayout, endCardTiming, type EndCardLayout, type EndCardProps, type EndCardTiming } from "./kit/EndCard";
export { MotionDelay, NOMINAL_SCENE_MS, SceneClockContext, useSceneMs, useSceneTime, type SceneClock, type SceneTime } from "./kit/frameContext";
export { caretBlink, typedCount, typedText, typingPauseMs, typingSpan, typingTimes, type TypingSpan } from "./kit/typing";
export { arrive, cascadeStep, curveEasing, exitMs, exitOpacity, fade, fitSequence, pulse, tween, type Timed } from "./kit/motion";
export * from "./camera";
