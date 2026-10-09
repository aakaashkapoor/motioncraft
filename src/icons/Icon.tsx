// A bundled line icon drawn as inline SVG: no network, no icon font. Names come
// from a curated list covering common deck needs; an unknown name throws.

import { createElement } from "react";
import { ICON_NODES } from "./nodes";

export type IconName = keyof typeof ICON_NODES;

/** Every icon name `Icon` accepts. */
export const ICON_NAMES = Object.keys(ICON_NODES) as IconName[];

export function isIconName(name: string): name is IconName {
  return Object.hasOwn(ICON_NODES, name);
}

export interface IconProps {
  /** One of `ICON_NAMES`. Unknown names throw. */
  name: string;
  /** Width and height in px. Default 24. */
  size?: number;
  /** Stroke color. Default `currentColor`. */
  color?: string;
  /** Stroke width in icon units (the icon is 24 units wide). Default 2. */
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = "currentColor", strokeWidth = 2 }: IconProps) {
  if (!isIconName(name)) {
    throw new Error(`Unknown icon "${name}". Known icons: ${ICON_NAMES.join(", ")}.`);
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      {ICON_NODES[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
