/*
 * When a plan of written posts starts, so that it follows the month the customer pays for. The posting service writes a batch from a start
 * day (tomorrow or later); left alone it starts on the next Monday, which has nothing to do with the paid month. These work on plain
 * `YYYY-MM-DD` days in India time.
 */

const DAY_MS = 86_400_000;

/** The day after a `YYYY-MM-DD` day. */
export const dayAfter = (day: string): string => new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/**
 * The day the first batch of a customer who has no plan yet starts: tomorrow, the first day a post can still be looked over and approved. Not
 * the next Monday, which could be six days away.
 */
export const firstStartDay = (today: string): string => dayAfter(today);

/**
 * The day a further month starts. It follows the renewal: the day the paid period runs out is the first day of the next one. It never starts
 * before `earliest` (the day the posting service would start it, the Monday after the plan ends, so two plans never overlap) and never
 * before tomorrow. Without a renewal day it starts on `earliest`, as before.
 */
export function nextStartDay({ today, earliest, renewsOn }: { readonly today: string; readonly earliest: string; readonly renewsOn: string | null }): string {
  const floor = earliest > dayAfter(today) ? earliest : dayAfter(today);
  return renewsOn !== null && renewsOn > floor ? renewsOn : floor;
}

/** The `YYYY-MM-DD` day (India time) a paid-through moment falls on, or null when there is none. */
export function renewalDay(paidThroughAt: Date | null, dayOf: (at: Date) => string): string | null {
  return paidThroughAt === null || Number.isNaN(paidThroughAt.getTime()) ? null : dayOf(paidThroughAt);
}
