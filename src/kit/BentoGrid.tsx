// A dashboard beat: a bento grid of 3-6 rounded cards in palette colours,
// arriving in a quick cascade (70 ms apart, a short scale-and-rise), each
// card's own motion starting as it lands: a big stat counting up over a small
// line chart, a title with a toggle that flips on, a progress ring drawing,
// bars growing, a sentence in the italic display serif beside a keyframe
// track. Every card is drawn in its fill's ink; settled by 1.5 s.

import { contrastRatio } from "../theme/contrast";
import { CardFace } from "./bentoCards";
import { DEFAULT_FILL, bentoFill, bentoGridErrors, bentoGridLayout, bentoTiming, SETTLED_MS, type BentoCard } from "./bentoGridPlan";
import { entering, useSceneTime } from "./frameContext";
import { arrive, exitOpacity } from "./motion";
import type { KitProps } from "./types";

export interface BentoGridProps extends KitProps {
  /** 3-6 cards; see `BentoCard`. */
  cards: BentoCard[];
}

/** A card starts this much smaller and this far below where it lands. */
const FROM_SCALE = 0.9;
/** A fill this close to the ground gets a hairline, so the card still reads. */
const OUTLINE_BELOW = 1.3;

const r2 = (n: number) => Math.round(n * 100) / 100 || 0;

export function BentoGrid(props: BentoGridProps) {
  const errors = bentoGridErrors(props as unknown as Record<string, unknown>);
  if (errors.length > 0) throw new Error(`BentoGrid: ${errors.join("; ")}`);
  const { progress, theme, aspect, area: slot, cards } = props;
  const { colors, spacing } = theme;
  const layout = bentoGridLayout(theme, aspect, cards, slot);
  const timing = bentoTiming(theme, cards.length);
  const time = useSceneTime(progress);
  const { ms } = entering(time);
  const { box } = layout;

  return (
    <div data-block="BentoGrid" style={{ position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height, opacity: r2(exitOpacity(theme, time, SETTLED_MS)) }}>
      {layout.cards.map((placed, i) => {
        const card = cards[placed.index]!;
        const { color, ink } = bentoFill(theme, card.fill ?? DEFAULT_FILL[card.kind]);
        const { move, opacity } = arrive(theme, ms, timing.starts[i]!);
        const { cell } = placed;
        return (
          <div
            key={placed.index}
            data-bento-card={card.kind}
            style={{
              position: "absolute",
              left: cell.x,
              top: cell.y,
              width: cell.width,
              height: cell.height,
              borderRadius: placed.radius,
              backgroundColor: color,
              ...(contrastRatio(color, colors.ground) < OUTLINE_BELOW && { boxShadow: `inset 0 0 0 2px ${colors.border}` }),
              opacity: r2(opacity),
              ...(move !== 1 && { transform: `translateY(${r2((1 - move) * spacing.md)}px) scale(${r2(FROM_SCALE + (1 - FROM_SCALE) * move)})`, transformOrigin: "50% 100%" }),
            }}
          >
            <CardFace p={{ theme, color, ink, ms, start: timing.inner[i]!, dur: timing.innerMs[i]! }} card={card} content={placed.content} />
          </div>
        );
      })}
    </div>
  );
}
