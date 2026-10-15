// The design kit: code-drawn scene components, keyed by the name a storyboard
// scene uses in its `component` field.

import { AppWindow } from "./AppWindow";
import { Arrow } from "./Arrow";
import { BigNumber } from "./BigNumber";
import { BrowserWindow } from "./BrowserWindow";
import { ChatWindow } from "./ChatWindow";
import { Card } from "./Card";
import { CardRow } from "./CardRow";
import { FeatureList } from "./FeatureList";
import { Caption, captionLimits } from "./Caption";
import { FlowDiagram } from "./FlowDiagram";
import { Section } from "./Section";
import { Pinned } from "./Pinned";
import { StepList } from "./StepList";
import { CodeWindow, TerminalWindow } from "./windows";
import { TitleCard } from "./TitleCard";
import { asKitComponent, type KitComponent } from "./types";
import { Image } from "./Image";
import { VideoClip } from "./VideoClip";
import { Handoff } from "./Handoff";
import { Headline } from "./Headline";
import { SceneFrame } from "./SceneFrame";
import { PromptCard } from "./PromptCard";
import { EndCard } from "./EndCard";
import { Receipt } from "./Receipt";
import { Notification } from "./Notification";
import { StrokeTrace } from "./StrokeTrace";
import { Annotate } from "./Annotate";
import { BeforeAfter } from "./BeforeAfter";
import { ScrambleText } from "./ScrambleText";
import { WordSwap } from "./WordSwap";
import { DonutChart } from "./DonutChart";
import { BarChart } from "./BarChart";
import { LineChart } from "./LineChart";
import { OrbitCard3D } from "./OrbitCard3D";
import { LayerStack3D } from "./LayerStack3D";
import { CodeSlab3D } from "./CodeSlab3D";
import { ExtrudedTitle } from "./ExtrudedTitle";
import { GiantType } from "./GiantType";
import { BentoGrid } from "./BentoGrid";
import { Countdown } from "./Countdown";
import { Backdrop3D } from "./Backdrop3D";

export { Caption, TitleCard, captionLimits };
export { titleCardStep } from "./TitleCard";
export { FlowDiagram, flowDiagramLayout, flowDiagramTiming } from "./FlowDiagram";
export type { FlowArrow, FlowDiagramLayout, FlowDiagramProps, FlowDiagramTiming } from "./FlowDiagram";
export { pageAt, pageCaption, pageRanges } from "./captionPages";
export type { CaptionLimits, PageRange } from "./captionPages";
export type { CaptionProps } from "./Caption";
export type { TitleCardProps } from "./TitleCard";
export type { KitComponent, KitProps } from "./types";
export { presence, themeEasing } from "./motion";
export { asKitComponent } from "./types";
export { StepList, stepListLayout, stepListTiming, type StepListProps } from "./StepList";
export { Ground, groundStyle, type GroundProps } from "./Ground";
export { grainSeed, gridBreath, meshBlobs, type MeshBlob } from "./groundMotion";
export { Shine, shineBand, shineGradient, shineText, type ShineBand, type ShineProps } from "./shine";
export { Cursor, cursorAt, cursorTiming, type CursorProps, type CursorState, type CursorTiming } from "./cursor";
export { liftPose, liftScale, liftShadow, type LiftEnds, type LiftPlace, type LiftPose } from "./liftOut";
export { AppWindow, BrowserWindow, slotTransform, windowLayout, type AppWindowProps, type BrowserWindowProps, type SlotContent } from "./windows";

export const kit: Record<string, KitComponent> = {
  TitleCard: asKitComponent(TitleCard),
  Caption: asKitComponent(Caption),
  BigNumber: asKitComponent(BigNumber),
  FlowDiagram: asKitComponent(FlowDiagram),
  StepList: asKitComponent(StepList),
  Section: asKitComponent(Section),
  AppWindow: asKitComponent(AppWindow),
  BrowserWindow: asKitComponent(BrowserWindow),
  TerminalWindow: asKitComponent(TerminalWindow),
  CodeWindow: asKitComponent(CodeWindow),
  ChatWindow: asKitComponent(ChatWindow),
  Arrow: asKitComponent(Arrow),
  Card: asKitComponent(Card),
  CardRow: asKitComponent(CardRow),
  FeatureList: asKitComponent(FeatureList),
  VideoClip: asKitComponent(VideoClip),
  Image: asKitComponent(Image),
  Pinned: asKitComponent(Pinned),
  Handoff: asKitComponent(Handoff),
  Headline: asKitComponent(Headline),
  SceneFrame: asKitComponent(SceneFrame),
  PromptCard: asKitComponent(PromptCard),
  EndCard: asKitComponent(EndCard),
  Receipt: asKitComponent(Receipt),
  Notification: asKitComponent(Notification),
  StrokeTrace: asKitComponent(StrokeTrace),
  Annotate: asKitComponent(Annotate),
  BeforeAfter: asKitComponent(BeforeAfter),
  ScrambleText: asKitComponent(ScrambleText),
  WordSwap: asKitComponent(WordSwap),
  DonutChart: asKitComponent(DonutChart),
  BarChart: asKitComponent(BarChart),
  LineChart: asKitComponent(LineChart),
  OrbitCard3D: asKitComponent(OrbitCard3D),
  LayerStack3D: asKitComponent(LayerStack3D),
  CodeSlab3D: asKitComponent(CodeSlab3D),
  ExtrudedTitle: asKitComponent(ExtrudedTitle),
  GiantType: asKitComponent(GiantType),
  BentoGrid: asKitComponent(BentoGrid),
  Countdown: asKitComponent(Countdown),
  Backdrop3D: asKitComponent(Backdrop3D),
};
