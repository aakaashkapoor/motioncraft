// Components storyboards may name that are not part of the public `kit`: test
// and demo components, with no docs, guide entry or timing sample. The render
// page and `checkComponents` look a scene's component up in `kit` first, then
// here.

import { kit } from "./index";
import { ThreeDemo } from "./three/ThreeDemo";
import { asKitComponent, type KitComponent } from "./types";

export const internalKit: Record<string, KitComponent> = {
  ThreeDemo: asKitComponent(ThreeDemo),
};

/** The scene component called `name`: from `kit`, else from `internalKit`; undefined if neither has it. */
export function sceneComponent(name: string): KitComponent | undefined {
  if (Object.hasOwn(kit, name)) return kit[name];
  return Object.hasOwn(internalKit, name) ? internalKit[name] : undefined;
}
