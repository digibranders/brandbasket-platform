import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

/*
 * One scale places a chart's marks, ticks and labels (plan 60, section 11). Pure functions, so the geometry is unit tested
 * and the components only draw what these return.
 */

/** How a chart writes its values: a count, a share in percent, or money in minor units. */
export type ChartFormat = "number" | "percent" | { readonly money: MoneyCurrency };

export function formatChartValue(value: number, format: ChartFormat = "number"): string {
  if (format === "number") return formatNumber(value);
  if (format === "percent") return formatPercent(value);
  return formatMoney(value, format.money);
}

/** A round step of 1, 2 or 5 times a power of ten, at least as big as `raw`. */
export function niceStep(raw: number): number {
  const safe = raw > 0 && Number.isFinite(raw) ? raw : 1;
  const power = 10 ** Math.floor(Math.log10(safe));
  const fraction = safe / power;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
}

export interface ValueScaleOptions {
  /** The pixel row of the top of the plot and of its bottom. */
  readonly top: number;
  readonly bottom: number;
  /** Start the axis at zero. Off for ranks and for values that never come near zero. */
  readonly zero?: boolean;
  /** Smaller is better and sits at the top: search positions, where 1 is the top (plan 60, section 11). */
  readonly invert?: boolean;
  /** Roughly how many gaps between gridlines. */
  readonly gaps?: number;
}

export interface ValueScale {
  /** The gridline values, from the bottom of the axis domain to its top. */
  readonly ticks: readonly number[];
  readonly min: number;
  readonly max: number;
  /** The pixel row of a value. */
  readonly y: (value: number) => number;
}

/** The vertical scale for a set of values, rounded out to whole steps so the gridlines land on round numbers. */
export function valueScale(values: readonly number[], options: ValueScaleOptions): ValueScale {
  const { top, bottom, zero = options.invert !== true, invert = false, gaps = 4 } = options;
  if (values.length === 0) throw new RangeError("A chart scale needs at least one value.");
  const highest = Math.max(...values);
  const lowest = zero ? Math.min(0, ...values) : Math.min(...values);
  const step = niceStep((highest - lowest) / gaps);
  const min = Math.floor(lowest / step) * step;
  let max = Math.ceil(highest / step) * step;
  if (max === min) max = min + step;
  const count = Math.round((max - min) / step);
  // Rounded to 9 places so 0.1 + 0.2 lands on 0.3 and the labels stay short.
  const ticks = Array.from({ length: count + 1 }, (_, index) => Math.round((min + index * step) * 1e9) / 1e9);
  const span = max - min;
  const height = bottom - top;
  const y = (value: number) => (invert ? top + (height * (value - min)) / span : top + height * (1 - (value - min) / span));
  return { ticks, min, max, y };
}

/** The pixel column of each of `count` points spread from `left` to `right`. One point sits in the middle. */
export function xPositions(count: number, left: number, right: number): readonly number[] {
  if (count === 1) return [(left + right) / 2];
  return Array.from({ length: count }, (_, index) => left + (index * (right - left)) / (count - 1));
}

/** Every nth label, so at most `most` labels show along the bottom. */
export function labelEvery(count: number, most = 6): number {
  return Math.max(1, Math.ceil(count / most));
}

/** The index of the point nearest a pixel column. */
export function nearestIndex(positions: readonly number[], x: number): number {
  let best = 0;
  positions.forEach((position, index) => {
    if (Math.abs(position - x) < Math.abs((positions[best] ?? position) - x)) best = index;
  });
  return best;
}

/** A sparkline's points in a box `width` by `height`, with one pixel kept clear at the top and bottom. */
export function sparkPoints(values: readonly number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  const range = highest - lowest || 1;
  const xs = xPositions(values.length, 0, width);
  return values.map((value, index) => `${round(xs[index] ?? 0)},${round(height - 1 - ((value - lowest) / range) * (height - 2))}`).join(" ");
}

/** A bar's length as a share of the longest, 0 to 100. Negative values draw nothing. */
export function barShare(value: number, longest: number): number {
  if (longest <= 0 || value <= 0) return 0;
  return Math.min(100, (value / longest) * 100);
}

/** Coordinates to one decimal: enough for an SVG at any size and short in the markup. */
export function round(value: number): number {
  return Math.round(value * 10) / 10;
}
