// Lets the layer-1 checks see into a ThreeStage. The checks measure the DOM,
// and a canvas is one opaque box to them, so each `ThreeKey` gets an empty,
// absolutely positioned div over the canvas at its projected rect (see
// `projectBox`), marked `data-key-element` with the key's label: safe area
// then judges where the 3D object actually is on the frame. The union of the
// keys is marked `data-block` (the stage's label, or "3D stage"), as other kit
// components mark their visual block, so centering judges the 3D subject
// rather than the stage's box.
//
// The boxes paint nothing (no background, border or visible text), but stay
// fully opaque and `visibility: visible`: the measurement treats an element
// at opacity 0 or hidden as not on screen. A fading scene fades them with it,
// since opacity is taken down the DOM tree. A key whose object is hidden
// (`visible: false` on it or a parent), or wholly behind the camera, has its
// box taken out of the DOM until it shows again, so it is neither judged nor
// counted as content that is not visible yet (frame sampling takes the
// faintest key's opacity).
//
// The boxes sit in a layer the size of the stage with `overflow: hidden`, as
// the canvas cuts off whatever goes past it. Non-text keys are judged by the
// safe-area check only (measurement takes a key's whole rect, clipped or not).
//
// 3D text: a key with `text` carries it as `aria-label` (role "img"). Given
// its material's colour (`ThreeKey.color`), it is also measured as text: its
// box holds a DOM stand-in, the same string in Geist Bold (the 3D text's
// face), scaled to the projected rect, so
//   - safe area, the 9:16 button rail and overflow judge the text where it is
//     drawn (overflow sees it cut by the stage edge, through the layer);
//   - readability counts its words, and the opening check sees text on frame 0;
//   - contrast judges the material's theme colour against what is painted
//     under the stage, like flat text in that colour. The lit, tone-mapped
//     letters vary around that colour; the theme colour is the honest proxy.
//   - type scale leaves it alone (`data-type-fit`): its size is set by the
//     camera, not the type ramp.
// The stand-in paints nothing: `-webkit-text-fill-color: transparent` hides
// the glyphs while its computed `color` (what contrast reads) stays the
// material's, and it is not hidden, faded or clipped. It takes hit tests
// (`pointer-events: auto`), so contrast finds what is under it the same way
// as for other text. Without `color` a text key is a key element only.
//
// The boxes are written directly from the stage's per-frame layout effect,
// right after the render, rather than kept in React state: state set in a
// layout effect would re-render the stage synchronously (still before the
// frame is measured), but direct writes need no second pass and the boxes
// always match the frame just drawn.

import type * as THREE from "three";
import { BLOCK_ATTRIBUTE, KEY_ATTRIBUTE } from "../../checks/measure";
import { union } from "../../checks/geometry";
import type { Rect } from "../../layout/frame";
import { TYPE_FIT_ATTRIBUTE } from "../../layout/type";
import { GEIST_FAMILY } from "../../render/fontFaces";
import { projectBox } from "./project";
import type { ThreeKey } from "./ThreeStage";

/** Marks the layer holding a stage's key boxes. */
export const THREE_KEYS_ATTRIBUTE = "data-three-keys";
/** Marks the DOM stand-in for a 3D text key. */
export const THREE_TEXT_ATTRIBUTE = "data-three-text";

export interface KeyLayer {
  /** Holds the boxes; append it to the stage's wrapper. */
  element: HTMLElement;
  /** Moves the boxes to where `camera` shows the keys on a stage of `size` (the wrapper's own px). */
  place(camera: THREE.Camera, size: { width: number; height: number }): void;
}

const BOX_STYLE = "position:absolute;pointer-events:none;margin:0;padding:0;border:0";
const TEXT_STYLE = [
  "position:absolute;left:0;top:0;margin:0;padding:0;border:0",
  `white-space:pre;line-height:normal;font-family:${GEIST_FAMILY},sans-serif;font-weight:700;font-style:normal`,
  "letter-spacing:0;-webkit-text-fill-color:transparent;pointer-events:auto;transform-origin:0 0",
].join(";");

