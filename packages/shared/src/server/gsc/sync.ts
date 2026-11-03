import { localDateIn } from "../../lib/calendar/local-date";
import { daysBetween, monthsOf, pullWindow, REPORT_TIME_ZONE } from "../ga4/sync";
import type { DailyRow, ListRow } from "../ga4/report";
import { GoogleAccessLost } from "../google/oauth";
import { isRetryable, mapPaced, withBackoff, type PaceOptions } from "../google/pace";
import { GscError, type GscFailure, type GscReader, type SearchAnalyticsRequest, type SearchAnalyticsRows } from "./client";
import { dailyRequest, dailyRows, finalDay, listRequest, topList } from "./report";

/*
 * The nightly Search Console pull (plan 62). For every business with a Search Console site it writes the daily clicks,
 * impressions and average position to metric_daily as `gsc.*`, the month's top searches and pages to metric_breakdowns (source
 * `gsc`) and one note of the attempt to report_source_runs. Search Console finishes a day about three days late, so the window
 * ends on the last finished day and a later day is "not measured", never zero. First pull 60 days, then the last 7 again.
 * A site that answers "no access" or "no such site" is marked access_lost and tried again each night. One business failing
 * never stops the others; the Brandbasket account being refused stops the run.
 */

export const GSC_REPULL_DAYS = 7;

export interface GscStore {
  readonly sites: () => Promise<readonly { readonly businessId: string; readonly siteUrl: string }[]>;
  readonly latestDay: (businessId: string) => Promise<string | null>;
  readonly writeDaily: (businessId: string, rows: readonly DailyRow[], now: Date) => Promise<void>;
  readonly writeList: (businessId: string, month: string, dimension: "query" | "page", rows: readonly ListRow[], now: Date) => Promise<void>;
  readonly recordRun: (businessId: string, windowStart: string, windowEnd: string, error: string | null, now: Date) => Promise<void>;
  readonly setStatus: (businessId: string, status: "connected" | "access_lost", error: string | null, now: Date) => Promise<void>;
}

export interface GscSyncReport {
  readonly sites: number;
  readonly ok: number;
  readonly accessLost: number;
  readonly failed: number;
  /** Business id and failure class only: never a site address or Google's words. */
  readonly failures: readonly { readonly businessId: string; readonly failure: GscFailure | "error" }[];
}

type Asker = (siteUrl: string, request: SearchAnalyticsRequest) => Promise<SearchAnalyticsRows>;

async function pullOne(ask: Asker, store: GscStore, businessId: string, siteUrl: string, end: string, now: Date): Promise<void> {
  const window = pullWindow(await store.latestDay(businessId), end, GSC_REPULL_DAYS);
  const daily = await ask(siteUrl, dailyRequest(window.start, window.end));
  await store.writeDaily(businessId, dailyRows(daily, daysBetween(window.start, window.end)), now);
  for (const part of monthsOf(window.start, window.end)) {
    for (const dimension of ["query", "page"] as const) {
      const rows = topList(await ask(siteUrl, listRequest(dimension, part.startDate, part.endDate)));
      // An empty list is left out, so a missing source reads as absent, never as empty (plan 56).
      if (rows.length > 0) await store.writeList(businessId, part.month, dimension, rows, now);
    }
  }
  await store.recordRun(businessId, window.start, window.end, null, now);
  await store.setStatus(businessId, "connected", null, now);
}

export async function runGscSync(reader: GscReader, store: GscStore, now: Date, options: { readonly pace?: PaceOptions } = {}): Promise<GscSyncReport> {
  const end = finalDay(localDateIn(REPORT_TIME_ZONE, now));
  const sites = await store.sites();
  const ask: Asker = (siteUrl, request) => withBackoff(() => reader.searchAnalytics(siteUrl, request), isRetryable, options.pace);
  const outcomes = await mapPaced(
    sites,
    async ({ businessId, siteUrl }): Promise<"ok" | "lost" | { readonly businessId: string; readonly failure: GscFailure | "error" }> => {
      try {
        await pullOne(ask, store, businessId, siteUrl, end, now);
        return "ok";
      } catch (error) {
        if (error instanceof GoogleAccessLost) throw error;
        const failure = error instanceof GscError ? error.failure : "error";
        const lost = failure === "access_lost" || failure === "bad_property";
        await store.recordRun(businessId, end, end, failure, now);
        if (!lost) return { businessId, failure };
        await store.setStatus(businessId, "access_lost", failure, now);
        return "lost";
      }
    },
    options.pace,
  );
  const failures = outcomes.filter((outcome) => typeof outcome === "object");
  return { sites: sites.length, ok: outcomes.filter((outcome) => outcome === "ok").length, accessLost: outcomes.filter((outcome) => outcome === "lost").length, failed: failures.length, failures };
}

