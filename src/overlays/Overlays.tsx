// The overlay layer: every overlay whose scene range is on screen, drawn above
// the scenes, the shared morph and the captions. It sits outside the camera
// and the scene presentations, so it never moves with either.

import { CAPTION_ATTRIBUTE } from "../checks/measure";
import type { Timeline } from "../engine/timeline";
import { frameSize, type Aspect } from "../layout/frame";
import { typeCss } from "../layout/type";
import { DEFAULT_OVERLAY_CORNER, type StoryboardOverlay } from "../storyboard/types";
import { withAlpha } from "../theme/color";
import type { Theme } from "../theme/types";
import { OVERLAY_PILL_ALPHA, overlayPadding, overlayRegion, overlaySize } from "./layout";
import { overlayOpacity, overlayRanges } from "./timing";

export const OVERLAY_ATTRIBUTE = "data-overlay";
// The pill also carries the caption marker: it is chrome, not scene content, so
// its words do not count toward readability and it never makes a blank opening look filled.

export interface OverlaysProps {
  overlays: readonly StoryboardOverlay[];
  sceneIds: readonly string[];
  theme: Theme;
  aspect: Aspect;
  timeline: Timeline;
  frame: number;
}

export function Overlays({ overlays, sceneIds, theme, aspect, timeline, frame }: OverlaysProps) {
  const spec = theme.type.eyebrow[aspect];
  const pad = overlayPadding(theme);
  return (
    <>
      {overlays.map((overlay, i) => {
        const opacity = overlayOpacity(overlayRanges(overlay, sceneIds, timeline), frame, timeline);
        if (opacity === 0) return null;
        const corner = overlay.corner ?? DEFAULT_OVERLAY_CORNER;
        const { height } = overlaySize(theme, aspect, overlay.text);
        const region = overlayRegion(theme, aspect, corner, height);
        return (
          <div
            key={i}
            {...{ [OVERLAY_ATTRIBUTE]: "", [CAPTION_ATTRIBUTE]: "" }}
            style={{
              position: "absolute",
              top: region.y,
              ...(corner.endsWith("left") ? { left: region.x } : { right: frameSize(aspect).width - region.x - region.width }),
              height,
              boxSizing: "border-box",
              padding: `${pad.y}px ${pad.x}px`,
              display: "flex",
              alignItems: "center",
              whiteSpace: "nowrap",
              borderRadius: theme.radius.sm,
              backgroundColor: withAlpha(theme.colors.surface, OVERLAY_PILL_ALPHA),
              color: theme.colors.textMuted,
              textTransform: "uppercase",
              fontFamily: theme.fonts.body,
              ...typeCss(spec),
              opacity,
            }}
          >
            {overlay.text}
          </div>
        );
      })}
    </>
  );
}
