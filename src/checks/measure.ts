// Measures the rendered frame in the browser. Runs inside the render page (see
// `window.motioncraft.measureFrame`); the rules that judge the numbers live in
// the other files of this folder and run in Node.

import type { Rect } from "../layout/frame";
import { union } from "./geometry";
import type { FrameMeasurement, MeasuredKey, MeasuredText } from "./types";

/** Marks the burned-in narration caption, so readability can leave it out. */
export const CAPTION_ATTRIBUTE = "data-caption";
/** Marks a non-text element that must stay in the safe area; the value labels it. */
export const KEY_ATTRIBUTE = "data-key-element";

function toRect(box: DOMRect, origin: DOMRect): Rect {
  return { x: box.left - origin.left, y: box.top - origin.top, width: box.width, height: box.height };
}

/** The element's padding box: what `overflow` clips its content to. */
function paddingBox(el: Element, origin: DOMRect): Rect {
  const box = el.getBoundingClientRect();
  return { x: box.left - origin.left + el.clientLeft, y: box.top - origin.top + el.clientTop, width: el.clientWidth, height: el.clientHeight };
}

/** `el` and its ancestors up to and including `root`, nearest first. */
function lineage(el: Element, root: Element): Element[] {
  const chain: Element[] = [];
  for (let node: Element | null = el; node !== null; node = node.parentElement) {
    chain.push(node);
    if (node === root) break;
  }
  return chain;
}

function clipsContent(el: Element): boolean {
  const { overflowX, overflowY } = getComputedStyle(el);
  return overflowX !== "visible" || overflowY !== "visible";
}

function effectiveOpacity(chain: readonly Element[]): number {
  if (getComputedStyle(chain[0]!).visibility !== "visible") return 0;
  return chain.reduce((product, node) => product * parseFloat(getComputedStyle(node).opacity), 1);
}

function isTransparent(css: string): boolean {
  return css === "transparent" || /^rgba\(.*,\s*0\)$/.test(css);
}

/**
 * Background colors under `el` at the center of `rect`, topmost first: whatever
 * is painted there, including siblings drawn beneath it. Falls back to the
 * element's ancestors when the point is off screen.
 */
function backgroundsUnder(el: Element, rect: Rect, origin: DOMRect, chain: readonly Element[]): string[] {
  const x = origin.left + rect.x + rect.width / 2;
  const y = origin.top + rect.y + rect.height / 2;
  const stack = document.elementsFromPoint(x, y);
  const index = stack.indexOf(el);
  const layers = index >= 0 ? stack.slice(index) : [...chain];
  return layers.map((node) => getComputedStyle(node).backgroundColor).filter((css) => !isTransparent(css));
}

/** Box around a text node's rendered lines, or undefined if it is not laid out. */
function textRect(node: Text, origin: DOMRect): Rect | undefined {
  const range = document.createRange();
  range.selectNodeContents(node);
  const lines = [...range.getClientRects()].filter((box) => box.width > 0 && box.height > 0);
  return union(lines.map((box) => toRect(box, origin)));
}

function measureText(el: Element, root: Element, origin: DOMRect): MeasuredText | undefined {
  const nodes = [...el.childNodes].filter((node): node is Text => node instanceof Text && node.data.trim() !== "");
  if (nodes.length === 0) return undefined;
  const rect = union(nodes.map((node) => textRect(node, origin)).filter((r): r is Rect => r !== undefined));
  if (rect === undefined) return undefined;

  const chain = lineage(el, root);
  return {
    text: nodes.map((node) => node.data).join(" ").replace(/\s+/g, " ").trim(),
    rect,
    clips: chain.filter(clipsContent).map((node) => paddingBox(node, origin)),
    opacity: effectiveOpacity(chain),
    color: getComputedStyle(el).color,
    backgrounds: backgroundsUnder(el, rect, origin, chain),
    caption: el.closest(`[${CAPTION_ATTRIBUTE}]`) !== null,
  };
}

function measureKey(el: Element, root: Element, origin: DOMRect): MeasuredKey {
  return {
    label: el.getAttribute(KEY_ATTRIBUTE) || el.tagName.toLowerCase(),
    rect: toRect(el.getBoundingClientRect(), origin),
    opacity: effectiveOpacity(lineage(el, root)),
  };
}

/** Measures every text element and key element in `root`, in coordinates relative to `root`. */
export function measureFrame(root: Element): FrameMeasurement {
  const origin = root.getBoundingClientRect();
  const elements = [root, ...root.querySelectorAll("*")];
  return {
    texts: elements.map((el) => measureText(el, root, origin)).filter((t): t is MeasuredText => t !== undefined),
    keys: [...root.querySelectorAll(`[${KEY_ATTRIBUTE}]`)].map((el) => measureKey(el, root, origin)),
  };
}
