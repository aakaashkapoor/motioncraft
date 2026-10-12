// The Vox-style annotate gesture (HyperFrames vox-annotate): a held sentence
// arrives on `enter` in the headline role, centered; at 700 ms one phrase in
// it gets a hand-drawn mark in the accent (an underline, a loop around it, or
// a marker band behind it, drawn left to right), the phrase pops as the ink
// lands, a thin connector draws from the mark to a small mono note and the
// note, muted, fades up at its end. The sentence breaks where the text-layout
// estimate says, so the mark's line and place are known without the DOM; the
// mark is drawn inside the marked words' own span, stretched to their width,
// and the connector and note hang off the span's center.

import { drawPath } from "../engine/choreography";
import { contentArea } from "../layout/caption";
import { glyphPad, typeCss } from "../layout/type";
import { headlineColor } from "../theme/roles";
import { annotateErrors, annotateLayout, annotateTiming, connectorStroke, markStroke, type AnnotateData, type AnnotateStroke } from "./annotatePlan";
import { entering, useSceneTime } from "./frameContext";
import { arrive, exitOpacity, fade, pulse, tween } from "./motion";
import type { KitProps } from "./types";

export interface AnnotateProps extends KitProps, AnnotateData {}

/** The sentence rises this share of a line as it arrives. */
const RISE_SHARE = 0.4;
/** vox-annotate's connector eases out on power2 (cubic). */
const CONNECTOR_CURVE: [number, number, number, number] = [0.33, 1, 0.68, 1];

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places + 0;

/** A stroke `drawn` 0..1 of the way along, hidden until it starts (a round cap would leave a dot). */
function StrokePath({ stroke, drawn, color, opacity, part, cap = "round" }: { stroke: AnnotateStroke; drawn: number; color: string; opacity: number; part: "mark" | "connector"; cap?: "round" | "butt" }) {
  const dash = drawPath(drawn, stroke.length);
  return (
    <path
      {...{ [`data-annotate-${part}`]: "" }}
      d={stroke.d}
      fill="none"
      stroke={color}
      strokeWidth={stroke.width}
      strokeLinecap={cap}
      strokeLinejoin="round"
      strokeDasharray={dash.strokeDasharray}
      strokeDashoffset={round(dash.strokeDashoffset)}
      opacity={drawn > 0 ? opacity : 0}
    />
  );
}

