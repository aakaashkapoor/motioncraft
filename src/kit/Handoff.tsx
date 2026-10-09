// One thing handed to another: a source component (`from`, such as a prompt
// card) and a receiver (`to`, such as a window), joined by an Arrow that draws
// from the source into the receiver. The source arrives first, the arrow draws,
// then the receiver arrives. Side by side when the area is wide, stacked when
// it is tall, so it lays out in 9:16, 16:9 and inside a Section slot. The arrow
// runs between the two boxes' facing edges; receivers that fill their box
// (AppWindow, BrowserWindow) meet its head exactly.

import { interpolate } from "../engine/easing";
import { contentArea } from "../layout/caption";
import type { Rect } from "../layout/frame";
import type { Aspect } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { Arrow } from "./Arrow";
import type { Point } from "./arrowGeometry";
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
/** When the arrow draws, and when the receiver starts its own entrance (fractions of the scene). */
const ARROW_WINDOW: readonly [number, number] = [0.18, 0.42];
const TO_FROM = 0.3;

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

export function Handoff({ progress, theme, aspect, area, from, to, label }: HandoffProps) {
  const box = area ?? contentArea(theme, aspect);
  const layout = handoffLayout(theme, aspect, box);
  const common = { theme, aspect };
  // The receiver plays its entrance once the arrow is on its way, and still exits with the scene.
  const toProgress = interpolate(progress, [TO_FROM, 1], [0, 1]);
  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height }}>
      {/* Offset back to the frame's origin, so the parts' boxes stay in frame px. */}
      <div style={{ position: "absolute", left: -box.x, top: -box.y }}>
        <Part {...common} spec={from} progress={progress} area={layout.from} part="from" />
        <Part {...common} spec={to} progress={toProgress} area={layout.to} part="to" />
        <Arrow {...common} progress={progress} from={layout.start} to={layout.end} window={ARROW_WINDOW} label={label} />
      </div>
    </div>
  );
}
