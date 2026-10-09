// Docks one kit component while another fills the rest of the content area.
// Made for shared-element transitions: a window that was the hero of the
// previous scene (same `shareId`) docks here while this scene's content
// arrives beside it. The docked component lays itself out in a dock area on
// its own full frame, scaled so it shows at a share of the frame width that
// never drops below 40% (design v3, section C). 9:16 docks it centered in a
// band at the top or bottom; 16:9 in a column at the side. When docking at
// that size would crowd out the content, it becomes an icon chip instead of a
// tiny window. The content lays out at its own size in the box that is left.

import { Icon, isIconName, type IconName } from "../icons";
import { contentArea, textColumn } from "../layout/caption";
import { frameSize, type Rect } from "../layout/frame";
import { AVG_CHAR_EM } from "../layout/textFit";
import { typeCss } from "../layout/type";
import type { Aspect } from "../storyboard/types";
import { withAlpha } from "../theme/color";
import type { Theme } from "../theme/types";
import { MotionDelay, useSceneTime, VisibleRectContext } from "./frameContext";
import { kit } from "./index";
import { exitOpacity, fade } from "./motion";
import type { SlotContent } from "./Slot";
import type { KitComponent, KitProps } from "./types";
import { windowWidth } from "./windowLayout";

export type PinnedCorner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export interface PinnedProps extends KitProps {
  /** The component docked in the corner, e.g. a window with a `shareId`. */
  pinned: SlotContent;
  /** The component filling the rest of the content area. */
  content?: SlotContent;
  /** Default `topRight`. In 9:16 only top or bottom counts: the dock is centered. */
  corner?: PinnedCorner;
  /**
   * `settled` (default): the pinned component is already in place on the first
   * frame, as when it arrives from the previous scene by a shared-element
   * morph. `animate`: it plays its own entrance.
   */
  arrive?: "settled" | "animate";
}

/**
 * Design v3: a docked element never shrinks below 40% of the frame width. It
 * docks at exactly that, so the content beside it keeps as much room as it can.
 */
export const MIN_PINNED_SHARE = 0.4;
/**
 * The dock area's height for its width, on the docked component's own frame:
 * room for a short chat at its body size in 9:16, about the content area's
 * height in 16:9.
 */
const DOCK_RATIO: Record<Aspect, number> = { "9:16": 0.9, "16:9": 0.55 };
/** Docking must leave the content at least this share of the area (its height in 9:16, its width in 16:9); otherwise a chip. */
const MIN_CONTENT_SHARE = 0.5;

export interface PinnedLayout {
  /** `dock`: the component itself, scaled. `chip`: an icon chip in its place. */
  mode: "dock" | "chip";
  /** How much the docked component's frame is scaled (1 for a chip). */
  scale: number;
  /** Where the docked component lays itself out on its own frame, in frame px. */
  dock: Rect;
  /** The box the docked element (or the chip) fills, in frame px. */
  pinned: Rect;
  /** The box for the main content, in frame px. */
  content: Rect;
  /** The chip's label, cut to fit the chip (empty when docked). */
  label: string;
}

/** The chip for `label`: its size, never wider than `maxWidth`, and the label cut with an ellipsis to fit it. */
function fitChip(theme: Theme, aspect: Aspect, label: string, maxWidth: number): { width: number; height: number; label: string } {
  const { size, lineHeight } = theme.type.label[aspect];
  const { spacing } = theme;
  const chrome = size + spacing.xs + 2 * spacing.md;
  const maxChars = Math.max(1, Math.floor((maxWidth - chrome) / (size * AVG_CHAR_EM)));
  const fitted = label.length <= maxChars ? label : `${label.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  return {
    width: Math.min(maxWidth, Math.ceil(chrome + fitted.length * size * AVG_CHAR_EM)),
    height: Math.ceil(size * lineHeight + 2 * spacing.xs),
    label: fitted,
  };
}

/** Where the docked component and the content go inside `slot` (the content area when there is none). Pure. */
export function pinnedLayout(theme: Theme, aspect: Aspect, corner: PinnedCorner = "topRight", slot?: Rect, chipLabel = ""): PinnedLayout {
  const area = slot ?? contentArea(theme, aspect);
  const gap = theme.spacing.lg;
  const right = corner.endsWith("Right");
  const bottom = corner.startsWith("bottom");
  const tall = aspect === "9:16";

  // The docked component lays out a window's width on its own frame, scaled to its share of the frame.
  const dockWidth = windowWidth(theme, aspect, area).width;
  const width = MIN_PINNED_SHARE * frameSize(aspect).width;
  const scale = width / dockWidth;
  const dockHeight = Math.min(area.height, Math.round(dockWidth * DOCK_RATIO[aspect]));
  const height = dockHeight * scale;
  const dock = { x: area.x + (area.width - dockWidth) / 2, y: area.y + (area.height - dockHeight) / 2, width: dockWidth, height: dockHeight };
  const x = tall ? area.x + (area.width - width) / 2 : right ? area.x + area.width - width : area.x;
  const y = bottom ? area.y + area.height - height : area.y;
  const content = tall
    ? { x: area.x, y: bottom ? area.y : y + height + gap, width: area.width, height: area.height - height - gap }
    : { x: right ? area.x : x + width + gap, y: area.y, width: area.width - width - gap, height: area.height };
  const room = tall ? content.height / area.height : content.width / area.width;
  if (width <= area.width && room >= MIN_CONTENT_SHARE) return { mode: "dock", scale, dock, pinned: { x, y, width, height }, content, label: "" };

  // No room to dock at 40%: a chip in a band at the top or bottom, no wider than the text column, the content below or above it.
  const chip = fitChip(theme, aspect, chipLabel, Math.min(area.width, textColumn(theme, aspect).width));
  const chipX = tall ? area.x + (area.width - chip.width) / 2 : right ? area.x + area.width - chip.width : area.x;
  const chipY = bottom ? area.y + area.height - chip.height : area.y;
  return {
    mode: "chip",
    scale: 1,
    dock,
    pinned: { x: chipX, y: chipY, width: chip.width, height: chip.height },
    content: { x: area.x, y: bottom ? area.y : chipY + chip.height + gap, width: area.width, height: area.height - chip.height - gap },
    label: chip.label,
  };
}

/** A chip's icon and name for a pinned component with neither of its own, by kind. */
const KINDS: Record<string, { icon: IconName; label: string }> = {
  ChatWindow: { icon: "chat", label: "Chat" },
  TerminalWindow: { icon: "terminal", label: "Terminal" },
  CodeWindow: { icon: "code", label: "Code" },
  BrowserWindow: { icon: "globe", label: "Browser" },
  AppWindow: { icon: "file", label: "Window" },
};

/** The chip's icon and label for a pinned component: its own icon and title, or its kind's. */
export function chipFor(spec: SlotContent): { icon: IconName; label: string } {
  const props = spec.props ?? {};
  const text = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value : undefined);
  const channel = text(props.channel);
  const kind = KINDS[spec.component] ?? { icon: "box", label: spec.component };
  const label = text(props.title) ?? (channel === undefined ? undefined : `#${channel}`) ?? text(props.url) ?? kind.label;
  const icon = typeof props.icon === "string" && isIconName(props.icon) ? props.icon : kind.icon;
  return { icon, label };
}

