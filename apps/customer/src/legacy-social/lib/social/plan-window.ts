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

/** How many days after the start the posting service lets a plan run at most (the last day of its fourth week). */
const MOST_DAYS_AFTER_START = 27;

const addDays = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * The last day a post may fall on: the day before the plan renews, so a plan never runs into the next paid month. It is at most four weeks
 * after the start (the most the posting service writes in one go). Null when the renewal is not known or is not after the start, and the plan
 * is then written as it was, with no end day.
 */
export function planEndDay({ start, renewsOn }: { readonly start: string; readonly renewsOn: string | null }): string | null {
  if (renewsOn === null) return null;
  const lastPaidDay = addDays(renewsOn, -1);
  if (lastPaidDay < start) return null;
  const latest = addDays(start, MOST_DAYS_AFTER_START);
  return lastPaidDay < latest ? lastPaidDay : latest;
}

/** Whether a post on `from` may go to `to`: a post of the paid month stays inside it (before the renewal day), and one already on or past the renewal day is not held back. */
export const staysInMonth = (from: string | null, to: string, renewsOn: string | null): boolean => renewsOn === null || (from !== null && from >= renewsOn) || to < renewsOn;
