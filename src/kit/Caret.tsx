// The caret of typed text, in the accent: a block in a terminal, a thin bar in
// a text field. Sized in em, so it matches the text it follows.

import type { Theme } from "../theme/types";

export interface CaretProps {
  theme: Theme;
  shape: "block" | "bar";
  opacity: number;
  /** Extra data attributes that mark it, e.g. `{ "data-terminal-caret": 2 }`. */
  marker?: Record<string, string | number>;
}

export function Caret({ theme, shape, opacity, marker }: CaretProps) {
  return (
    <span
      data-caret=""
      {...marker}
      style={{
        display: "inline-block",
        width: shape === "block" ? "0.6em" : "0.12em",
        height: "1.15em",
        marginLeft: "0.08em",
        verticalAlign: "text-bottom",
        backgroundColor: theme.colors.accent,
        opacity,
      }}
    />
  );
}
