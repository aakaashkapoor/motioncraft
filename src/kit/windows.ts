// The window components and their pure layout helpers, re-exported together.

export { AppWindow, windowLayout, windowMotion, type AppWindowProps, type WindowChromeStyle, type WindowLayout } from "./AppWindow";
export { BrowserWindow, type BrowserWindowProps } from "./BrowserWindow";
export { slotTransform, type SlotContent, type SlotTransform } from "./Slot";
// The window components and their helpers, gathered for the public entry point.
export { CodeWindow, type CodeWindowProps } from "./CodeWindow";
export { TerminalWindow, terminalTiming, type TerminalLine, type TerminalLineTiming, type TerminalWindowProps } from "./TerminalWindow";
export { WindowChrome, TRAFFIC_LIGHTS, type WindowChromeProps } from "./WindowChrome";
export { highlightCode, SYNTAX_ROLES, type CodeToken, type SyntaxRole } from "./highlight";
export { highlightBand, syntaxColors } from "./syntaxColors";
