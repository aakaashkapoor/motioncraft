// Layer-1 automatic checks (no AI): overflow, safe area, contrast, readability.

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
export { CHECK_NAMES } from "./types";
export type { CheckName, CheckResult, FrameMeasurement, MeasuredKey, MeasuredText, Problem } from "./types";
