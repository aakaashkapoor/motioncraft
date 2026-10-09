// Every kit component a scene uses: the scene's own, plus any nested in its
// props (a window's `content` slot, for example). Pure.

/** A component spec found in a scene. */
export interface ComponentUse {
  component: string;
  props: Record<string, unknown>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Nested specs: any object with a string `component` (and optional object `props`), at any depth. */
function nested(value: unknown, found: ComponentUse[]): void {
  if (Array.isArray(value)) {
    for (const item of value) nested(item, found);
    return;
  }
  if (!isObject(value)) return;
  if (typeof value.component === "string" && (value.props === undefined || isObject(value.props))) {
    const props = (value.props as Record<string, unknown> | undefined) ?? {};
    found.push({ component: value.component, props });
    nested(props, found);
    return;
  }
  for (const child of Object.values(value)) nested(child, found);
}

/** The scene's component first, then nested ones in document order. */
export function sceneComponents(scene: { component: unknown; props: Record<string, unknown> }): ComponentUse[] {
  const found: ComponentUse[] = [];
  if (typeof scene.component === "string") found.push({ component: scene.component, props: scene.props });
  nested(scene.props, found);
  return found;
}
