import { addDays, localDateIn } from "../../lib/calendar/local-date";
import { GoogleAccessLost } from "../google/oauth";
import { isRetryable, mapPaced, withBackoff, type PaceOptions } from "../google/pace";
import { Ga4Error, type Ga4Failure, type Ga4Reader } from "./client";
import { channelList, channelRequest, dailyRequest, dailyRows, pageList, pageRequest, type DailyRow, type Ga4Report, type Ga4ReportRequest, type ListRow } from "./report";

/*
 * The nightly Google Analytics pull (plan 61, gate G1). For every business with a Google Analytics property it writes the
 * daily numbers to metric_daily as `ga4.*`, the month's channel and page lists to metric_breakdowns (source `ga4`) and one
 * note of the attempt to report_source_runs. The first pull reaches back 60 days, so the customer's screen can compare with
 * the 30 days before; after that it pulls the last 3 days again, because Google revises recent days. A property that answers
 * "no access" or "no such property" is marked access_lost and tried again each night, so a customer who fixes the grant comes back by
 * itself. One business failing never stops the others.
 */

export const FIRST_PULL_DAYS = 60;
export const REPULL_DAYS = 3;

export interface SyncOptions {
  readonly pace?: PaceOptions;
}
/** Google Analytics dates follow the property's own time zone; India's day is the one the customer reads. */
export const REPORT_TIME_ZONE = "Asia/Kolkata";

export type SourceStatus = "connected" | "access_lost";

/** Everything the job reads or writes outside Google, so it is tested without a database. */
export interface Ga4Store {
  readonly properties: () => Promise<readonly { readonly businessId: string; readonly propertyId: string }[]>;
  readonly latestDay: (businessId: string) => Promise<string | null>;
  readonly writeDaily: (businessId: string, rows: readonly DailyRow[], now: Date) => Promise<void>;
  readonly writeList: (businessId: string, month: string, dimension: "channel" | "page", rows: readonly ListRow[], now: Date) => Promise<void>;
  readonly recordRun: (businessId: string, windowStart: string, windowEnd: string, error: string | null, now: Date) => Promise<void>;
  readonly setStatus: (businessId: string, status: SourceStatus, error: string | null, now: Date) => Promise<void>;
}

export interface Ga4SyncReport {
  readonly properties: number;
  readonly ok: number;
  readonly accessLost: number;
  readonly failed: number;
  /** Business id and failure class only: never a property id or Google's words. */
  readonly failures: readonly { readonly businessId: string; readonly failure: Ga4Failure | "error" }[];
  /** The least of the daily request budget left on any property that answered, or null when Google did not say. */
  readonly lowestDailyTokens: number | null;
}

export const daysBetween = (start: string, end: string): string[] => {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
};

/** The days to pull: back to the first pull on the first run, otherwise the last 3 days again, reaching back over a gap if the job missed nights. */
export function pullWindow(latestDay: string | null, yesterday: string, repullDays: number = REPULL_DAYS): { readonly start: string; readonly end: string } {
  const farthest = addDays(yesterday, -(FIRST_PULL_DAYS - 1));
  if (latestDay === null) return { start: farthest, end: yesterday };
  const start = addDays(latestDay, -(repullDays - 1));
  return { start: start < farthest ? farthest : start > yesterday ? yesterday : start, end: yesterday };
}

const monthStart = (day: string): string => `${day.slice(0, 7)}-01`;

/** The month the window ends in (so far), and the whole month before it when the window reaches back into it. */
export function monthsOf(start: string, end: string): { readonly month: string; readonly startDate: string; readonly endDate: string }[] {
  const endMonth = monthStart(end);
  const parts = [{ month: endMonth, startDate: endMonth, endDate: end }];
  if (start < endMonth) {
    const lastDayBefore = addDays(endMonth, -1);
    parts.unshift({ month: monthStart(lastDayBefore), startDate: monthStart(lastDayBefore), endDate: lastDayBefore });
  }
  return parts;
}

async function pullOne(ask: Asker, store: Ga4Store, businessId: string, propertyId: string, yesterday: string, now: Date): Promise<void> {
  const window = pullWindow(await store.latestDay(businessId), yesterday);
  const daily = await ask(propertyId, dailyRequest({ startDate: window.start, endDate: window.end }));
  await store.writeDaily(businessId, dailyRows(daily, daysBetween(window.start, window.end)), now);
  for (const part of monthsOf(window.start, window.end)) {
    const range = { startDate: part.startDate, endDate: part.endDate };
    const channels = channelList(await ask(propertyId, channelRequest(range)));
    const pages = pageList(await ask(propertyId, pageRequest(range)));
    // An empty list is left out, so a missing source reads as absent, never as empty (plan 56).
    if (channels.length > 0) await store.writeList(businessId, part.month, "channel", channels, now);
    if (pages.length > 0) await store.writeList(businessId, part.month, "page", pages, now);
  }
  await store.recordRun(businessId, window.start, window.end, null, now);
  await store.setStatus(businessId, "connected", null, now);
}

type Asker = (propertyId: string, request: Ga4ReportRequest) => Promise<Ga4Report>;

export async function runGa4Sync(reader: Ga4Reader, store: Ga4Store, now: Date, options: SyncOptions = {}): Promise<Ga4SyncReport> {
  const yesterday = addDays(localDateIn(REPORT_TIME_ZONE, now), -1);
  const properties = await store.properties();
  let lowestDailyTokens: number | null = null;
  // Slow down and unavailable are retried with growing waits; every answer's quota note is kept so the lowest is reported.
  const ask: Asker = async (propertyId, request) => {
    const report = await withBackoff(() => reader.runReport(propertyId, request), isRetryable, options.pace);
    const remaining = report.propertyQuota?.tokensPerDay?.remaining;
    if (remaining !== undefined && (lowestDailyTokens === null || remaining < lowestDailyTokens)) lowestDailyTokens = remaining;
    return report;
  };
  const outcomes = await mapPaced(
    properties,
    async ({ businessId, propertyId }): Promise<"ok" | "lost" | { readonly businessId: string; readonly failure: Ga4Failure | "error" }> => {
      try {
        await pullOne(ask, store, businessId, propertyId, yesterday, now);
        return "ok";
      } catch (error) {
        // The Brandbasket account itself was refused: every business would fail the same way, so the run stops and says so.
        if (error instanceof GoogleAccessLost) throw error;
        const failure = error instanceof Ga4Error ? error.failure : "error";
        // Not our side's fault: the grant was removed, or the property id is wrong. Staff see the class in the console.
        const lost = failure === "access_lost" || failure === "bad_property";
        // The window is only a label for the failed attempt here; the numbers already stored stay as they were.
        await store.recordRun(businessId, yesterday, yesterday, failure, now);
        if (!lost) return { businessId, failure };
        await store.setStatus(businessId, "access_lost", failure, now);
        return "lost";
      }
    },
    options.pace,
  );
  const failures = outcomes.filter((outcome) => typeof outcome === "object");
  return {
    properties: properties.length,
    ok: outcomes.filter((outcome) => outcome === "ok").length,
    accessLost: outcomes.filter((outcome) => outcome === "lost").length,
    failed: failures.length,
    failures,
    lowestDailyTokens,
  };
}
