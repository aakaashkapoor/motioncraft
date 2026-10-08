// The design kit: code-drawn scene components, keyed by the name a storyboard
// scene uses in its `component` field.

import { Caption, captionLimits } from "./Caption";
import { TitleCard } from "./TitleCard";
import { asKitComponent, type KitComponent } from "./types";

export { Caption, TitleCard, captionLimits };
export { pageAt, pageCaption } from "./captionPages";
export type { CaptionLimits } from "./captionPages";
export type { CaptionProps } from "./Caption";
export type { TitleCardProps } from "./TitleCard";
export type { KitComponent, KitProps } from "./types";
export { presence, themeEasing } from "./motion";
export { asKitComponent } from "./types";

export const kit: Record<string, KitComponent> = {
  TitleCard: asKitComponent(TitleCard),
  Caption: asKitComponent(Caption),
};
