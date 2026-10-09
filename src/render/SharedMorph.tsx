// The morph layer of a shared-element transition (design v2, section 3). Each
// `shareId` both scenes have is drawn once, on top of both scenes: a box
// springing from its place in A to its place in B (position, size, radius,
// background, opacity), holding frozen copies of A's and B's element that
// cross-fade. Each copy is the whole scene with everything but that element
// made invisible, scaled so the element covers the box. A style rule hides the
// originals in the scenes meanwhile, so nothing is drawn twice.

import type { ReactNode } from "react";
import type { ActiveScene } from "../engine/timeline";
import type { Size } from "../layout/frame";
import { contentFade, interpolateSharedBox, type BoundaryMeasurement, type SharedBox } from "../transitions/shared";
import { SHARE_ATTRIBUTE } from "./sharedMeasure";

/** Marks the wrappers of the two scenes whose shared originals are hidden. */
export const SHARED_SCENE_ATTRIBUTE = "data-shared-scene";

export interface SharedMorphProps {
  ids: readonly string[];
  measurement: BoundaryMeasurement;
  /** Morph progress, 0 = A's boxes, 1 = B's. */
  t: number;
  /** The frozen scenes the copies show (see `morphEndpoints`). */
  endpoints: readonly [ActiveScene, ActiveScene];
  size: Size;
  renderScene: (scene: ActiveScene) => ReactNode;
}

/** A CSS string literal, safe inside a `<style>` element. */
function cssString(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&").replace(/\n/g, "\\a ").replace(/</g, "\\3c ")}"`;
}

// `|| 0` turns -0 into 0.
const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places || 0;

/** Hides the originals; in each copy, shows only its element, flat (the box carries opacity and background). */
export function sharedStyles(ids: readonly string[]): string {
  return ids
    .map((id) => {
      const share = `[${SHARE_ATTRIBUTE}=${cssString(id)}]`;
      const copy = `[data-morph-id=${cssString(id)}]`;
      return (
        `[${SHARED_SCENE_ATTRIBUTE}] ${share}{visibility:hidden !important}` +
        `${copy} ${share}{visibility:visible !important;opacity:1 !important;background:transparent !important;box-shadow:none !important}`
      );
    })
    .join("");
}

function MorphCopy({ id, side, element, box, opacity, size, children }: {
  id: string;
  side: "from" | "to";
  element: SharedBox;
  box: SharedBox;
  opacity: number;
  size: Size;
  children: ReactNode;
}) {
  // Scale the frozen scene uniformly so its element covers the box (text never stretches).
  const scale = Math.max(box.width / element.width, box.height / element.height);
  return (
    <div
      data-morph-content={side}
      data-morph-id={id}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: size.width,
        height: size.height,
        visibility: "hidden",
        opacity: round(opacity, 4),
        transformOrigin: "0 0",
        transform: `translate(${round(-element.x * scale)}px, ${round(-element.y * scale)}px) scale(${round(scale, 4)})`,
      }}
    >
      {children}
    </div>
  );
}

export function SharedMorph({ ids, measurement, t, endpoints, size, renderScene }: SharedMorphProps) {
  const fade = contentFade(t);
  const [fromScene, toScene] = endpoints;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: sharedStyles(ids) }} />
      {ids.map((id) => {
        const from = measurement.from[id]!;
        const to = measurement.to[id]!;
        const box = interpolateSharedBox(from, to, t);
        return (
          <div
            key={id}
            data-morph-box={id}
            style={{
              position: "absolute",
              left: round(box.x),
              top: round(box.y),
              width: round(box.width),
              height: round(box.height),
              borderRadius: round(box.radius),
              backgroundColor: box.background,
              opacity: round(box.opacity, 4),
              overflow: "hidden",
            }}
          >
            <MorphCopy id={id} side="from" element={from} box={box} opacity={fade.from} size={size}>
              {renderScene(fromScene)}
            </MorphCopy>
            <MorphCopy id={id} side="to" element={to} box={box} opacity={fade.to} size={size}>
              {renderScene(toScene)}
            </MorphCopy>
          </div>
        );
      })}
    </>
  );
}
