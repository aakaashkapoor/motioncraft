// Shared vocabulary for the chart components: the data shape, number
// formatting, a "nice" axis maximum, prop validation and the emphasized
// datum. Pure.

export interface ChartDatum {
  label: string;
  value: number;
  /** Marks the one datum that carries the accent. */
  emphasis?: boolean;
}

export interface ChartValueFormat {
  prefix?: string;
  suffix?: string;
  /** Fixed decimals; default 0. */
  decimals?: number;
}

/** `1250` with `{prefix:"$"}` -> `$1,250`; fixed decimals, thousands separators. */
export function formatChartValue(value: number, format: ChartValueFormat): string {
  const decimals = format.decimals ?? 0;
  const body = value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${format.prefix ?? ""}${body}${format.suffix ?? ""}`;
}

/** The smallest 1, 2, 2.5 or 5 x 10^n that is >= `max` (1 when `max` <= 0). */
export function niceMax(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const exponent = Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = Number((step * 10 ** exponent).toPrecision(12));
    if (candidate >= max) return candidate;
  }
  return 10 ** (exponent + 1);
}

/** Problems with a chart's `data` prop; `[]` when it is fine. */
export function chartErrors(data: unknown): string[] {
  if (!Array.isArray(data)) return ["data must be an array of { label, value } items"];
  const errors: string[] = [];
  if (data.length < 1 || data.length > 12) errors.push(`data must have 1-12 items, got ${data.length}`);
  let emphasized = 0;
  data.forEach((item: unknown, i) => {
    const d = (item ?? {}) as Record<string, unknown>;
    if (typeof d.label !== "string" || d.label.trim() === "") errors.push(`data[${i}].label must be a non-empty string`);
    if (typeof d.value !== "number" || !Number.isFinite(d.value) || d.value < 0) {
      errors.push(`data[${i}].value must be a finite number >= 0`);
    }
    if (d.emphasis !== undefined && typeof d.emphasis !== "boolean") errors.push(`data[${i}].emphasis must be a boolean`);
    if (d.emphasis === true) emphasized += 1;
  });
  if (emphasized > 1) errors.push(`at most one item may have emphasis, got ${emphasized}`);
  return errors;
}

/** The emphasized index, or the index of the largest value when none is marked. */
export function emphasisIndex(data: ChartDatum[]): number {
  const marked = data.findIndex((d) => d.emphasis === true);
  if (marked >= 0) return marked;
  let best = 0;
  data.forEach((d, i) => {
    if (d.value > data[best]!.value) best = i;
  });
  return best;
}