/** False when the object or any of its parents is set not visible. */
function shown(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node !== null; node = node.parent) if (!node.visible) return false;
  return true;
}

function setBox(el: HTMLElement, rect: Rect): void {
  el.style.left = `${rect.x}px`;
  el.style.top = `${rect.y}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
}

/** Scales the stand-in `text` so its glyph boxes fill `box`, which shows `rect` (its own px). */
function fitText(text: HTMLElement, box: HTMLElement, rect: Rect): void {
  text.style.fontSize = `${rect.height}px`;
  text.style.transform = "none";
  const range = document.createRange();
  range.selectNodeContents(text);
  const lines = [...range.getClientRects()].filter((line) => line.width > 0 && line.height > 0);
  const target = box.getBoundingClientRect();
  if (lines.length === 0 || target.width <= 0 || target.height <= 0) return;
  const left = Math.min(...lines.map((line) => line.left));
  const top = Math.min(...lines.map((line) => line.top));
  const width = Math.max(...lines.map((line) => line.right)) - left;
  const height = Math.max(...lines.map((line) => line.bottom)) - top;
  // Screen px per px of the box, from transforms above it (the camera, a docked frame).
  const scale = target.width / rect.width;
  const own = text.getBoundingClientRect();
  const dx = (left - own.left) / scale;
  const dy = (top - own.top) / scale;
  text.style.transform = `scale(${target.width / width}, ${target.height / height}) translate(${-dx}px, ${-dy}px)`;
}

interface Slot {
  key: ThreeKey;
  box: HTMLElement;
  text?: HTMLElement;
}

/** Makes the key boxes for `keys` on a stage labelled `label`. */
export function createKeyLayer(keys: readonly ThreeKey[], label: string | undefined): KeyLayer {
  const element = document.createElement("div");
  element.setAttribute(THREE_KEYS_ATTRIBUTE, "");
  element.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none";
  const block = document.createElement("div");
  block.setAttribute(BLOCK_ATTRIBUTE, label || "3D stage");
  block.style.cssText = BOX_STYLE;
  const slots: Slot[] = keys.map((key) => {
    const box = document.createElement("div");
    box.setAttribute(KEY_ATTRIBUTE, key.label);
    box.style.cssText = BOX_STYLE;
    if (key.text === undefined) return { key, box };
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", key.text);
    if (key.color === undefined) return { key, box };
    box.setAttribute(TYPE_FIT_ATTRIBUTE, "");
    const text = document.createElement("div");
    text.setAttribute(THREE_TEXT_ATTRIBUTE, "");
    text.setAttribute("aria-hidden", "true");
    text.style.cssText = TEXT_STYLE;
    text.style.color = key.color;
    text.textContent = key.text;
    box.append(text);
    return { key, box, text };
  });
  let attached: HTMLElement[] = [];

  return {
    element,
    place(camera, { width, height }) {
      const stage = { x: 0, y: 0, width, height };
      const placed = slots.flatMap((slot) => {
        const rect = shown(slot.key.object) ? projectBox(slot.key.object, camera, stage) : undefined;
        return rect === undefined || rect.width <= 0 || rect.height <= 0 ? [] : [{ slot, rect }];
      });
      const around = union(placed.map(({ rect }) => rect));
      if (around !== undefined) setBox(block, around);
      for (const { slot, rect } of placed) setBox(slot.box, rect);
      // Only what is on screen is in the DOM.
      const next = [...(around === undefined ? [] : [block]), ...placed.map(({ slot }) => slot.box)];
      if (next.length !== attached.length || next.some((el, i) => el !== attached[i])) {
        element.replaceChildren(...next);
        attached = next;
      }
      for (const { slot, rect } of placed) if (slot.text !== undefined) fitText(slot.text, slot.box, rect);
    },
  };
}
