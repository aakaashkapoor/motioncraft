// motioncraft public entry point. Modules are added here as they land.
export const VERSION = "0.0.0";

export * from "./storyboard/types";
export { validateCue, validateStoryboard } from "./storyboard/validate";
export { brandFontsErrors, fontOverrideErrors } from "./storyboard/brandFonts";
export { BRAND_FAMILY_PREFIX, brandFamily, brandFontLoadRequests } from "./render/fontFaces";
export { GENERIC_FAMILIES, fontStackEntries, resolveFontStack, unknownFontNames } from "./theme/fontStack";

export type {
  AccentIntensity,
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
export { accentInk, cardColors, headlineColor, roleColor, type CardColors, type ColorRole } from "./theme/roles";
export { mixColors, withAlpha } from "./theme/color";
export { contrastRatio, relativeLuminance, roleColorIssues } from "./theme/contrast";
export { groundTint, MESH_STOPS, meshFalloff, meshLayout, type MeshRest } from "./theme/mesh";

export { frameSize, isTall } from "./layout/frame";
export { clearOfKeepOuts, safeArea, safeZones, usesSafeProfiles, type SafeZones } from "./layout/safe";
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
export { activeWordAt, CAPTION_LEAD_MS, evenWordTimes, pageIndexAt, timedPages, wordLight, type TimedPage, type TimedWord } from "./kit/captionWords";
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
export { Receipt, type ReceiptProps } from "./kit/Receipt";
export { Notification, type NotificationProps } from "./kit/Notification";
export { NOTIFICATION_DROP_MS, NOTIFICATION_MAX, bannerPoses, dropProgress, notificationErrors, notificationLayout, notificationTiming, type BannerPose, type NotificationItem, type NotificationLayout, type NotificationTiming } from "./kit/notificationPlan";
export { RECEIPT_MAX_ITEMS, RECEIPT_MAX_SUMMARY, RECEIPT_MAX_TILT, receiptErrors, receiptLayout, receiptLines, receiptTiming, type ReceiptData, type ReceiptItem, type ReceiptLayout, type ReceiptLine, type ReceiptRow, type ReceiptTiming } from "./kit/receiptPlan";
export { Annotate, type AnnotateProps } from "./kit/Annotate";
export { ANNOTATE_MARK_STYLES, ANNOTATE_NOTE_MAX, ANNOTATE_NOTE_POSITIONS, annotateErrors, annotateLayout, annotateTiming, connectorStroke, markStroke, wrapText, type AnnotateData, type AnnotateLayout, type AnnotateMarkStyle, type AnnotateNotePosition, type AnnotateTiming, type AnnotateStroke } from "./kit/annotatePlan";
export { BEFORE_AFTER_DIRECTIONS, BEFORE_AFTER_SPLIT_MAX, BEFORE_AFTER_SPLIT_MIN, BeforeAfter, beforeAfterClip, beforeAfterErrors, beforeAfterLayout, beforeAfterSplit, beforeAfterTiming, type BeforeAfterDirection, type BeforeAfterLayout, type BeforeAfterProps, type BeforeAfterTiming } from "./kit/BeforeAfter";
export { receiptTotalWarnings } from "./checks/receiptTotals";
export { STROKE_TRACE_MAX_PATHS, StrokeTrace, strokeTraceErrors, strokeTraceLayout, strokeTracePaths, strokeTraceTiming, type StrokeTraceLayout, type StrokeTraceProps, type StrokeTraceTiming } from "./kit/StrokeTrace";
export { pathLength } from "./kit/pathLength";
export { SCRAMBLE_GLYPHS, SCRAMBLE_TEXT_MAX_CHARS, SCRAMBLE_TEXT_STYLES, ScrambleText, scrambleTextAccent, scrambleTextErrors, scrambleTextLayout, scrambleTextLine, scrambleTextTiming, type ScrambleSlot, type ScrambleSlotState, type ScrambleTextLayout, type ScrambleTextProps, type ScrambleTextStyle, type ScrambleTextTiming } from "./kit/ScrambleText";
export { WORD_SWAP_MAX_OPTIONS, WORD_SWAP_MIN_OPTIONS, WORD_SWAP_MS, WordSwap, wordSwapCues, wordSwapEm, wordSwapErrors, wordSwapLayout, wordSwapWords, type WordSwapLayout, type WordSwapProps, type WordSwapWord } from "./kit/WordSwap";
export { DONUT_CHART_MAX_ITEMS, DonutChart, countUpText, donutArcs, donutChartErrors, donutChartLayout, donutColors, donutDefaultCenter, type DonutArc, type DonutChartLayout, type DonutChartProps } from "./kit/DonutChart";
export { BarChart, barChartErrors, barChartLayout, barChartMax, barChartOrientation, barColors, type BarChartLayout, type BarChartProps, type BarSlot } from "./kit/BarChart";
export { LineChart, lineAreaPath, lineChartErrors, lineChartLayout, lineChartPoints, lineChartValues, lineDrawn, lineReachMs, type LineChartLayout, type LineChartProps, type LinePoint, type LineValueBox } from "./kit/LineChart";
export { OrbitCard3D, type OrbitCard3DProps } from "./kit/OrbitCard3D";
export { orbitCard3DErrors, orbitCardLayout, orbitPose, spherePoints, type OrbitCardLayout, type OrbitPose } from "./kit/orbitCard3dPlan";
export { EndCard, endCardLayout, endCardTiming, type EndCardLayout, type EndCardProps, type EndCardTiming } from "./kit/EndCard";
export { MotionDelay, NOMINAL_SCENE_MS, OPENING_SETTLE_MS, entering, SceneClockContext, SceneWordsContext, useMotionDelay, useSceneMs, useSceneTime, useSceneWords, type SceneClock, type SceneTime } from "./kit/frameContext";
export { cueErrors, resolveCue, useCueMs, type Cue } from "./kit/cues";
export { sceneWords } from "./kit/sceneWords";
export { caretBlink, typedCount, typedText, typingPauseMs, typingSpan, typingTimes, type TypingSpan } from "./kit/typing";
export { arrive, cascadeStep, curveEasing, exitMs, exitOpacity, fade, fitSequence, pulse, tween, type Timed } from "./kit/motion";
export * from "./camera";
export { EFFECT_COLORS, EFFECT_DURATION, effectsErrors, effectTargetIds } from "./storyboard/effects";
export {
  DEFAULT_PULSE_MS,
  DEFAULT_SHAKE_MS,
  EFFECT_PADDING_PX,
  HIGHLIGHT_ALPHA,
  HIGHLIGHT_SWEEP_MS,
  PULSE_SCALE,
  RING_DRAW_MS,
  RING_STROKE_PX,
  SHAKE_CYCLES,
  SHAKE_PX,
  drawsOverTarget,
  effectBox,
  effectDrawMs,
  highlightSweep,
  pulseScale,
  ringDraw,
  shakeOffset,
} from "./camera/effectMotion";
export { SceneEffects, type SceneEffectsProps } from "./camera/SceneEffects";
export { EFFECTS_ATTRIBUTE } from "./camera/effectsAttribute";
