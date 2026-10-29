const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface CountdownBlock {
  readonly value: number;
  readonly unit: "day" | "hour" | "minute";
}

/**
 * The time left to a call as the blocks the Home countdown draws: days and hours from a day out, hours and minutes
 * from an hour out, minutes after that. Never seconds, never a negative figure: nothing is left once the time is
 * reached. Whole units, rounded down, so it never says a call is sooner than it is.
 */
export function countdownBlocks(msLeft: number): readonly CountdownBlock[] {
  if (msLeft < MINUTE_MS) return [];
  if (msLeft >= DAY_MS) return [{ value: Math.floor(msLeft / DAY_MS), unit: "day" }, { value: Math.floor((msLeft % DAY_MS) / HOUR_MS), unit: "hour" }];
  if (msLeft >= HOUR_MS) return [{ value: Math.floor(msLeft / HOUR_MS), unit: "hour" }, { value: Math.floor((msLeft % HOUR_MS) / MINUTE_MS), unit: "minute" }];
  return [{ value: Math.floor(msLeft / MINUTE_MS), unit: "minute" }];
}

const plural = (block: CountdownBlock): string => `${block.value} ${block.unit}${block.value === 1 ? "" : "s"}`;

/** The same countdown in words, for a screen reader and the page's text: "1 day and 1 hour", "18 minutes", "now". */
export function countdownLabel(msLeft: number): string {
  const blocks = countdownBlocks(msLeft);
  if (blocks.length === 0) return "now";
  return blocks.map(plural).join(" and ");
}
