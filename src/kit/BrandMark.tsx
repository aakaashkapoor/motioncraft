// A brand's mark box: a built-in icon on an accent tile, or the brand's own
// image (`logo`) drawn as it is, contained in the same box. The caller moves
// it (opacity and scale); the icon tile gets the shine once it has popped.
// A logo gets no shine: across its transparent parts the band would show as
// a stray rectangle.

import { Icon } from "../icons";
import type { Theme } from "../theme/types";
import { mediaUrl } from "./mediaSource";
import { Shine } from "./shine";

export interface BrandMarkProps {
  theme: Theme;
  /** The box's side, in px. */
  size: number;
  /** The icon on the accent tile (see `ICON_NAMES`), when there is no logo. Default "play". */
  icon?: string;
  /** A local image file, relative to the storyboard; replaces the icon tile. */
  logo?: string;
  opacity: number;
  scale: number;
  /** Ms since the shine starts crossing the icon tile. Default never. */
  shineElapsedMs?: number;
  /** Data attributes for the box (which part of its component it is). */
  data?: Record<`data-${string}`, string>;
}

export function BrandMark({ theme, size, icon = "play", logo, opacity, scale, shineElapsedMs = -Infinity, data }: BrandMarkProps) {
  const { colors, radius } = theme;
  return (
    <div
      {...data}
      style={{
        position: "relative",
        flex: "none",
        width: size,
        height: size,
        borderRadius: radius.md,
        ...(logo === undefined && { backgroundColor: colors.accent }),
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        transform: `scale(${Math.round(Math.max(0, scale) * 1000) / 1000})`,
      }}
    >
      {logo === undefined ? (
        <>
          <Icon name={icon} size={Math.round(size * 0.5)} color={colors.surface} />
          <Shine theme={theme} size={{ width: size, height: size }} elapsedMs={shineElapsedMs} radius={radius.md} />
        </>
      ) : (
        <img data-logo="" src={mediaUrl(logo)} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} />
      )}
    </div>
  );
}
