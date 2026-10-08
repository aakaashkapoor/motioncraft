// The props every kit component receives, and the component shape the
// registry holds.

import type { ComponentType } from "react";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";

export interface KitProps {
  /** How far into the scene we are: 0 on its first frame, 1 on its last. */
  progress: number;
  theme: Theme;
  aspect: Aspect;
}

/** A kit component as the registry sees it: storyboard props are unchecked. */
export type KitComponent = ComponentType<KitProps & Record<string, unknown>>;

/**
 * Widens a component with its own typed props to the registry shape. Storyboard
 * props are not type-checked here; the storyboard validator owns that.
 */
export function asKitComponent<P extends KitProps>(component: ComponentType<P>): KitComponent {
  return component as unknown as KitComponent;
}
