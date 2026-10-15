// A countdown beat: one huge high-contrast serif numeral at a time, hard-cut
// from number to number, with a thin hairline ring that draws around it over
// its step (3, 2, 1 at 600 ms each). Drawn in the scene's ink, so it reads on
// every palette ground. The scene must be long enough to count it out.

import { useContext } from "react";
import { TEXT_PIECES_ATTRIBUTE, TYPE_FIT_ATTRIBUTE } from "../layout/type";
import { SERIF_FAMILY } from "../render/fontFaces";
import { giantFace } from "./giantTypeFaces";
import { countdownAt, countdownEndMs, countdownErrors, countdownLayout, countdownSpec, LINE_EM, RING_STROKE_PX } from "./countdownPlan";
import { SceneClockContext, useSceneTime } from "./frameContext";
import { exitOpacity } from "./motion";
import type { KitProps } from "./types";

export interface CountdownProps extends KitProps {
  /** The number to start from, 1-9. Default 3. */
  from?: number;
  /** The number to end on, 1-9, not above `from`. Default 1. */
  to?: number;
  /** How long each number stays, 300-1500 ms. Default 600. */
  stepMs?: number;
}

/** The ring is the scene's ink at this opacity. */
const RING_ALPHA = 0.7;

const r2 = (n: number) => Math.round(n * 100) / 100 || 0;

export function Countdown(props: CountdownProps) {
  const clock = useContext(SceneClockContext);
  // Without a clock (a still, a test) the scene's length is not known: only the props are checked.
  const sceneMs = clock === undefined ? undefined : ((clock.frames + 0.5) * 1000) / clock.fps;
  const errors = countdownErrors(props as unknown as Record<string, unknown>, sceneMs);
  if (errors.length > 0) throw new Error(`Countdown: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot } = props;
  const spec = countdownSpec(props);
  const layout = countdownLayout(theme, aspect, slot);
  // Timed inside the scene, not an entrance: a settled opening scene still counts from the first number.
  const time = useSceneTime(progress);
  const { value, ring } = countdownAt(spec, time.ms);
  const { box, size, ringDiameter, ringCenter } = layout;
  // The display serif at the weight GiantType sets it in.
  const face = giantFace(theme.fonts.display, true);
  const radius = (ringDiameter - RING_STROKE_PX) / 2;

  return (
    <div data-block="Countdown" style={{ position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height, opacity: r2(exitOpacity(theme, time, countdownEndMs(spec))) }}>
      <>
        <svg
          data-countdown-ring={r2(ring)}
          width={ringDiameter}
          height={ringDiameter}
          viewBox={`0 0 ${ringDiameter} ${ringDiameter}`}
          style={{ position: "absolute", left: r2(ringCenter.x - ringDiameter / 2), top: r2(ringCenter.y - ringDiameter / 2), overflow: "visible" }}
        >
          <circle
            cx={ringDiameter / 2}
            cy={ringDiameter / 2}
            r={radius}
            fill="none"
            stroke={theme.colors.text}
            strokeOpacity={RING_ALPHA}
            strokeWidth={RING_STROKE_PX}
            pathLength={1}
            strokeDasharray={`${Math.round(ring * 1000) / 1000} 1`}
            transform={`rotate(-90 ${ringDiameter / 2} ${ringDiameter / 2})`}
          />
        </svg>
        <div
          data-countdown-number={value}
          // Sized to fill the area, not set on a ramp step.
          {...{ [TEXT_PIECES_ATTRIBUTE]: "", [TYPE_FIT_ATTRIBUTE]: "" }}
          style={{
            position: "absolute",
            left: 0,
            width: box.width,
            top: layout.numeralTop,
            textAlign: "center",
            fontFamily: `"${SERIF_FAMILY}", serif`,
            fontWeight: face.weight,
            fontSize: size,
            lineHeight: LINE_EM,
            fontVariantNumeric: "lining-nums",
            whiteSpace: "pre",
            color: theme.colors.text,
          }}
        >
          {value}
        </div>
      </>
    </div>
  );
}
