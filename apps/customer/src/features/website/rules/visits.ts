import type { VisitDay, VisitList, VisitSource } from "@brandbasket/db";
import { addDays } from "@brandbasket/shared/lib/calendar/local-date";
import { dayKey } from "@brandbasket/shared/lib/call-slots";
import { APP_TIME_ZONE, formatDate } from "@/lib/format";

/*
 * Website visits for the customer (plan 61, gate G1), from the numbers the nightly jobs roll up: our own tracking script
 * (`own`) or the customer's Google Analytics (`ga4`). Only measured days count. A day with no stored number was not measured,
 * so it is never drawn as a zero, never summed, and a change against the 30 days before is shown only when both windows
 * were measured in full.
 */

export const VISIT_WINDOW_DAYS = 30;

export interface VisitWindow {
  readonly from: string;
  readonly to: string;
  readonly previousFrom: string;
  readonly previousTo: string;
}

/** The 30 days up to yesterday (India), and the 30 before. Today is left out: the nightly job has not counted it yet. */
export function visitWindow(now: Date): VisitWindow {
  const to = addDays(dayKey(now.toISOString(), APP_TIME_ZONE), -1);
  return {
    from: addDays(to, -(VISIT_WINDOW_DAYS - 1)),
    to,
    previousFrom: addDays(to, -(2 * VISIT_WINDOW_DAYS - 1)),
    previousTo: addDays(to, -VISIT_WINDOW_DAYS),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** `3 Nov`, for a chart's axis. */
export function shortDay(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1] ?? ""}`;
}

const dayDate = (day: string): Date => new Date(`${day}T12:00:00+05:30`);

export interface VisitsSummary {
  readonly source: VisitSource;
  readonly total: number;
  /** Percent against the 30 days before, or null when either window was not measured in full or nothing changed. */
  readonly change: number | null;
  /** What the total covers: "Last 30 days", or "Since Tue 3 Nov" when measuring started inside the window. */
  readonly period: string;
  /** Measured days only, oldest first. */
  readonly days: readonly { readonly day: string; readonly value: number }[];
  readonly updatedAt: Date;
}

/** The 30 days' visits from one source's rows, or null when no day in the window was measured. */
export function visitsSummary(source: VisitSource, rows: readonly VisitDay[], window: VisitWindow, now: Date): VisitsSummary | null {
  const visits = rows.filter((row) => row.metric === "visits");
  const current = visits.filter((row) => row.day >= window.from && row.day <= window.to);
  const first = current[0];
  if (first === undefined) return null;
  const total = current.reduce((sum, row) => sum + row.value, 0);
  const previous = visits.filter((row) => row.day >= window.previousFrom && row.day <= window.previousTo);
  const previousTotal = previous.reduce((sum, row) => sum + row.value, 0);
  const full = current.length === VISIT_WINDOW_DAYS && previous.length === VISIT_WINDOW_DAYS && previousTotal > 0;
  const percent = full ? Math.round(((total - previousTotal) / previousTotal) * 100) : 0;
  return {
    source,
    total,
    change: percent === 0 ? null : percent,
    period: current.length === VISIT_WINDOW_DAYS ? `Last ${VISIT_WINDOW_DAYS} days` : `Since ${formatDate(dayDate(first.day), now)}`,
    days: current.map((row) => ({ day: row.day, value: row.value })),
    updatedAt: new Date(Math.max(...current.map((row) => row.fetchedAt.getTime()))),
  };
}

/** Analytics when the customer has connected it and it has numbers, otherwise our own counts. */
export function pickVisits(analytics: VisitsSummary | null, own: VisitsSummary | null): VisitsSummary | null {
  return analytics ?? own;
}

const SOURCE_NOTE: Readonly<Record<VisitSource, string | null>> = { own: null, ga4: "From Google Analytics" };

/** "Updated Tue 3 Nov", and where the numbers came from when it is not our own count. */
export function updatedLine(updatedAt: Date, source: VisitSource, now: Date): string {
  return [`Updated ${formatDate(updatedAt, now)}`, SOURCE_NOTE[source]].filter((part) => part !== null).join(". ");
}

/** What the strip's period line says: the window, and Google Analytics when that is the source. */
export function periodLine(summary: VisitsSummary): string {
  return SOURCE_NOTE[summary.source] === null ? summary.period : `${summary.period}. ${SOURCE_NOTE[summary.source]}`;
}

/** How visitors arrived, in the customer's words. A channel this list does not know is left out rather than guessed. */
export const CHANNEL_LABELS: Readonly<Record<string, string>> = {
  direct: "Direct",
  search: "Search engines",
  social: "Social media",
  email: "Email",
  ai: "AI assistants",
  paid: "Paid ads",
  referral: "Other websites",
};

export interface RankedRow {
  readonly label: string;
  readonly value: number;
}

export interface VisitLists {
  readonly month: string;
  readonly pages: readonly RankedRow[];
  readonly channels: readonly RankedRow[];
  readonly updatedAt: Date;
}

function ranked(list: VisitList | undefined, label: (key: string) => string | null): RankedRow[] {
  if (list === undefined) return [];
  const rows: RankedRow[] = [];
  for (const row of list.rows) {
    const { key, count } = row;
    const text = typeof key === "string" ? label(key) : null;
    if (text !== null && typeof count === "number" && Number.isFinite(count) && count > 0) rows.push({ label: text, value: count });
  }
  return rows;
}

/** The pages and channels of one month, or null when neither was pulled. */
export function visitLists(month: string, lists: readonly VisitList[]): VisitLists | null {
  const pages = ranked(lists.find((list) => list.dimension === "page"), (key) => (key.startsWith("/") ? key : null));
  const channels = ranked(lists.find((list) => list.dimension === "channel"), (key) => CHANNEL_LABELS[key] ?? null);
  if (pages.length === 0 && channels.length === 0) return null;
  return { month, pages, channels, updatedAt: new Date(Math.max(...lists.map((list) => list.fetchedAt.getTime()))) };
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** What a month's lists cover: "November so far" for the month `now` is in, the month's name for an earlier one. */
export function listPeriod(month: string, now: Date): string {
  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? "";
  return month === listMonths(now).current ? `${name} so far` : name;
}

/** The first of the month `now` falls in (India), and of the month before: the lists are pulled per calendar month. */
export function listMonths(now: Date): { readonly current: string; readonly previous: string } {
  const current = `${dayKey(now.toISOString(), APP_TIME_ZONE).slice(0, 7)}-01`;
  return { current, previous: `${addDays(current, -1).slice(0, 7)}-01` };
}
