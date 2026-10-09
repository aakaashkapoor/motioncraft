// A content slot: renders any kit component spec inside a box, such as a
// window's content area. The nested component lays itself out on a full frame
// of the scene's aspect as usual; the slot scales that frame so the component's
// content area fits the box, centered, and clips anything outside the box.
// The nested frame moves with the window, so camera layers inside stay put.

import { CameraFree } from "../camera/Camera";
import { frameSize, type Rect, type Size } from "../layout/frame";
import { contentArea } from "../layout/caption";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
// The registry imports this module's users; it is only read at render time.
import { kit } from "./index";
import { VisibleRectContext } from "./frameContext";
import { FULL_BLEED_COMPONENTS } from "./media";

/** A nested kit component, written in a storyboard the same way as a scene. */
export interface SlotContent {
  /** Name of a kit component. */
  component: string;
  props?: Record<string, unknown>;
}

/** Where the nested frame goes: its top-left corner in the box, and its scale. */
export interface SlotTransform {
  x: number;
  y: number;
  scale: number;
}

/** Scales the nested frame so its content area fits `box` (never enlarged), centered. Pure. */
export function slotTransform(theme: Theme, aspect: Aspect, box: Size): SlotTransform {
  const area = contentArea(theme, aspect);
  const scale = Math.min(1, box.width / area.width, box.height / area.height);
  return {
    x: (box.width - area.width * scale) / 2 - area.x * scale,
    y: (box.height - area.height * scale) / 2 - area.y * scale,
    scale,
  };
}

export interface SlotProps {
  progress: number;
  theme: Theme;
  aspect: Aspect;
  /** The box, relative to the slot's positioned parent. */
  box: Rect;
  content?: SlotContent;
  backgroundColor?: string;
  /** Marks the box in the markup, e.g. `data-window-content`. */
  attribute: string;
}

export function Slot({ progress, theme, aspect, box, content, backgroundColor, attribute }: SlotProps) {
  const Component = content === undefined ? undefined : Object.hasOwn(kit, content.component) ? kit[content.component] : undefined;
  if (content !== undefined && Component === undefined) {
    throw new Error(`content slot: unknown component "${content.component}"`);
  }
  const { width, height } = frameSize(aspect);
  const { x, y, scale } = slotTransform(theme, aspect, box);
  return (
    <div
      {...{ [attribute]: "" }}
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        overflow: "hidden",
        backgroundColor,
      }}
    >
      {Component !== undefined && (
        <div
          style={{
            position: "absolute",
            left: x,
            top: y,
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          {/* The box, in the nested frame's coordinates: what media fills. */}
          <VisibleRectContext.Provider value={{ x: -x / scale, y: -y / scale, width: box.width / scale, height: box.height / scale }}>
            <CameraFree>
              {/* Given its area, a nested component centers in it (and so in the box), not on the frame's optical center. Media fill the box. */}
              <Component {...content!.props} progress={progress} theme={theme} aspect={aspect} area={FULL_BLEED_COMPONENTS.has(content!.component) ? undefined : contentArea(theme, aspect)} />
            </CameraFree>
          </VisibleRectContext.Provider>
        </div>
      )}
    </div>
  );
}
