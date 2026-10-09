// Measures the rendered frame in the browser. Runs inside the render page (see
// `window.motioncraft.measureFrame`); the rules that judge the numbers live in
// the other files of this folder and run in Node.

import { SHOT_ATTRIBUTE } from "../camera/attributes";
import type { Rect } from "../layout/frame";
import { TYPE_FIT_ATTRIBUTE } from "../layout/type";
import { union } from "./geometry";
import type { FrameMeasurement, MeasuredBlock, MeasuredKey, MeasuredText } from "./types";

/** Marks the burned-in narration caption, so readability can leave it out. */
export const CAPTION_ATTRIBUTE = "data-caption";
/** Marks a non-text element that must stay in the safe area; the value labels it. */
export const KEY_ATTRIBUTE = "data-key-element";
/** Marks a kit component's visual block, for the centering check; the value labels it. */
export const BLOCK_ATTRIBUTE = "data-block";

function toRect(box: DOMRect, origin: DOMRect): Rect {
  return { x: box.left - origin.left, y: box.top - origin.top, width: box.width, height: box.height };
}

/** The element's padding box on screen: what `overflow` clips its content to. */
function paddingBox(el: Element, origin: DOMRect): Rect {
  const box = el.getBoundingClientRect();
  // Client sizes are in the element's own px; transforms (a docked frame, the camera) scale them on screen.
  const scale = el instanceof HTMLElement && el.offsetWidth > 0 ? box.width / el.offsetWidth : 1;
  return {
    x: box.left - origin.left + el.clientLeft * scale,
    y: box.top - origin.top + el.clientTop * scale,
    width: el.clientWidth * scale,
    height: el.clientHeight * scale,
  };
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

/**
 * `{ outOfShot: true }` when `el` is in a camera world on a shot and `rect`
 * misses the shot's box on screen; nothing otherwise.
 */
function shotState(el: Element, rect: Rect): { outOfShot?: true } {
  const value = el.closest(`[${SHOT_ATTRIBUTE}]`)?.getAttribute(SHOT_ATTRIBUTE);
  if (value === undefined || value === null) return {};
  const [x = 0, y = 0, width = 0, height = 0] = value.split(" ").map(Number);
  const meets = rect.x < x + width && x < rect.x + rect.width && rect.y < y + height && y < rect.y + rect.height;
  return meets ? {} : { outOfShot: true };
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
    fontSize: parseFloat(getComputedStyle(el).fontSize),
    fitted: el.closest(`[${TYPE_FIT_ATTRIBUTE}]`) !== null,
    ...shotState(el, rect),
  };
}

function measureKey(el: Element, root: Element, origin: DOMRect): MeasuredKey {
  const rect = toRect(el.getBoundingClientRect(), origin);
  return {
    label: el.getAttribute(KEY_ATTRIBUTE) || el.tagName.toLowerCase(),
    rect,
    opacity: effectiveOpacity(lineage(el, root)),
    ...shotState(el, rect),
  };
}

function measureBlock(el: Element, root: Element, origin: DOMRect): MeasuredBlock {
  const rect = toRect(el.getBoundingClientRect(), origin);
  return {
    label: el.getAttribute(BLOCK_ATTRIBUTE) || el.tagName.toLowerCase(),
    rect,
    opacity: effectiveOpacity(lineage(el, root)),
    caption: el.closest(`[${CAPTION_ATTRIBUTE}]`) !== null,
    ...shotState(el, rect),
  };
}

/** Blocks not nested in another block: a window's own content is part of the window. */
function outermostBlocks(root: Element): Element[] {
  return [...root.querySelectorAll(`[${BLOCK_ATTRIBUTE}]`)].filter((el) => !el.parentElement?.closest(`[${BLOCK_ATTRIBUTE}]`));
}

/** Measures every text element, key element and outermost block in `root`, in coordinates relative to `root`. */
export function measureFrame(root: Element): FrameMeasurement {
  const origin = root.getBoundingClientRect();
  const elements = [root, ...root.querySelectorAll("*")];
  return {
    texts: elements.map((el) => measureText(el, root, origin)).filter((t): t is MeasuredText => t !== undefined),
    keys: [...root.querySelectorAll(`[${KEY_ATTRIBUTE}]`)].map((el) => measureKey(el, root, origin)),
    blocks: outermostBlocks(root).map((el) => measureBlock(el, root, origin)),
  };
}