function componentOf(spec: SlotContent) {
  const Component = typeof spec?.component === "string" && Object.hasOwn(kit, spec.component) ? kit[spec.component] : undefined;
  if (Component === undefined) throw new Error(`Pinned: unknown component "${String(spec?.component)}"`);
  return Component;
}

/** Draws the docked component's full frame, laid out in `dock`, scaled so `dock` lands on `box`. Unclipped. */
function DockedFrame({ spec, Component, progress, theme, aspect, dock, box, scale }: {
  spec: SlotContent;
  Component: KitComponent;
  progress: number;
  theme: Theme;
  aspect: Aspect;
  dock: Rect;
  box: Rect;
  scale: number;
}) {
  const { width, height } = frameSize(aspect);
  return (
    <div
      data-pinned-frame=""
      style={{
        position: "absolute",
        left: box.x - dock.x * scale,
        top: box.y - dock.y * scale,
        width,
        height,
        transform: `scale(${scale})`,
        transformOrigin: "0 0",
      }}
    >
      <Component {...spec.props} progress={progress} theme={theme} aspect={aspect} area={dock} />
    </div>
  );
}

/** A pill with the docked component's icon and name, carrying its `shareId` so the window morphs into it. */
function PinnedChip({ spec, label, progress, theme, aspect, box }: { spec: SlotContent; label: string; progress: number; theme: Theme; aspect: Aspect; box: Rect }) {
  const { icon } = chipFor(spec);
  const shareId = typeof spec.props?.shareId === "string" ? spec.props.shareId : undefined;
  const { colors, spacing, radius, cardShadow } = theme;
  const labelSpec = theme.type.label[aspect];
  const time = useSceneTime(progress);
  const { leadMs, fx } = theme.motion;
  const chipOpacity = Math.min(fade(fx, time.ms - leadMs), exitOpacity(theme, time, fx.ms));
  return (
    <div
      data-pinned-chip=""
      data-block="pinned chip"
      {...(shareId === undefined ? {} : { "data-share-id": shareId })}
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        boxSizing: "border-box",
        opacity: chipOpacity,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        padding: `0 ${spacing.md}px`,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        border: `${theme.hairline}px solid ${colors.border}`,
        boxShadow: `0 ${cardShadow.y}px ${cardShadow.blur}px ${withAlpha(colors.shadow, cardShadow.opacity)}`,
      }}
    >
      <Icon name={icon} size={labelSpec.size} color={colors.accent} />
      {/* Already cut to fit (see `pinnedLayout`): nothing is clipped. */}
      <span style={{ whiteSpace: "nowrap", fontFamily: theme.fonts.body, ...typeCss(labelSpec), color: colors.text }}>
        {label}
      </span>
    </div>
  );
}

export function Pinned({ progress, theme, aspect, area, pinned, content, corner = "topRight", arrive = "settled" }: PinnedProps) {
  const layout = pinnedLayout(theme, aspect, corner, area, chipFor(pinned).label);
  // Checked even when it shows as a chip, so a typo never passes silently.
  const Docked = componentOf(pinned);
  const Content = content === undefined ? undefined : componentOf(content);
  // Settled, the docked component runs a whole scene ahead: past its entrance from the first frame, still leaving with the scene.
  const { endMs } = useSceneTime(progress);
  const ahead = arrive === "settled" ? -endMs : 0;

  return (
    <div data-pinned={corner} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%" }}>
      {Content !== undefined && (
        <div data-pinned-content="" style={{ display: "contents" }}>
          <VisibleRectContext.Provider value={layout.content}>
            <Content {...content!.props} progress={progress} theme={theme} aspect={aspect} area={layout.content} />
          </VisibleRectContext.Provider>
        </div>
      )}
      <MotionDelay ms={ahead}>
        {layout.mode === "dock" ? (
          <DockedFrame spec={pinned} Component={Docked} progress={progress} theme={theme} aspect={aspect} dock={layout.dock} box={layout.pinned} scale={layout.scale} />
        ) : (
          <PinnedChip spec={pinned} label={layout.label} progress={progress} theme={theme} aspect={aspect} box={layout.pinned} />
        )}
      </MotionDelay>
    </div>
  );
}
