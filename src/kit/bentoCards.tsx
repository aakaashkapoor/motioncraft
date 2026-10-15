// BentoGrid's card faces: what each kind of card draws inside its rounded
// box, all in the card's ink, and its own motion (the count, the trend line,
// the ring, the bars, the toggle, the keyframes), which starts as the card
// lands and is done by 1.5 s. Boxes come from `bentoGridLayout`.

import type { CSSProperties, ReactNode } from "react";
import { SERIF_FAMILY } from "../render/fontFaces";
import { glyphPad, typeCss } from "../layout/type";
import { mixColors, withAlpha } from "../theme/color";
import { AA_CONTRAST } from "../theme/contrast";
import { fadeWithin } from "../theme/field";
import type { Theme, TypeSpec } from "../theme/types";
import type { BarsParts, BentoBars, BentoCard, BentoQuote, BentoRing, BentoStat, BentoTitle, CardParts, Part, QuoteParts, RingParts, StatParts, TitleParts } from "./bentoGridPlan";
import { countUpText } from "./DonutChart";
import { fade, tween } from "./motion";

export interface FaceProps {
  theme: Theme;
  /** The card's fill and its ink. */
  color: string;
  ink: string;
  /** Scene ms, when the card's own motion starts, and how long it lasts. */
  ms: number;
  start: number;
  dur: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100 || 0;

/** Text set in `spec`, its first line's glyphs inside `box`. */
const textAt = (box: Part, spec: TypeSpec, family: string): CSSProperties => ({
  position: "absolute",
  left: box.x,
  top: r2(box.y + glyphPad(spec)),
  width: box.width,
  fontFamily: family,
  ...typeCss(spec),
});

/** The card's own motion, 0..1: the count token's curve over `dur`. */
const progressOf = (p: FaceProps, delay = 0, dur = p.dur) => fade({ ms: Math.max(1, dur), curve: p.theme.motion.count.curve }, p.ms - p.start - delay);

/** Labels: the ink, faded toward the fill only as far as it keeps AA. */
const mutedInk = (p: FaceProps) => fadeWithin(p.ink, p.color, 0.25, [p.color], AA_CONTRAST);

function Label({ p, box, spec, text }: { p: FaceProps; box: Part | undefined; spec: TypeSpec; text: string | undefined }) {
  if (box === undefined || text === undefined) return null;
  // Set at the foot of its box, so a line more than estimated grows up into the card, never out of it.
  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div data-bento-label="" style={{ fontFamily: p.theme.fonts.body, ...typeCss(spec), paddingBottom: glyphPad(spec), color: mutedInk(p) }}>
        {text}
      </div>
    </div>
  );
}

