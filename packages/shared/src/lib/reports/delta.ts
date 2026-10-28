/**
 * How a figure moved against the month before. A change is only stated when both months were measured: a first month, or a
 * source that was not connected last month, has nothing to compare, and the report leaves the comparison out instead of
 * inventing a baseline.
 */
export type DeltaDirection = "up" | "down" | "same";

export interface Delta {
  readonly direction: DeltaDirection;
  /** How far it moved, always zero or more. */
  readonly amount: number;
}

export function compare(current: number | null, previous: number | null): Delta | null {
  if (current === null || previous === null) return null;
  if (current === previous) return { direction: "same", amount: 0 };
  return current > previous ? { direction: "up", amount: current - previous } : { direction: "down", amount: previous - current };
}

const COUNT = new Intl.NumberFormat("en-IN");

/** "6 more than September", "46 fewer than September", "Same as September". A fall is worded as plainly as a rise. */
export function describeChange(delta: Delta | null, previousMonthName: string): string | null {
  if (delta === null) return null;
  if (delta.direction === "same") return `Same as ${previousMonthName}`;
  return `${COUNT.format(delta.amount)} ${delta.direction === "up" ? "more" : "fewer"} than ${previousMonthName}`;
}
