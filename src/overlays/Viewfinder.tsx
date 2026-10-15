// The viewfinder frame (`"frame": { "style": "viewfinder" }`): hairline corner
// brackets, a label and the timecode along the top, the scene counter, a
// filling ruler and the spec tag along the bottom. Drawn over the scenes in
// the shown scene's muted ink, so it switches with the scene's ground on the
// cut. It is chrome: its text carries the caption marker, so readability and
// the opening check leave it out, while safe area and contrast still judge it.

import type { CSSProperties } from "react";
import { CAPTION_ATTRIBUTE } from "../checks/measure";
import type { Timeline } from "../engine/timeline";
import type { Aspect, Rect } from "../layout/frame";
import { typeCss } from "../layout/type";
import type { StoryboardFrame, StoryboardScene } from "../storyboard/types";
import type { Theme } from "../theme/types";
import { BRACKET_PX, VIEWFINDER_LINE_PX, viewfinderLayout, type ViewfinderLayout } from "./viewfinderLayout";
import { rulerFill, rulerTicks, sceneCounter, specTag, timecode, viewfinderChars, viewfinderOpacity } from "./viewfinderText";

export const VIEWFINDER_ATTRIBUTE = "data-viewfinder";

export interface ViewfinderProps {
  frameSpec: StoryboardFrame;
  /** The storyboard's scenes, and the index of the one that reads as on screen. */
  scenes: readonly Pick<StoryboardScene, "id" | "frameLabel">[];
  sceneIndex: number;
  /** The shown scene's theme: the viewfinder takes its ink. */
  theme: Theme;
  aspect: Aspect;
  timeline: Timeline;
  frame: number;
}

/** The viewfinder's layout for a storyboard's `frame` (see `viewfinderLayout`), sized to the texts it will show. */
export function storyboardViewfinderLayout(theme: Theme, frameSpec: StoryboardFrame, scenes: ViewfinderProps["scenes"], aspect: Aspect, fps: number): ViewfinderLayout {
  return viewfinderLayout(theme, aspect, viewfinderChars(frameSpec, scenes, aspect, fps));
}

/** The texts the viewfinder draws at `frame`: label, timecode, scene counter, spec (each when shown). */
export function viewfinderTexts(props: Omit<ViewfinderProps, "theme">): { label?: string; timecode?: string; counter: string; spec?: string } {
  const { frameSpec, scenes, sceneIndex, aspect, timeline, frame } = props;
  return {
    ...(frameSpec.label !== undefined && { label: frameSpec.label.toUpperCase() }),
    ...(frameSpec.showTimecode !== false && { timecode: timecode(frame, timeline.fps) }),
    counter: sceneCounter(sceneIndex, scenes[sceneIndex]!),
    ...(frameSpec.showSpec !== false && { spec: specTag(aspect, timeline.fps) }),
  };
}

/** The ruler: a faint hairline, the filled part over it, and a tick at every scene start and the end. */
function Ruler({ ink, fill, ticks, tickHeight, style }: { ink: string; fill: number; ticks: readonly number[]; tickHeight: number; style: CSSProperties }) {
  const mark: CSSProperties = { position: "absolute", backgroundColor: ink };
  return (
    <div style={style}>
      <div style={{ ...mark, left: 0, right: 0, top: "50%", height: VIEWFINDER_LINE_PX, opacity: 0.5 }} />
      <div style={{ ...mark, left: 0, top: "50%", width: `${fill * 100}%`, height: 2 * VIEWFINDER_LINE_PX, marginTop: -VIEWFINDER_LINE_PX / 2 }} />
      {ticks.map((at, i) => (
        <div key={i} style={{ ...mark, left: `${at * 100}%`, top: `calc(50% - ${tickHeight / 2}px)`, width: VIEWFINDER_LINE_PX, height: tickHeight, marginLeft: -VIEWFINDER_LINE_PX / 2 }} />
      ))}
    </div>
  );
}

export function Viewfinder(props: ViewfinderProps) {
  const { frameSpec, scenes, theme, aspect, timeline, frame } = props;
  const layout = storyboardViewfinderLayout(theme, frameSpec, scenes, aspect, timeline.fps);
  const ink = theme.colors.textMuted;
  const texts = viewfinderTexts(props);
  const line = `${VIEWFINDER_LINE_PX}px solid ${ink}`;
  const { box } = layout;
  const bracket = (vertical: "top" | "bottom", side: "left" | "right"): CSSProperties => ({
    position: "absolute",
    width: BRACKET_PX,
    height: BRACKET_PX,
    boxSizing: "border-box",
    top: vertical === "top" ? box.y : box.y + box.height - BRACKET_PX,
    left: side === "left" ? box.x : box.x + box.width - BRACKET_PX,
    [vertical === "top" ? "borderTop" : "borderBottom"]: line,
    [side === "left" ? "borderLeft" : "borderRight"]: line,
  });
  // Two texts a row: the second flush right, on the first line when both fit, else on the second.
  const row = (rect: Rect): CSSProperties => ({
    position: "absolute",
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    alignContent: "flex-start",
    columnGap: layout.gap,
    whiteSpace: "nowrap",
  });
  const textLine: CSSProperties = { height: layout.lineHeight, display: "flex", alignItems: "center" };
  // On a two-line row the second text takes the whole second line, flush right.
  const flushRight = (rect: Rect): CSSProperties => ({ ...textLine, marginLeft: "auto", ...(rect.height > layout.lineHeight && { width: "100%", justifyContent: "flex-end" }) });
  const ruler = { ink, fill: rulerFill(frame, timeline), ticks: rulerTicks(timeline), tickHeight: Math.round(layout.lineHeight / 2) };
  return (
    <div
      {...{ [VIEWFINDER_ATTRIBUTE]: "", [CAPTION_ATTRIBUTE]: "" }}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        color: ink,
        fontFamily: theme.fonts.mono,
        ...typeCss(theme.type.eyebrow[aspect]),
        opacity: viewfinderOpacity(frame, timeline.fps),
      }}
    >
      <div style={bracket("top", "left")} />
      <div style={bracket("top", "right")} />
      <div style={bracket("bottom", "left")} />
      <div style={bracket("bottom", "right")} />
      <div style={row(layout.top)}>
        {texts.label !== undefined && <span style={textLine}>{texts.label}</span>}
        {texts.timecode !== undefined && <span style={flushRight(layout.top)}>{texts.timecode}</span>}
      </div>
      {layout.ruler !== undefined && (
        <Ruler {...ruler} style={{ position: "absolute", left: layout.ruler.x, top: layout.ruler.y, width: layout.ruler.width, height: layout.ruler.height }} />
      )}
      <div style={row(layout.bottom)}>
        <span style={textLine}>{texts.counter}</span>
        {layout.ruler === undefined && <Ruler {...ruler} style={{ position: "relative", flex: 1, alignSelf: "stretch" }} />}
        {texts.spec !== undefined && <span style={flushRight(layout.bottom)}>{texts.spec}</span>}
      </div>
    </div>
  );
}
