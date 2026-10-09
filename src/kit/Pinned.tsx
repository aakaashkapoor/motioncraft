// Docks one kit component in a corner, scaled down, while another fills the
// rest of the content area. Made for shared-element transitions: a window that
// was the hero of the previous scene (same `shareId`) shrinks into the corner
// while this scene's content arrives beside it. The pinned component lays
// itself out on a full frame as usual; that frame is scaled so its content
// area fills the corner box. 16:9 docks it in a column at the side, 9:16 in a
// band at the top or bottom.

import { contentArea } from "../layout/caption";
import { frameSize, type Rect } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { kit } from "./index";
import { slotTransform, type SlotContent } from "./Slot";
import type { KitProps } from "./types";

export type PinnedCorner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export interface PinnedProps extends KitProps {
  /** The component docked in the corner, e.g. a window with a `shareId`. */
  pinned: SlotContent;
  /** The component filling the rest of the content area. */
  content?: SlotContent;
  /** Default `topRight`. */
  corner?: PinnedCorner;
  /**
   * `settled` (default): the pinned component is already in place on the first
   * frame, as when it arrives from the previous scene by a shared-element
   * morph. `animate`: it plays its own entrance.
   */
  arrive?: "settled" | "animate";
}

/** The pinned frame's scale: its share of the content area along each side. */
const PINNED_SCALE: Record<Aspect, number> = { "16:9": 0.32, "9:16": 0.3 };
/** With `arrive: settled`, the pinned component starts this far into its own animation. */
// Mid-scene: past the entrances (and count-ups) of the kit components.
const SETTLED_PROGRESS = 0.5;

export interface PinnedLayout {
  scale: number;
  /** The corner box the pinned frame's content area fills, in frame px. */
  pinned: Rect;
  /** The box for the main content, in frame px. */
  content: Rect;
}

/** Where the pinned component and the content go inside `area`. Pure. */
export function pinnedLayout(theme: Theme, aspect: Aspect, corner: PinnedCorner = "topRight", area: Rect = contentArea(theme, aspect)): PinnedLayout {
  const scale = PINNED_SCALE[aspect];
  const gap = theme.spacing.lg;
  const width = area.width * scale;
  const height = area.height * scale;
  const right = corner.endsWith("Right");
  const bottom = corner.startsWith("bottom");
  const pinned = {
    x: right ? area.x + area.width - width : area.x,
    y: bottom ? area.y + area.height - height : area.y,
    width,
    height,
  };
  const content =
    aspect === "16:9"
      ? { x: right ? area.x : area.x + width + gap, y: area.y, width: area.width - width - gap, height: area.height }
      : { x: area.x, y: bottom ? area.y : area.y + height + gap, width: area.width, height: area.height - height - gap };
  return { scale, pinned, content };
}

/** Draws a nested component's full frame at (x, y), scaled, without clipping. */
function ScaledFrame({ spec, progress, theme, aspect, x, y, scale, attribute }: {
  spec: SlotContent;
  progress: number;
  theme: Theme;
  aspect: Aspect;
  x: number;
  y: number;
  scale: number;
  attribute: string;
}) {
  const Component = typeof spec?.component === "string" && Object.hasOwn(kit, spec.component) ? kit[spec.component] : undefined;
  if (Component === undefined) throw new Error(`Pinned: unknown component "${String(spec?.component)}"`);
  const { width, height } = frameSize(aspect);
  return (
    <div
      {...{ [attribute]: "" }}
      style={{ position: "absolute", left: x, top: y, width, height, transform: `scale(${scale})`, transformOrigin: "0 0" }}
    >
      <Component {...spec.props} progress={progress} theme={theme} aspect={aspect} />
    </div>
  );
}

export function Pinned({ progress, theme, aspect, area, pinned, content, corner = "topRight", arrive = "settled" }: PinnedProps) {
  const layout = pinnedLayout(theme, aspect, corner, area);
  const inner = contentArea(theme, aspect);
  const { scale } = layout;
  // Centered in its box like a window's content slot, but unclipped, so springs and shadows show.
  const fit = slotTransform(theme, aspect, layout.content);
  const common = { theme, aspect };

  return (
    <div data-pinned={corner} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%" }}>
      {content !== undefined && (
        <ScaledFrame {...common} spec={content} progress={progress} x={layout.content.x + fit.x} y={layout.content.y + fit.y} scale={fit.scale} attribute="data-pinned-content" />
      )}
      <ScaledFrame
        {...common}
        spec={pinned}
        progress={arrive === "settled" ? Math.max(progress, SETTLED_PROGRESS) : progress}
        x={layout.pinned.x - inner.x * scale}
        y={layout.pinned.y - inner.y * scale}
        scale={scale}
        attribute="data-pinned-frame"
      />
    </div>
  );
}
