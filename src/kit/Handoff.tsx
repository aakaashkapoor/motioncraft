// One thing handed to another: a source component (`from`, such as a prompt
// card) and a receiver (`to`, such as a window), joined by an Arrow that draws
// from the source into the receiver. The source arrives on the scene's lead,
// the arrow sweeps out of it once it shows, and the receiver arrives as the
// arrow lands, all in about the first 1.2 s. Side by side when the area is
// wide, stacked when it is tall, so it lays out in 9:16, 16:9 and inside a Section slot. The arrow
// runs between the two boxes' facing edges; receivers that fill their box
// (AppWindow, BrowserWindow) meet its head exactly. Under a moving camera
// (design v3, life #12) the source floats a little nearer than the receiver
// and the arrow, which move with the world.

import { CameraLayer, useLayerPoint } from "../camera/Camera";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { Arrow, type ArrowProps } from "./Arrow";
import type { Point } from "./arrowGeometry";
import { MotionDelay } from "./frameContext";
import { kit } from "./index";
import type { SlotContent } from "./Slot";
import type { KitProps } from "./types";

export interface HandoffProps extends KitProps {
  /** The source, e.g. a prompt `Card`. */
  from: SlotContent;
  /** The receiver, e.g. a window with a `shareId`. */
  to: SlotContent;
  /** A short label on the arrow. */
  label?: string;
}

export interface HandoffLayout {
  direction: "row" | "column";
  from: Rect;
  to: Rect;
  /** The arrow's ends, in frame px: the facing edges' midpoints. */
  start: Point;
  end: Point;
}

/** Side by side only when the area is clearly wider than tall. */
const ROW_RATIO = 1.3;
/** The source's share of the area along the direction of travel. */
const FROM_SHARE = { row: 0.34, column: 0.26 } as const;

/** Where the source, the receiver and the arrow go inside `area`. Pure. */
export function handoffLayout(theme: Theme, aspect: Aspect, area: Rect = contentArea(theme, aspect)): HandoffLayout {
  const direction = area.width >= area.height * ROW_RATIO ? "row" : "column";
  const gap = theme.spacing.xxl * 2.5;
  if (direction === "row") {
    const width = Math.round((area.width - gap) * FROM_SHARE.row);
    const from = { x: area.x, y: area.y, width, height: area.height };
    const to = { x: area.x + width + gap, y: area.y, width: area.width - width - gap, height: area.height };
    const y = area.y + area.height / 2;
    return { direction, from, to, start: { x: from.x + from.width, y }, end: { x: to.x, y } };
  }
  const height = Math.round((area.height - gap) * FROM_SHARE.column);
  const from = { x: area.x, y: area.y, width: area.width, height };
  const to = { x: area.x, y: area.y + height + gap, width: area.width, height: area.height - height - gap };
  const x = area.x + area.width / 2;
  return { direction, from, to, start: { x, y: from.y + from.height }, end: { x, y: to.y } };
}

function Part({ spec, progress, theme, aspect, area, part }: { spec: SlotContent; progress: number; theme: Theme; aspect: Aspect; area: Rect; part: "from" | "to" }) {
  const Component = typeof spec?.component === "string" && Object.hasOwn(kit, spec.component) ? kit[spec.component] : undefined;
  if (Component === undefined) throw new Error(`Handoff: unknown component "${String(spec?.component)}"`);
  return (
    <div data-handoff={part}>
      <Component {...spec.props} progress={progress} theme={theme} aspect={aspect} area={area} />
    </div>
  );
}

/** The arrow, drawn with the world, its tail kept on the floating source's edge as the camera moves. */
function HandoffArrow({ start, ...props }: Omit<ArrowProps, "from"> & { start: Point }) {
  return <Arrow {...props} from={useLayerPoint(start, "floating")} />;
}

export function Handoff({ progress, theme, aspect, area, from, to, label }: HandoffProps) {
  const box = area ?? contentArea(theme, aspect);
  const layout = handoffLayout(theme, aspect, box);
  const common = { theme, aspect };
  // The arrow starts once the source has faded in; the receiver arrives so it shows as the arrow lands. Both still exit with the scene.
  const { fx, mark } = theme.motion;
  const arrowDelay = fx.ms;
  const toDelay = arrowDelay + mark.ms - fx.ms;
  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height }}>
      {/* Offset back to the frame's origin, so the parts' boxes stay in frame px. */}
      <div style={{ position: "absolute", left: -box.x, top: -box.y }}>
        <CameraLayer depth="foreground" aspect={aspect}>
          <MotionDelay ms={toDelay}>
            <Part {...common} spec={to} progress={progress} area={layout.to} part="to" />
          </MotionDelay>
        </CameraLayer>
        <CameraLayer depth="floating" aspect={aspect}>
          <Part {...common} spec={from} progress={progress} area={layout.from} part="from" />
        </CameraLayer>
        {/* Over the source's soft shadow, as the arrow leaves it. */}
        <CameraLayer depth="foreground" aspect={aspect}>
          <MotionDelay ms={arrowDelay}>
            <HandoffArrow {...common} progress={progress} start={layout.start} to={layout.end} label={label} />
          </MotionDelay>
        </CameraLayer>
      </div>
    </div>
  );
}
