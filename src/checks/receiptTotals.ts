// A layer-1 warning for receipts whose numbers do not add up: the author
// supplies every amount, and a total that disagrees with its rows would only
// show in the render. A summary row labelled "Subtotal" restates the items,
// so it is checked against them rather than added; every other summary row
// (tax, tip, fees) adds to the total. Pure.

import { formatChartValue, type ChartValueFormat } from "../kit/chart";
import { sceneComponents } from "../storyboard/components";
import type { Storyboard } from "../storyboard/types";

/** Sums may differ by rounding up to this much. */
const TOLERANCE = 0.01;
const SUBTOTAL = /sub-?\s*total/i;

const amountOf = (row: unknown): number | undefined => {
  const amount = (row as { amount?: unknown } | null)?.amount;
  return typeof amount === "number" && Number.isFinite(amount) ? amount : undefined;
};
const sum = (rows: unknown[]) => rows.reduce<number>((total, row) => total + (amountOf(row) ?? 0), 0);

/** One warning per Receipt (top-level or nested) whose subtotal or total disagrees with its rows by more than 0.01. */
export function receiptTotalWarnings(storyboard: Storyboard): string[] {
  return storyboard.scenes.flatMap((scene) =>
    sceneComponents(scene)
      .filter((use) => use.component === "Receipt")
      .flatMap(({ props }) => {
        const items = Array.isArray(props.items) ? props.items : [];
        const summary = Array.isArray(props.summary) ? props.summary : [];
        const total = amountOf(props.total);
        if (items.length === 0 || total === undefined) return [];
        const format: ChartValueFormat = {
          prefix: typeof props.prefix === "string" ? props.prefix : "$",
          suffix: typeof props.suffix === "string" ? props.suffix : "",
          decimals: typeof props.decimals === "number" ? props.decimals : 2,
        };
        const money = (n: number) => formatChartValue(n, format);
        const itemSum = sum(items);
        const warnings: string[] = [];
        for (const row of summary) {
          const label = (row as { label?: unknown } | null)?.label;
          const amount = amountOf(row);
          if (typeof label === "string" && SUBTOTAL.test(label) && amount !== undefined && Math.abs(amount - itemSum) > TOLERANCE) {
            warnings.push(`the items add up to ${money(itemSum)} but "${label}" says ${money(amount)}`);
          }
        }
        const added = itemSum + sum(summary.filter((row) => !SUBTOTAL.test(String((row as { label?: unknown } | null)?.label ?? ""))));
        if (Math.abs(added - total) > TOLERANCE) warnings.push(`the items and summary add up to ${money(added)} but the total says ${money(total)}`);
        return warnings.map((message) => `warn [receipt-total] scene "${scene.id}": Receipt ${message}`);
      }),
  );
}