export function Annotate(props: AnnotateProps) {
  const errors = annotateErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`Annotate: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, mark, markStyle = "underline", notePosition = "below", seed = 0 } = props;
  const area = slot ?? contentArea(theme, aspect);
  const layout = annotateLayout(theme, aspect, props, slot);
  const { spec, noteSpec, lines, markLine, markColumn, textBox, lineHeight, chars, note, connector } = layout;
  const timing = annotateTiming(theme);
  const { colors, fonts, motion, spacing } = theme;
  const time = useSceneTime(progress);
  const ms = entering(time).ms;
  const text = arrive(theme, ms, timing.sentence);
  const drawn = tween({ ms: timing.markMs, curve: motion.mark.curve }, ms - timing.mark);
  const linked = tween({ ms: timing.connectorMs, curve: CONNECTOR_CURVE }, ms - timing.connector);
  const shown = fade(motion.fx, ms - timing.note);
  const pop = round(1 + (motion.pop.scale - 1) * pulse(motion.pop, ms - timing.pop), 4);
  const highlight = markStyle === "highlight";
  const markText = mark.trim().replace(/\s+/g, " ");
  const seedKey = `${seed}:${mark}`;

  // The mark's box, relative to the marked words' span (which starts at `chars`): stretched to the span's real width.
  const box = layout.mark;
  const stroke = markStroke(theme, markStyle, box.width, box.height, spec, seedKey);
  const over = round(chars.x - box.x);
  const markSvg = (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${box.width} ${box.height}`}
      preserveAspectRatio="none"
      style={{ position: "absolute", left: -over, top: round(box.y - chars.y), width: `calc(100% + ${round(box.width - chars.width)}px)`, height: box.height, overflow: "visible" }}
    >
      <StrokePath stroke={stroke} drawn={drawn} color={colors.accent} opacity={highlight ? motion.mark.opacity : 1} part="mark" cap={highlight ? "butt" : "round"} />
    </svg>
  );

  // The connector and the note hang off the marked words at the top of their line: off their center, or off the
  // end the connector leaves from when it goes round another line, so it starts at the real words, not the estimate.
  const leaves = connector.via.length === 0 ? 0.5 : connector.from.x > chars.x + chars.width / 2 ? 1 : 0;
  const origin = { x: chars.x + chars.width * leaves, y: chars.y };
  const route = [connector.from, ...connector.via, connector.to].map((p) => ({ x: round(p.x - origin.x), y: round(p.y - origin.y) }));
  const link = connectorStroke(theme, route, seedKey);
  const pad = spacing.xs;
  const left = Math.min(...route.map((p) => p.x)) - pad;
  const top = Math.min(...route.map((p) => p.y)) - pad;
  const linkWidth = Math.max(...route.map((p) => p.x)) + pad - left;
  const linkHeight = Math.max(...route.map((p) => p.y)) + pad - top;
  const rig = (
    <span aria-hidden="true" style={{ position: "absolute", left: `${leaves * 100}%`, top: 0, width: 0, height: 0 }}>
      <svg
        viewBox={`${round(left)} ${round(top)} ${round(linkWidth)} ${round(linkHeight)}`}
        style={{ position: "absolute", left: round(left), top: round(top), width: round(linkWidth), height: round(linkHeight), overflow: "visible" }}
      >
        <StrokePath stroke={link} drawn={linked} color={colors.accent} opacity={1} part="connector" />
      </svg>
      <span
        data-annotate-note=""
        style={{
          opacity: round(shown, 4),
          transform: `translateY(${round((1 - shown) * spacing.xs)}px)`,
          position: "absolute",
          left: round(note.x - origin.x),
          top: round(note.y - origin.y),
          width: note.width,
          height: note.height,
          boxSizing: "border-box",
          padding: `${glyphPad(noteSpec)}px 0`,
          fontFamily: fonts.mono,
          ...typeCss(noteSpec),
          color: colors.textMuted,
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        {layout.noteLines.map((line, i) => (
          <span key={i} style={{ display: "block" }}>
            {line}
          </span>
        ))}
      </span>
    </span>
  );

  return (
    <div style={{ position: "absolute", left: area.x, top: area.y, width: area.width, height: area.height, opacity: exitOpacity(theme, time, motion.enter.ms) }}>
      <div
        data-block="Annotate"
        style={{
          position: "absolute",
          left: textBox.x - area.x,
          top: textBox.y - area.y,
          width: textBox.width,
          height: textBox.height,
          boxSizing: "border-box",
          padding: `${glyphPad(spec)}px 0`,
          opacity: round(text.opacity, 4),
          transform: `translateY(${round((1 - text.move) * RISE_SHARE * lineHeight)}px)`,
          fontFamily: fonts.display,
          ...typeCss(spec),
          color: headlineColor(theme),
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        {lines.map((line, i) =>
          i !== markLine ? (
            <div key={i} style={{ height: lineHeight }}>
              {line}
            </div>
          ) : (
            <div key={i} style={{ height: lineHeight }}>
              {line.slice(0, markColumn)}
              <span data-annotate-words="" style={{ position: "relative", display: "inline-block", transform: `scale(${pop})`, transformOrigin: "center" }}>
                {highlight && markSvg}
                <span style={{ position: "relative" }}>{markText}</span>
                {!highlight && markSvg}
                {rig}
              </span>
              {line.slice(markColumn + markText.length)}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
