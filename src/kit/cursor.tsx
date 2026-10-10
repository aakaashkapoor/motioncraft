// A scripted cursor (the owner's reference: a cursor moves to "Approve" and
// clicks it). An arrow pointer fades in `travelPx` up and to the right of its
// target, moves onto it over the `cursor` token (600 ms, ease in-out, on a
// slight arc, as a hand moves), and clicks at `clickMs`: it presses to 0.92
// and comes back to 1 while a soft ring grows and fades. The click is
// the state change: a component reads `clicked` and resolves its UI. Then the
// cursor fades away. It draws at its parent's origin: put it in a positioned
// box at the point it should land on, inside the element it targets, so it
// lands exactly where that element is drawn.

import { withAlpha } from "../theme/color";
import type { Theme } from "../theme/types";
import { fade, tween } from "./motion";

export interface CursorTiming {
  /** When it starts fading in, waiting at its start. */
  appearMs: number;
  /** [start, end] of the move onto the target. */
  moveMs: [number, number];
  /** The click: the state change. */
  clickMs: number;
  /** [start, end] of its fade out, once the ring has gone. */
  leaveMs: [number, number];
}

export interface CursorState {
  opacity: number;
  /** The pointer's tip, from the target point, in px. */
  x: number;
  y: number;
  /** The press: `pressScale` at the click, back to 1 over `pressMs`. */
  scale: number;
  /** The click's ring around the target point: its diameter in px and its opacity (0 before the click and once it has faded). */
  ring: { size: number; opacity: number };
  /** True from the click on. */
  clicked: boolean;
}

/** Where the cursor waits before it moves: up and to the right of its target, this many degrees above the horizontal. */
const FROM_DEG = 35;
const FROM = { x: Math.cos((FROM_DEG * Math.PI) / 180), y: -Math.sin((FROM_DEG * Math.PI) / 180) };
/** How far the path bows out from a straight line, as a share of the distance. */
const ARC = 0.12;
/** The ring's diameter as the click lands, as a share of its full size. */
const RING_START_SCALE = 0.3;
/** The pointer's drawing: tip at (0, 0), in a box of `VIEW` units. */
const POINTER = "M0 0 L0 17 L4.2 13.2 L7 19.6 L9.8 18.4 L7.1 12.1 L12.6 12.1 Z";
const VIEW = { x: -1.5, y: -1.5, width: 16, height: 23 };

const round = (n: number) => Math.round(n * 100) / 100 || 0;

/** The cursor's moments for a click at `clickMs`. */
export function cursorTiming(theme: Theme, clickMs: number): CursorTiming {
  const { cursor, fx, beat } = theme.motion;
  const moveStart = clickMs - cursor.ms;
  const leave = clickMs + Math.max(cursor.ringMs, beat.ms);
  return { appearMs: moveStart - fx.ms, moveMs: [moveStart, clickMs], clickMs, leaveMs: [leave, leave + fx.ms] };
}

/** The cursor `ms` into the scene, for a click at `clickMs`. */
export function cursorAt(theme: Theme, ms: number, clickMs: number): CursorState {
  const { cursor, fx } = theme.motion;
  const t = cursorTiming(theme, clickMs);
  const opacity = fade(fx, ms - t.appearMs) * (1 - fade(fx, ms - t.leaveMs[0]));
  const along = fade(cursor, ms - t.moveMs[0]);
  // Straight in from the start, bowed out by the arc, which is 0 at both ends.
  const bow = ARC * cursor.travelPx * Math.sin(Math.PI * along);
  const rest = 1 - along;
  const x = FROM.x * cursor.travelPx * rest - FROM.y * bow;
  const y = FROM.y * cursor.travelPx * rest + FROM.x * bow;
  const clicked = ms >= clickMs;
  const press = { ms: cursor.pressMs, curve: fx.curve };
  const scale = clicked ? cursor.pressScale + (1 - cursor.pressScale) * tween(press, ms - clickMs) : 1;
  const grown = clicked ? fade({ ms: cursor.ringMs, curve: fx.curve }, ms - clickMs) : 0;
  const ring = { size: cursor.ringPx * (RING_START_SCALE + (1 - RING_START_SCALE) * grown), opacity: clicked ? cursor.ringOpacity * (1 - grown) : 0 };
  return { opacity, x, y, scale, ring, clicked };
}

export interface CursorProps {
  theme: Theme;
  /** Milliseconds into the scene, on the clock `clickMs` counts on. */
  ms: number;
  clickMs: number;
}

export function Cursor({ theme, ms, clickMs }: CursorProps) {
  const state = cursorAt(theme, ms, clickMs);
  if (state.opacity <= 0) return null;
  const { colors, cardShadow } = theme;
  const height = theme.motion.cursor.sizePx;
  const width = (height * VIEW.width) / VIEW.height;
  const unit = height / VIEW.height;
  const tip = { x: -VIEW.x * unit, y: -VIEW.y * unit };
  return (
    <div data-cursor="" style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, opacity: round(state.opacity), pointerEvents: "none", zIndex: 1 }}>
      {state.ring.opacity > 0 && (
        <div
          data-cursor-ring=""
          style={{
            position: "absolute",
            left: round(-state.ring.size / 2),
            top: round(-state.ring.size / 2),
            width: round(state.ring.size),
            height: round(state.ring.size),
            borderRadius: "50%",
            // The ink, not the accent: the ring must show on an accent button too.
            backgroundColor: colors.text,
            opacity: round(state.ring.opacity),
          }}
        />
      )}
      <svg
        width={round(width)}
        height={height}
        viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
        style={{
          position: "absolute",
          left: round(-tip.x),
          top: round(-tip.y),
          overflow: "visible",
          transformOrigin: `${round(tip.x)}px ${round(tip.y)}px`,
          transform: `translate(${round(state.x)}px, ${round(state.y)}px) scale(${round(state.scale)})`,
          filter: `drop-shadow(0 ${round(unit)}px ${round(unit * 2)}px ${withAlpha(colors.shadow, cardShadow.opacity)})`,
        }}
      >
        <path d={POINTER} fill={colors.text} stroke={colors.surface} strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </div>
  );
}