function Stat({ p, card, parts }: { p: FaceProps; card: BentoStat; parts: StatParts }) {
  const k = progressOf(p);
  const { chart } = parts;
  let line: ReactNode = null;
  if (chart !== undefined && card.trend !== undefined) {
    const sw = Math.max(4, Math.round(chart.height * 0.045));
    const dot = sw * 1.6;
    const lo = Math.min(...card.trend);
    const hi = Math.max(...card.trend);
    const n = card.trend.length;
    const pts = card.trend.map((v, i) => ({
      x: r2(dot + ((chart.width - 2 * dot) * i) / (n - 1)),
      y: r2(dot + (chart.height - 2 * dot) * (hi === lo ? 0.5 : 1 - (v - lo) / (hi - lo))),
    }));
    const path = pts.map((q, i) => `${i === 0 ? "M" : "L"} ${q.x} ${q.y}`).join(" ");
    const last = pts.at(-1)!;
    const dotIn = fade(p.theme.motion.fx, p.ms - (p.start + p.dur - p.theme.motion.fx.ms));
    line = (
      <svg data-bento-trend="" width={chart.width} height={chart.height} style={{ position: "absolute", left: chart.x, top: chart.y, overflow: "visible" }}>
        <path d={`${path} L ${last.x} ${chart.height} L ${pts[0]!.x} ${chart.height} Z`} fill={p.ink} opacity={r2(0.12 * k)} />
        <path d={path} pathLength={1} fill="none" stroke={p.ink} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 1" strokeDashoffset={r2(1 - k)} />
        <circle cx={last.x} cy={last.y} r={r2(dot)} fill={p.ink} opacity={r2(dotIn)} />
      </svg>
    );
  }
  return (
    <>
      <div data-bento-value="" style={{ ...textAt(parts.value, parts.valueSpec, p.theme.fonts.display), fontWeight: p.theme.weights.heavy, color: p.ink, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {countUpText(card.value, k)}
      </div>
      <Label p={p} box={parts.label} spec={parts.labelSpec} text={card.label} />
      {line}
    </>
  );
}

function Title({ p, card, parts }: { p: FaceProps; card: BentoTitle; parts: TitleParts }) {
  const { toggle } = parts;
  let toggleEl: ReactNode = null;
  if (toggle !== undefined) {
    const on = fade(p.theme.motion.fx, p.ms - p.start);
    const slide = tween(p.theme.motion.pop, p.ms - p.start);
    const inset = Math.max(4, Math.round(toggle.height * 0.1));
    const knob = toggle.height - 2 * inset;
    toggleEl = (
      <div
        data-bento-toggle=""
        style={{
          position: "absolute",
          left: toggle.x,
          top: toggle.y,
          width: toggle.width,
          height: toggle.height,
          borderRadius: toggle.height / 2,
          backgroundColor: withAlpha(p.ink, r2(on)),
          boxShadow: `inset 0 0 0 ${Math.max(3, Math.round(inset / 2))}px ${p.ink}`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: r2(inset + slide * (toggle.width - toggle.height)),
            top: inset,
            width: knob,
            height: knob,
            borderRadius: knob / 2,
            backgroundColor: mixColors(p.ink, p.color, on),
          }}
        />
      </div>
    );
  }
  return (
    <>
      <div data-bento-title="" style={{ ...textAt(parts.text, parts.textSpec, p.theme.fonts.display), fontWeight: Math.max(parts.textSpec.weight, p.theme.weights.bold), color: p.ink }}>
        {card.text}
      </div>
      {toggleEl}
    </>
  );
}

function Ring({ p, card, parts }: { p: FaceProps; card: BentoRing; parts: RingParts }) {
  const k = progressOf(p);
  const { ring, number } = parts;
  const d = ring.width;
  const sw = r2(d * 0.1);
  const radius = r2((d - sw) / 2);
  const swept = r2(card.percent * k);
  return (
    <>
      <svg data-bento-ring="" width={d} height={d} style={{ position: "absolute", left: ring.x, top: ring.y, transform: "rotate(-90deg)" }}>
        <circle cx={d / 2} cy={d / 2} r={radius} fill="none" stroke={withAlpha(p.ink, 0.2)} strokeWidth={sw} />
        {swept > 0 && <circle cx={d / 2} cy={d / 2} r={radius} fill="none" stroke={p.ink} strokeWidth={sw} strokeLinecap="round" pathLength={100} strokeDasharray={`${swept} 100`} />}
      </svg>
      <div data-bento-number="" style={{ ...textAt(number, parts.numberSpec, p.theme.fonts.display), fontWeight: p.theme.weights.heavy, color: p.ink, textAlign: "center", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {countUpText(`${card.percent}%`, k)}
      </div>
      <Label p={p} box={parts.label} spec={parts.labelSpec} text={card.label} />
    </>
  );
}

/** Bars start growing this far apart. */
const BAR_STAGGER_MS = 50;
/** The gap between bars, as a share of a bar's width. */
const BAR_GAP_SHARE = 0.35;

function Bars({ p, card, parts }: { p: FaceProps; card: BentoBars; parts: BarsParts }) {
  const { bars } = parts;
  const n = card.values.length;
  const max = Math.max(...card.values);
  const top = card.values.indexOf(max);
  const barW = bars.width / (n + (n - 1) * BAR_GAP_SHARE);
  const round = Math.min(barW / 2, p.theme.radius.sm);
  const grow = Math.max(1, p.dur - (n - 1) * BAR_STAGGER_MS);
  return (
    <>
      <Label p={p} box={parts.label} spec={parts.labelSpec} text={card.label} />
      {card.values.map((v, i) => {
        const h = r2(bars.height * (v / max) * progressOf(p, i * BAR_STAGGER_MS, grow));
        return (
          <div
            key={i}
            data-bento-bar={i}
            style={{
              position: "absolute",
              left: r2(bars.x + i * barW * (1 + BAR_GAP_SHARE)),
              top: r2(bars.y + bars.height - h),
              width: r2(barW),
              height: h,
              borderRadius: `${r2(round)}px ${r2(round)}px ${r2(round / 3)}px ${r2(round / 3)}px`,
              backgroundColor: i === top ? p.ink : mixColors(p.ink, p.color, 0.45),
            }}
          />
        );
      })}
    </>
  );
}

/** Where the keyframes sit along the track. */
const KEY_SHARES = [0.06, 0.34, 0.62, 0.94];

function Quote({ p, card, parts }: { p: FaceProps; card: BentoQuote; parts: QuoteParts }) {
  const { track } = parts;
  let trackEl: ReactNode = null;
  if (track !== undefined) {
    const { pop } = p.theme.motion;
    // The playhead sweeps on sineInOut; each keyframe pops as the playhead reaches it.
    const sweep = Math.max(1, p.dur - pop.ms);
    const head = tween({ ms: sweep, curve: "sineInOut" }, p.ms - p.start);
    const reach = (s: number) => (sweep * Math.acos(1 - 2 * s)) / Math.PI;
    const size = r2(Math.max(14, Math.min(32, track.height * 0.3, track.width / 12)));
    const mid = r2(track.height / 2);
    const pad = size;
    const xAt = (s: number) => r2(pad + (track.width - 2 * pad) * s);
    trackEl = (
      <svg data-bento-track="" width={track.width} height={track.height} style={{ position: "absolute", left: track.x, top: track.y, overflow: "visible" }}>
        <line x1={pad} x2={r2(track.width - pad)} y1={mid} y2={mid} stroke={withAlpha(p.ink, 0.35)} strokeWidth={3} strokeLinecap="round" />
        {KEY_SHARES.map((s, i) => {
          const scale = r2(Math.max(0, tween(pop, p.ms - p.start - reach(s))));
          return scale > 0 ? <rect key={i} x={-size / 2} y={-size / 2} width={size} height={size} rx={3} fill={p.ink} transform={`translate(${xAt(s)} ${mid}) rotate(45) scale(${scale})`} /> : null;
        })}
        <line x1={xAt(head * KEY_SHARES.at(-1)!)} x2={xAt(head * KEY_SHARES.at(-1)!)} y1={0} y2={r2(track.height)} stroke={p.ink} strokeWidth={4} strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <>
      <div data-bento-quote="" style={{ ...textAt(parts.text, parts.textSpec, `"${SERIF_FAMILY}", serif`), fontStyle: "italic", fontWeight: p.theme.weights.medium, letterSpacing: "normal", color: p.ink }}>
        {card.text}
      </div>
      {trackEl}
    </>
  );
}

/** A card's face: its kind's content, drawn in its ink. */
export function CardFace({ p, card, content }: { p: FaceProps; card: BentoCard; content: CardParts }) {
  if (card.kind === "stat" && content.kind === "stat") return <Stat p={p} card={card} parts={content} />;
  if (card.kind === "title" && content.kind === "title") return <Title p={p} card={card} parts={content} />;
  if (card.kind === "ring" && content.kind === "ring") return <Ring p={p} card={card} parts={content} />;
  if (card.kind === "bars" && content.kind === "bars") return <Bars p={p} card={card} parts={content} />;
  if (card.kind === "quote" && content.kind === "quote") return <Quote p={p} card={card} parts={content} />;
  return null;
}
