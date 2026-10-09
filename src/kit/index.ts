// The design kit: code-drawn scene components, keyed by the name a storyboard
// scene uses in its `component` field.

import { BigNumber } from "./BigNumber";
import { Caption, captionLimits } from "./Caption";
import { FlowDiagram } from "./FlowDiagram";
import { StepList } from "./StepList";
import { TitleCard } from "./TitleCard";
import { asKitComponent, type KitComponent } from "./types";

export { Caption, TitleCard, captionLimits };
export { titleCardStep } from "./TitleCard";
export { FlowDiagram, flowDiagramLayout } from "./FlowDiagram";
export type { FlowArrow, FlowDiagramLayout, FlowDiagramProps } from "./FlowDiagram";
export { pageAt, pageCaption } from "./captionPages";
export type { CaptionLimits } from "./captionPages";
export type { CaptionProps } from "./Caption";
export type { TitleCardProps } from "./TitleCard";
export type { KitComponent, KitProps } from "./types";
export { presence, themeEasing } from "./motion";
export { asKitComponent } from "./types";
export { StepList, stepListLayout, stepListTiming, type StepListProps } from "./StepList";

export const kit: Record<string, KitComponent> = {
  TitleCard: asKitComponent(TitleCard),
  Caption: asKitComponent(Caption),
  BigNumber: asKitComponent(BigNumber),
  FlowDiagram: asKitComponent(FlowDiagram),
  StepList: asKitComponent(StepList),
};
