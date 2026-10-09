// Layer-1 automatic checks (no AI): overflow, safe area, contrast, readability,
// type scale (a warning), and storyboard checks (transitions, theme colors,
// media files).

export { runChecks } from "./run";
export type { RunChecksOptions } from "./run";
export { formatProblem, judge } from "./judge";
export type { MeasuredFrame } from "./judge";
export { contentOpacity, FULLY_VISIBLE, sampleVisibleFrames } from "./sample";
export type { MeasureFrame } from "./sample";
export { checkOverflow } from "./overflow";
export { checkSafeArea } from "./safeArea";
export { checkContrast, effectiveBackground, MIN_CONTRAST, parseCssColor, textContrast } from "./contrast";
export { checkReadability, countWords, minReadMs } from "./readability";
export { checkTypeScale } from "./typeScale";
export type { RampStep } from "./typeScale";
export { checkMediaFiles, checkStoryboard, checkThemeColors, checkTransitions, formatIssue, STORYBOARD_CHECK_NAMES } from "./storyboard";
export type { CheckStoryboardOptions, Severity, StoryboardCheckName, StoryboardIssue } from "./storyboard";
export { CHECK_NAMES, WARNING_CHECKS } from "./types";
export type { CheckName, CheckResult, FrameMeasurement, MeasuredKey, MeasuredText, Problem } from "./types";
